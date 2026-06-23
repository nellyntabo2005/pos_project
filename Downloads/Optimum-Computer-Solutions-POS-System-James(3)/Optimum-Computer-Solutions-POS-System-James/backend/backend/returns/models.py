# returns/models.py
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from decimal import Decimal
import uuid
from datetime import datetime

from customers.models import Customer
from users.models import User
from products.models import Product
from sales.models import Sale, SaleItem


class Return(models.Model):
    """
    Customer returns and refunds management
    Handles both full and partial returns
    """
    
    RETURN_REASONS = [
        ('defective', 'Defective Product'),
        ('wrong_item', 'Wrong Item Sent'),
        ('changed_mind', 'Changed Mind / No Longer Needed'),
        ('expired', 'Expired Product'),
        ('damaged', 'Damaged During Delivery'),
        ('incorrect_quantity', 'Incorrect Quantity'),
        ('poor_quality', 'Poor Quality'),
        ('better_price', 'Found Better Price Elsewhere'),
        ('not_as_described', 'Not as Described'),
        ('other', 'Other Reason'),
    ]
    
    RETURN_STATUS = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved - Ready for Refund'),
        ('rejected', 'Rejected'),
        ('completed', 'Completed - Refund Issued'),
        ('cancelled', 'Cancelled by Customer'),
    ]
    
    REFUND_METHODS = [
        ('cash', 'Cash Refund'),
        ('mpesa', 'M-Pesa Refund'),
        ('bank_transfer', 'Bank Transfer'),
        ('store_credit', 'Store Credit'),
        ('loyalty_points', 'Loyalty Points Refund'),
        ('original_payment', 'Original Payment Method'),
    ]
    
    # === IDENTIFIERS ===
    return_number = models.CharField(
        max_length=50, 
        unique=True, 
        editable=False,
        help_text="Unique return reference number (e.g., RET-20241215-0001)"
    )
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    # === RELATIONSHIPS ===
    original_sale = models.ForeignKey(
        Sale, 
        on_delete=models.PROTECT, 
        related_name='returns',
        help_text="Original sale being returned"
    )
    
    customer = models.ForeignKey(
        Customer, 
        on_delete=models.PROTECT, 
        related_name='returns',
        help_text="Customer returning the product"
    )
    
    # === RETURN DETAILS ===
    reason = models.CharField(max_length=30, choices=RETURN_REASONS)
    reason_description = models.TextField(blank=True, help_text="Additional details about the return")
    
    status = models.CharField(
        max_length=20, 
        choices=RETURN_STATUS, 
        default='pending', 
        db_index=True
    )
    
    # === FINANCIAL ===
    refund_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00'),
        help_text="Total refund amount before fees"
    )
    
    restocking_fee = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00'),
        help_text="Restocking fee (if applicable)"
    )
    
    shipping_refund = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00'),
        help_text="Refund for shipping cost"
    )
    
    net_refund = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        editable=False,
        help_text="Final refund amount = refund_amount - restocking_fee + shipping_refund"
    )
    
    # === REFUND METHOD ===
    refund_method = models.CharField(
        max_length=20, 
        choices=REFUND_METHODS, 
        default='original_payment'
    )
    
    # M-Pesa specific (for refunds)
    mpesa_phone = models.CharField(max_length=15, blank=True, help_text="Phone number for M-Pesa refund")
    mpesa_refund_code = models.CharField(max_length=50, blank=True, help_text="M-Pesa refund transaction code")
    
    # Bank transfer specific
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account = models.CharField(max_length=50, blank=True)
    bank_reference = models.CharField(max_length=100, blank=True)
    
    # Store credit specific
    store_credit_code = models.CharField(max_length=50, blank=True, help_text="Generated store credit code")
    store_credit_expiry = models.DateField(null=True, blank=True)
    
    # === STOCK HANDLING ===
    restock_items = models.BooleanField(
        default=True, 
        help_text="Return items to inventory?"
    )
    
    # Condition of returned items
    ITEM_CONDITIONS = [
        ('new', 'New/Unused'),
        ('like_new', 'Like New - Original Packaging'),
        ('good', 'Good - Light Use'),
        ('fair', 'Fair - Visible Wear'),
        ('damaged', 'Damaged'),
    ]
    
    item_condition = models.CharField(max_length=20, choices=ITEM_CONDITIONS, default='good')
    
    # === APPROVAL WORKFLOW ===
    requested_by = models.ForeignKey(
        User, 
        on_delete=models.PROTECT, 
        related_name='returns_requested',
        help_text="Staff member who processed the return request"
    )
    
    approved_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='returns_approved',
        help_text="Manager who approved the return"
    )
    
    processed_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='returns_processed',
        help_text="Staff who issued the refund"
    )
    
    # === NOTES ===
    customer_notes = models.TextField(blank=True, help_text="Notes from customer")
    staff_notes = models.TextField(blank=True, help_text="Internal staff notes")
    rejection_reason = models.TextField(blank=True, help_text="Reason if return is rejected")
    
    # === TIMESTAMPS ===
    return_date = models.DateTimeField(auto_now_add=True, db_index=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-return_date']
        indexes = [
            models.Index(fields=['return_number']),
            models.Index(fields=['original_sale']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['return_date']),
            models.Index(fields=['status', 'return_date']),
        ]
        verbose_name = 'Return'
        verbose_name_plural = 'Returns'
    
    def __str__(self):
        return f"Return {self.return_number} - {self.customer.name} - {self.status}"
    
    def save(self, *args, **kwargs):
        """Auto-generate return_number and calculate net_refund"""
        if not self.return_number:
            date_str = datetime.now().strftime('%Y%m%d')
            last_return = Return.objects.filter(
                return_number__startswith=f'RET-{date_str}'
            ).order_by('-return_number').first()
            
            if last_return:
                try:
                    last_num = int(last_return.return_number.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.return_number = f"RET-{date_str}-{new_num:04d}"
        
        # Calculate net refund
        self.net_refund = self.refund_amount - self.restocking_fee + self.shipping_refund
        
        super().save(*args, **kwargs)
    
    def approve_return(self, approved_by_user):
        """
        Approve the return request
        """
        if self.status != 'pending':
            raise ValidationError(f"Cannot approve return with status: {self.status}")
        
        self.status = 'approved'
        self.approved_by = approved_by_user
        self.approved_at = datetime.now()
        self.save()
        
        return True
    
    def reject_return(self, rejected_by_user, reason):
        """
        Reject the return request with reason
        """
        if self.status != 'pending':
            raise ValidationError(f"Cannot reject return with status: {self.status}")
        
        self.status = 'rejected'
        self.rejection_reason = reason
        self.save()
        
        return True
    
    def process_refund(self, processed_by_user):
        """
        Process the refund and update stock
        Returns: (success, refund_transaction, message)
        """
        from payments.models import PaymentTransaction
        
        if self.status != 'approved':
            return False, None, f"Cannot process return with status: {self.status}"
        
        # Process each return item
        for item in self.items.all():
            # Restock product
            if self.restock_items:
                old_stock = item.product.stock_quantity
                item.product.stock_quantity += item.quantity
                item.product.save(update_fields=['stock_quantity', 'updated_at'])
                
                # Record stock movement (if inventory module exists)
                try:
                    from inventory.models import StockMovement
                    StockMovement.objects.create(
                        product=item.product,
                        movement_type='return',
                        quantity=item.quantity,
                        stock_before=old_stock,
                        stock_after=item.product.stock_quantity,
                        unit_cost=item.product.cost_price,
                        reference_id=self.return_number,
                        reference_type='Return',
                        recorded_by=processed_by_user,
                        notes=f"Return from sale {self.original_sale.sale_id} - Reason: {self.get_reason_display()}"
                    )
                except ImportError:
                    pass  # Inventory module not installed
            
            # Mark original sale item as returned
            item.original_sale_item.is_returned = True
            item.original_sale_item.save(update_fields=['is_returned'])
        
        # Reverse loyalty points earned from this sale
        if self.original_sale.loyalty_points_earned > 0:
            self.customer.loyalty_points -= self.original_sale.loyalty_points_earned
            self.customer.save(update_fields=['loyalty_points'])
        
        # Create refund payment transaction
        refund_transaction = PaymentTransaction.objects.create(
            transaction_type='refund',
            payment_method=self.get_payment_method_for_transaction(),
            amount=self.net_refund,
            reference_number=self.return_number,
            sale=self.original_sale,
            customer=self.customer,
            description=f"Return refund for sale {self.original_sale.sale_id} - Reason: {self.get_reason_display()}",
            recorded_by=processed_by_user,
            status='completed'
        )
        
        # Update return status
        self.status = 'completed'
        self.processed_by = processed_by_user
        self.processed_at = datetime.now()
        self.save()
        
        return True, refund_transaction, "Refund processed successfully"
    
    def get_payment_method_for_transaction(self):
        """Map return refund_method to payment transaction method"""
        mapping = {
            'cash': 'cash',
            'mpesa': 'mpesa',
            'bank_transfer': 'bank_transfer',
            'store_credit': 'credit',
            'loyalty_points': 'loyalty',
            'original_payment': 'cash',  # Default to cash if original payment method unclear
        }
        return mapping.get(self.refund_method, 'cash')
    
    @property
    def total_items_returned(self):
        """Get total number of items in this return"""
        return self.items.count()
    
    @property
    def days_since_return(self):
        """Get days since return was created"""
        delta = datetime.now() - self.return_date
        return delta.days


class ReturnItem(models.Model):
    """
    Individual items being returned
    Allows partial returns of a sale
    """
    
    return_obj = models.ForeignKey(
        Return, 
        on_delete=models.CASCADE, 
        related_name='items'
    )
    
    original_sale_item = models.ForeignKey(
        SaleItem, 
        on_delete=models.PROTECT, 
        related_name='return_items'
    )
    
    product = models.ForeignKey(
        Product, 
        on_delete=models.PROTECT, 
        related_name='return_items'
    )
    
    quantity = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        validators=[MinValueValidator(0.01)]
    )
    
    refund_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        help_text="Refund amount for this item"
    )
    
    # Reason specific to this item (if different from main return reason)
    item_reason = models.CharField(max_length=200, blank=True)
    
    # Condition of this specific item
    condition = models.CharField(
        max_length=50, 
        blank=True,
        help_text="Condition of the returned item"
    )
    
    # Whether this specific item should be restocked
    restock = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['return_obj', 'original_sale_item']
        indexes = [
            models.Index(fields=['return_obj', 'product']),
            models.Index(fields=['original_sale_item']),
        ]
    
    def __str__(self):
        return f"{self.product.name} - {self.quantity} units - {self.refund_amount}"
    
    def save(self, *args, **kwargs):
        """Update return totals when item is saved"""
        super().save(*args, **kwargs)
        
        # Update parent return totals
        if self.return_obj:
            total_refund = self.return_obj.items.aggregate(
                total=models.Sum('refund_amount')
            )['total'] or Decimal('0.00')
            
            self.return_obj.refund_amount = total_refund
            self.return_obj.save(update_fields=['refund_amount'])


