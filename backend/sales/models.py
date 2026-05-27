# sales/models.py
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from decimal import Decimal
import uuid
from datetime import datetime

# Import from other apps - use string references in ForeignKeys to avoid circular imports
# from customers.models import Customer
# from users.models import User
# from products.models import Product


class Sale(models.Model):
    """
    Sale/Transaction model - Core of POS system.
    Records each sale transaction.
    """
    
    SALE_STATUS = [
        ('completed', 'Completed'),
        ('pending', 'Pending Payment'),
        ('cancelled', 'Cancelled'),
        ('refunded', 'Refunded'),
        ('voided', 'Voided'),
    ]
    
    PAYMENT_STATUS = [
        ('paid', 'Fully Paid'),
        ('partial', 'Partially Paid'),
        ('unpaid', 'Unpaid'),
        ('overpaid', 'Overpaid'),
    ]
    
    # Identifiers
    sale_id = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        db_index=True,
        help_text="Human-readable sale number (e.g., INV-20241215-0001)"
    )
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    # Status
    status = models.CharField(max_length=20, choices=SALE_STATUS, default='pending', db_index=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='unpaid', db_index=True)
    
    # Relationships - using string references
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales',
        help_text="Customer who made the purchase"
    )
    
    cashier = models.ForeignKey(
        'users.User',
        on_delete=models.PROTECT,
        related_name='sales_processed',
        help_text="Cashier who processed the sale"
    )
    
    voided_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales_voided',
        help_text="Manager who voided this sale"
    )
    
    # Financial totals
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('16.00'))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    change_due = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Loyalty & rewards
    loyalty_points_earned = models.IntegerField(default=0)
    loyalty_points_redeemed = models.IntegerField(default=0)
    loyalty_discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Notes
    notes = models.TextField(blank=True)
    void_reason = models.TextField(blank=True)
    
    # Timestamps
    sale_date = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-sale_date']
        indexes = [
            models.Index(fields=['sale_id']),
            models.Index(fields=['status', 'payment_status']),
            models.Index(fields=['sale_date']),
        ]
    
    def __str__(self):
        customer_name = self.customer.name if self.customer else 'Walk-in Customer'
        return f"{self.sale_id} - {customer_name} - {self.total}"
    
    def save(self, *args, **kwargs):
        if not self.sale_id:
            date_str = datetime.now().strftime('%Y%m%d')
            last_sale = Sale.objects.filter(
                sale_id__startswith=f'INV-{date_str}'
            ).order_by('-sale_id').first()
            
            if last_sale:
                try:
                    last_num = int(last_sale.sale_id.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.sale_id = f"INV-{date_str}-{new_num:04d}"
        
        if self.amount_paid >= self.total:
            self.change_due = self.amount_paid - self.total
            self.payment_status = 'paid' if self.amount_paid == self.total else 'overpaid'
        elif self.amount_paid > 0:
            self.change_due = Decimal('0.00')
            self.payment_status = 'partial'
        
        super().save(*args, **kwargs)
    
    def calculate_totals(self):
        items = self.items.all()
        self.subtotal = sum(item.subtotal for item in items)
        self.discount_amount = self.subtotal * (self.discount_percentage / 100)
        taxable_amount = self.subtotal - self.discount_amount
        self.tax_amount = taxable_amount * (self.tax_rate / 100)
        self.total = taxable_amount + self.tax_amount - self.loyalty_discount
        self.save(update_fields=['subtotal', 'discount_amount', 'tax_amount', 'total'])
        return self.total
    
    def add_loyalty_points(self):
        if self.customer and self.status == 'completed':
            points_earned = int(self.total / 100)
            if points_earned > 0:
                self.loyalty_points_earned = points_earned
                self.customer.add_loyalty_points(points_earned)
                self.save(update_fields=['loyalty_points_earned'])
    
    def void_sale(self, voided_by_user, reason):
        if self.status == 'completed':
            for item in self.items.all():
                item.product.stock_quantity += item.quantity
                item.product.save(update_fields=['stock_quantity'])
            
            if self.customer and self.loyalty_points_earned > 0:
                self.customer.loyalty_points -= self.loyalty_points_earned
                self.customer.save(update_fields=['loyalty_points'])
            
            self.status = 'voided'
            self.voided_by = voided_by_user
            self.void_reason = reason
            self.voided_at = datetime.now()
            self.save()
            return True
        return False


class SaleItem(models.Model):
    """
    Individual items within a sale (cart items)
    """
    
    # Using string references for ForeignKeys
    sale = models.ForeignKey(
        'Sale',
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='sale_items'
    )
    
    # Product snapshot (in case product changes later)
    product_name = models.CharField(max_length=200)
    product_sku = models.CharField(max_length=100)
    product_barcode = models.CharField(max_length=100, blank=True)
    
    # Pricing
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1, validators=[MinValueValidator(0.01)])
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Item discount
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0), MaxValueValidator(100)])
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Return tracking
    is_returned = models.BooleanField(default=False)
    returned_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Timestamp
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.quantity} × {self.product_name} - {self.total}"
    
    def save(self, *args, **kwargs):
        self.subtotal = self.unit_price * self.quantity
        self.discount_amount = self.subtotal * (self.discount_percentage / 100)
        self.total = self.subtotal - self.discount_amount
        super().save(*args, **kwargs)
        self.sale.calculate_totals()
    
    def delete(self, *args, **kwargs):
        sale = self.sale
        super().delete(*args, **kwargs)
        sale.calculate_totals()