class ReturnImage(models.Model):
    """
    Images of returned items for documentation
    Useful for quality control and dispute resolution
    """
    
    return_obj = models.ForeignKey(
        Return, 
        on_delete=models.CASCADE, 
        related_name='images'
    )
    
    image = models.ImageField(upload_to='returns/%Y/%m/%d/')
    caption = models.CharField(max_length=200, blank=True)
    
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['uploaded_at']
    
    def __str__(self):
        return f"Image for {self.return_obj.return_number}"


class ReturnLog(models.Model):
    """
    Audit log for all return actions
    """
    ACTION_TYPES = [
        ('created', 'Return Created'),
        ('approved', 'Return Approved'),
        ('rejected', 'Return Rejected'),
        ('processed', 'Refund Processed'),
        ('cancelled', 'Return Cancelled'),
        ('note_added', 'Note Added'),
    ]
    
    return_obj = models.ForeignKey(Return, on_delete=models.CASCADE, related_name='logs')
    action = models.CharField(max_length=20, choices=ACTION_TYPES)
    
    performed_by = models.ForeignKey(User, on_delete=models.PROTECT)
    notes = models.TextField(blank=True)
    
    # Snapshot of relevant data at time of action
    data_snapshot = models.JSONField(default=dict, help_text="Store relevant data at action time")
    
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.return_obj.return_number} - {self.action} - {self.created_at}"