class Payment(models.Model):
    """
    Payment record for a sale
    Supports multiple payment methods per sale
    """
    
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('mpesa', 'M-Pesa'),
        ('card', 'Credit/Debit Card'),
        ('bank_transfer', 'Bank Transfer'),
        ('loyalty', 'Loyalty Points'),
        ('mixed', 'Mixed Payment'),
    ]
    
    sale = models.ForeignKey('Sale', on_delete=models.CASCADE, related_name='payments')
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    
    # M-Pesa specific
    mpesa_receipt_number = models.CharField(max_length=50, blank=True, null=True)
    mpesa_phone_number = models.CharField(max_length=15, blank=True, null=True)
    
    # Card specific
    card_last_four = models.CharField(max_length=4, blank=True)
    card_transaction_id = models.CharField(max_length=100, blank=True)
    
    # Loyalty points
    points_used = models.IntegerField(default=0)
    
    # General
    reference_number = models.CharField(max_length=100, blank=True)
    payment_date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)
    
    # Recorded by
    recorded_by = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='payments_recorded')
    
    class Meta:
        ordering = ['payment_date']
    
    def __str__(self):
        return f"{self.payment_method} - {self.amount} for {self.sale.sale_id}"
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        total_paid = self.sale.payments.aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')
        self.sale.amount_paid = total_paid
        self.sale.save(update_fields=['amount_paid', 'payment_status'])


class Receipt(models.Model):
    """
    Receipt generated for a sale
    """
    
    # Using OneToOneField with string reference
    sale = models.OneToOneField(
        'Sale',
        on_delete=models.CASCADE,
        related_name='receipt'
    )
    
    receipt_number = models.CharField(max_length=50, unique=True, editable=False)
    
    # Receipt content
    receipt_html = models.TextField(blank=True)
    receipt_text = models.TextField(blank=True)
    
    # Delivery methods
    sent_via_email = models.BooleanField(default=False)
    sent_via_sms = models.BooleanField(default=False)
    sent_via_whatsapp = models.BooleanField(default=False)
    printed = models.BooleanField(default=False)
    
    # Timestamps
    generated_at = models.DateTimeField(auto_now_add=True)
    printed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-generated_at']
    
    def __str__(self):
        return f"Receipt {self.receipt_number} - {self.sale.sale_id}"
    
    def save(self, *args, **kwargs):
        if not self.receipt_number:
            date_str = datetime.now().strftime('%Y%m%d')
            last_receipt = Receipt.objects.filter(
                receipt_number__startswith=f'RCP-{date_str}'
            ).order_by('-receipt_number').first()
            
            if last_receipt:
                try:
                    last_num = int(last_receipt.receipt_number.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.receipt_number = f"RCP-{date_str}-{new_num:04d}"
        
        if not self.receipt_text:
            self.receipt_text = self.generate_text_receipt()
        
        super().save(*args, **kwargs)
    
    def generate_text_receipt(self):
        """Generate plain text receipt for printing"""
        sale = self.sale
        lines = []
        
        lines.append("=" * 48)
        lines.append("YOUR STORE NAME".center(48))
        lines.append("Your Address Line 1".center(48))
        lines.append("Your Address Line 2".center(48))
        lines.append("Tel: 0712345678".center(48))
        lines.append("=" * 48)
        lines.append(f"Invoice: {sale.sale_id}")
        lines.append(f"Date: {sale.sale_date.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"Cashier: {sale.cashier.get_full_name() or sale.cashier.username}")
        lines.append(f"Customer: {sale.customer.name if sale.customer else 'Walk-in Customer'}")
        lines.append("-" * 48)
        lines.append(f"{'Item':<20} {'Qty':>6} {'Price':>10} {'Total':>10}")
        lines.append("-" * 48)
        
        for item in sale.items.all():
            name = item.product_name[:20]
            lines.append(f"{name:<20} {float(item.quantity):>6.2f} {float(item.unit_price):>10.2f} {float(item.total):>10.2f}")
        
        lines.append("-" * 48)
        lines.append(f"{'Subtotal:':>38} {float(sale.subtotal):>10.2f}")
        
        if sale.discount_amount > 0:
            lines.append(f"{'Discount:':>38} -{float(sale.discount_amount):>9.2f}")
        
        if sale.loyalty_discount > 0:
            lines.append(f"{'Loyalty Discount:':>38} -{float(sale.loyalty_discount):>9.2f}")
        
        if sale.tax_amount > 0:
            lines.append(f"{'Tax (16%):':>38} {float(sale.tax_amount):>10.2f}")
        
        lines.append("=" * 48)
        lines.append(f"{'TOTAL:':>38} {float(sale.total):>10.2f}")
        lines.append(f"{'Amount Paid:':>38} {float(sale.amount_paid):>10.2f}")
        
        if sale.change_due > 0:
            lines.append(f"{'Change Due:':>38} {float(sale.change_due):>10.2f}")
        
        lines.append("=" * 48)
        
        if sale.loyalty_points_earned > 0:
            lines.append(f"Loyalty points earned: {sale.loyalty_points_earned}")
        
        lines.append("THANK YOU FOR SHOPPING WITH US!".center(48))
        lines.append("=" * 48)
        
        return "\n".join(lines)