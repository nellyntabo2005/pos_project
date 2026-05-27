# payments/models.py
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from decimal import Decimal
import uuid
from datetime import datetime

from customers.models import Customer
from users.models import User
from sales.models import Sale


class PaymentAccount(models.Model):
    """
    Payment accounts (Cash, M-Pesa, Bank, etc.)
    """
    
    ACCOUNT_TYPES = [
        ('cash', 'Cash Register'),
        ('mpesa', 'M-Pesa Paybill/Till'),
        ('bank', 'Bank Account'),
        ('mobile_money', 'Other Mobile Money'),
        ('credit', 'Customer Credit Account'),
    ]
    
    name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES)
    account_number = models.CharField(max_length=100, blank=True)
    
    # For M-Pesa
    paybill_number = models.CharField(max_length=20, blank=True)
    till_number = models.CharField(max_length=20, blank=True)
    
    # For bank
    bank_name = models.CharField(max_length=100, blank=True)
    bank_branch = models.CharField(max_length=100, blank=True)
    
    # Opening balance
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    current_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.get_account_type_display()})"


class PaymentTransaction(models.Model):
    """
    All financial transactions (payments, receipts, refunds)
    """
    
    TRANSACTION_TYPES = [
        ('sale', 'Sale Payment'),
        ('refund', 'Refund to Customer'),
        ('supplier_payment', 'Supplier Payment'),
        ('expense', 'Expense'),
        ('salary', 'Salary Payment'),
        ('transfer', 'Account Transfer'),
        ('deposit', 'Cash Deposit'),
        ('withdrawal', 'Cash Withdrawal'),
    ]
    
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('mpesa', 'M-Pesa'),
        ('card', 'Card'),
        ('bank_transfer', 'Bank Transfer'),
        ('cheque', 'Cheque'),
        ('credit', 'Store Credit'),
        ('loyalty', 'Loyalty Points'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
        ('refunded', 'Refunded'),
    ]
    
    transaction_id = models.CharField(max_length=50, unique=True, editable=False)
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    
    # Accounts
    from_account = models.ForeignKey(
        PaymentAccount, 
        on_delete=models.PROTECT, 
        related_name='outgoing_transactions', 
        null=True, 
        blank=True
    )
    to_account = models.ForeignKey(
        PaymentAccount, 
        on_delete=models.PROTECT, 
        related_name='incoming_transactions', 
        null=True, 
        blank=True
    )
    
    # Amounts
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, editable=False)
    
    # Reference
    reference_number = models.CharField(max_length=100, blank=True)
    sale = models.ForeignKey(Sale, on_delete=models.SET_NULL, null=True, blank=True, related_name='payment_transactions')
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    
    # M-Pesa specific
    mpesa_receipt = models.CharField(max_length=50, blank=True)
    mpesa_phone = models.CharField(max_length=15, blank=True)
    mpesa_result_code = models.IntegerField(null=True, blank=True)
    mpesa_result_desc = models.CharField(max_length=200, blank=True)
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Description
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    # Recorded by
    recorded_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='payment_transactions')
    verified_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_payments')
    
    # Timestamps
    transaction_date = models.DateTimeField(auto_now_add=True, db_index=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-transaction_date']
    
    def __str__(self):
        return f"{self.transaction_id} - {self.transaction_type} - {self.amount}"
    
    def save(self, *args, **kwargs):
        if not self.transaction_id:
            date_str = datetime.now().strftime('%Y%m%d')
            last_txn = PaymentTransaction.objects.filter(
                transaction_id__startswith=f'TXN-{date_str}'
            ).order_by('-transaction_id').first()
            
            if last_txn:
                try:
                    last_num = int(last_txn.transaction_id.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.transaction_id = f"TXN-{date_str}-{new_num:06d}"
        
        self.net_amount = self.amount - self.fee
        super().save(*args, **kwargs)
    
    def verify(self, verified_by):
        self.status = 'completed'
        self.verified_by = verified_by
        self.verified_at = datetime.now()
        
        if self.transaction_type == 'sale' and self.to_account:
            self.to_account.current_balance += self.net_amount
            self.to_account.save()
        elif self.transaction_type == 'refund' and self.from_account:
            self.from_account.current_balance -= self.amount
            self.from_account.save()
        elif self.transaction_type == 'expense' and self.from_account:
            self.from_account.current_balance -= self.amount
            self.from_account.save()
        
        self.save()
        return True


class MpesaAccount(models.Model):
    """
    M-Pesa Paybill/Till Account Configuration
    """
    
    BUSINESS_TYPES = [
        ('paybill', 'Paybill'),
        ('till', 'Till Number'),
    ]
    
    ENVIRONMENT_CHOICES = [
        ('sandbox', 'Sandbox (Testing)'),
        ('production', 'Production (Live)'),
    ]
    
    name = models.CharField(max_length=100)
    business_type = models.CharField(max_length=10, choices=BUSINESS_TYPES)
    
    shortcode = models.CharField(max_length=10)
    passkey = models.CharField(max_length=100)
    consumer_key = models.CharField(max_length=100)
    consumer_secret = models.CharField(max_length=100)
    
    environment = models.CharField(max_length=20, choices=ENVIRONMENT_CHOICES, default='sandbox')
    
    callback_url = models.URLField()
    timeout_url = models.URLField()
    result_url = models.URLField()
    
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    
    business_name = models.CharField(max_length=200, blank=True)
    business_shortcode = models.CharField(max_length=20, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-is_default', 'name']
    
    def __str__(self):
        return f"{self.name} ({self.shortcode}) - {self.environment}"
    
    def save(self, *args, **kwargs):
        if self.is_default:
            MpesaAccount.objects.filter(is_default=True).exclude(id=self.id).update(is_default=False)
        super().save(*args, **kwargs)


class MpesaTransaction(models.Model):
    """
    M-Pesa transaction record
    """
    
    TRANSACTION_TYPES = [
        ('c2b', 'Customer to Business (Payment)'),
        ('b2c', 'Business to Customer (Refund/Withdrawal)'),
        ('stk_push', 'STK Push (Lipa Na M-Pesa)'),
        ('reversal', 'Transaction Reversal'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
        ('timeout', 'Timeout'),
    ]
    
    merchant_request_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    checkout_request_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    mpesa_receipt_number = models.CharField(max_length=50, unique=True, null=True, blank=True)
    
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    
    phone_number = models.CharField(max_length=15)
    account_reference = models.CharField(max_length=50)
    transaction_desc = models.CharField(max_length=100, blank=True)
    
    response_code = models.CharField(max_length=10, blank=True)
    response_description = models.CharField(max_length=200, blank=True)
    
    callback_data = models.JSONField(default=dict, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    result_code = models.IntegerField(null=True, blank=True)
    result_desc = models.CharField(max_length=500, blank=True)
    
    payment_transaction = models.ForeignKey(
        PaymentTransaction, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='mpesa_transactions'
    )
    sale = models.ForeignKey(Sale, on_delete=models.SET_NULL, null=True, blank=True)
    mpesa_account = models.ForeignKey(MpesaAccount, on_delete=models.PROTECT, related_name='transactions')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.mpesa_receipt_number or self.checkout_request_id} - {self.amount} - {self.status}"
    
    def mark_completed(self, receipt_number, result_code=0, result_desc='Success'):
        self.status = 'completed'
        self.mpesa_receipt_number = receipt_number
        self.result_code = result_code
        self.result_desc = result_desc
        self.completed_at = datetime.now()
        self.save()
        return True
    
    def mark_failed(self, result_code, result_desc):
        self.status = 'failed'
        self.result_code = result_code
        self.result_desc = result_desc
        self.save()
        return False


class MpesaCallbackLog(models.Model):
    """
    Store raw M-Pesa callbacks for debugging
    """
    transaction = models.ForeignKey(
        MpesaTransaction, 
        on_delete=models.CASCADE, 
        related_name='callback_logs',
        null=True,
        blank=True
    )
    raw_data = models.JSONField()
    result_code = models.IntegerField()
    result_desc = models.CharField(max_length=500)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Callback for {self.transaction} at {self.created_at}"
      # payments/models.py - Add this at the end, before any closing brackets

class MpesaReconciliation(models.Model):
    """
    Daily M-Pesa reconciliation reports
    Match M-Pesa transactions with system payments
    """
    
    reconciliation_date = models.DateField(unique=True, db_index=True)
    mpesa_account = models.ForeignKey(MpesaAccount, on_delete=models.PROTECT, related_name='reconciliations')
    
    # Totals from M-Pesa
    mpesa_total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    mpesa_total_count = models.IntegerField(default=0)
    
    # Totals from system
    system_total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    system_total_count = models.IntegerField(default=0)
    
    # Discrepancies
    discrepancy_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discrepancy_count = models.IntegerField(default=0)
    
    # Unmatched transactions (JSON)
    unmatched_from_mpesa = models.JSONField(default=list)
    unmatched_from_system = models.JSONField(default=list)
    
    # Status
    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('matched', 'All Matched'),
        ('discrepancy', 'Has Discrepancies'),
        ('resolved', 'Resolved'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Notes
    notes = models.TextField(blank=True)
    resolved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-reconciliation_date']
        indexes = [
            models.Index(fields=['reconciliation_date', 'status']),
        ]
    
    def __str__(self):
        return f"Reconciliation {self.reconciliation_date} - {self.status}"
    
    def calculate_discrepancy(self):
        """Calculate discrepancy between M-Pesa and system"""
        self.discrepancy_amount = self.mpesa_total_amount - self.system_total_amount
        self.discrepancy_count = self.mpesa_total_count - self.system_total_count
        
        if self.discrepancy_amount == 0 and self.discrepancy_count == 0:
            self.status = 'matched'
        else:
            self.status = 'discrepancy'
        
        self.save()
        # payments/models.py - Add these models at the end

parent = models.ForeignKey(
    'self',
    on_delete=models.CASCADE,
    null=True,
    blank=True,
    related_name='children'
)
class Meta:
        verbose_name_plural = "Expense Categories"
        ordering = ['name']
    
def __str__(self):
        return self.name


class Expense(models.Model):
    """
    Business expenses tracking
    """
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('paid', 'Paid'),
        ('rejected', 'Rejected'),
    ]
    
    expense_number = models.CharField(max_length=50, unique=True, editable=False)
    
    #category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name='expenses')

    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, editable=False)
    
    description = models.TextField()
    receipt_image = models.ImageField(upload_to='expenses/', null=True, blank=True)
    
    # Payment
    payment_transaction = models.OneToOneField(
        PaymentTransaction, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='expense'
    )
    
    # Approval
    requested_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='expenses_requested')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses_approved')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    expense_date = models.DateField(db_index=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    
    notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-expense_date']
        indexes = [
            models.Index(fields=['expense_number']),
            models.Index(fields=['status']),
            models.Index(fields=['expense_date']),
        ]
    
    def __str__(self):
        return f"{self.expense_number} - {self.category.name} - {self.amount}"
    
    def save(self, *args, **kwargs):
        if not self.expense_number:
            date_str = datetime.now().strftime('%Y%m%d')
            last_expense = Expense.objects.filter(
                expense_number__startswith=f'EXP-{date_str}'
            ).order_by('-expense_number').first()
            
            if last_expense:
                try:
                    last_num = int(last_expense.expense_number.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.expense_number = f"EXP-{date_str}-{new_num:04d}"
        
        self.total_amount = self.amount + self.tax_amount
        super().save(*args, **kwargs)
        # payments/models.py - Add these models at the end



# customers/models.py
from django.db import models
import uuid


class Customer(models.Model):
    """
    Customer model for ERP/POS system
    """
    
    # Identifiers
    account_reference = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated unique customer ID"
    )
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    # Personal information
    name = models.CharField(max_length=200, db_index=True)
    phone = models.CharField(max_length=15, unique=True, db_index=True)
    email = models.EmailField(unique=True, blank=True, null=True)
    address = models.TextField(blank=True)
    
    # Business information
    tax_number = models.CharField(max_length=50, blank=True, null=True)
    
    # Loyalty - DIRECT FIELD (not a separate model)
    loyalty_points = models.IntegerField(default=0, help_text="Accumulated loyalty points")
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Pricing tier
    PRICING_TIERS = [
        ('retail', 'Retail Customer'),
        ('wholesale', 'Wholesale Customer'),
        ('vip', 'VIP Customer'),
    ]
    pricing_tier = models.CharField(max_length=20, choices=PRICING_TIERS, default='retail')
    
    # Status
    is_active = models.BooleanField(default=True)
    
    # Notes
    notes = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_purchase_date = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['phone']),
            models.Index(fields=['email']),
            models.Index(fields=['account_reference']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.phone})"
    
    def save(self, *args, **kwargs):
        if not self.account_reference:
            last_customer = Customer.objects.order_by('-id').first()
            if last_customer:
                try:
                    last_num = int(last_customer.account_reference.split('-')[1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            self.account_reference = f"CUST-{new_num:06d}"
        super().save(*args, **kwargs)
    
    def add_loyalty_points(self, points):
        """Add loyalty points"""
        self.loyalty_points += points
        self.save(update_fields=['loyalty_points', 'updated_at'])
    
    def redeem_loyalty_points(self, points):
        """Redeem loyalty points"""
        if points > self.loyalty_points:
            raise ValueError("Insufficient loyalty points")
        self.loyalty_points -= points
        self.save(update_fields=['loyalty_points', 'updated_at'])
        return points



# payments/models.py - Add these models
from django.db import models
from decimal import Decimal
import uuid


class ExpenseCategory(models.Model):
    """
    Categories for expenses - MUST be defined BEFORE Expense
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    # Use string reference 'self' for parent relation
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name_plural = "Expense Categories"
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Expense(models.Model):
    """
    Business expenses tracking
    """
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('paid', 'Paid'),
        ('rejected', 'Rejected'),
    ]
    
    expense_number = models.CharField(max_length=50, unique=True, editable=False)
    
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name='expenses')
    
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, editable=False)
    
    description = models.TextField()
    receipt_image = models.ImageField(upload_to='expenses/', null=True, blank=True)
    
    # Payment
    payment_transaction = models.OneToOneField(
        PaymentTransaction, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='expense'
    )
    
    # Approval
    requested_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='expenses_requested')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses_approved')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    expense_date = models.DateField(db_index=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    
    notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-expense_date']
        indexes = [
            models.Index(fields=['expense_number']),
            models.Index(fields=['status']),
            models.Index(fields=['expense_date']),
        ]
    
    def __str__(self):
        return f"{self.expense_number} - {self.category.name} - {self.amount}"
    
    def save(self, *args, **kwargs):
        if not self.expense_number:
            date_str = datetime.now().strftime('%Y%m%d')
            last_expense = Expense.objects.filter(
                expense_number__startswith=f'EXP-{date_str}'
            ).order_by('-expense_number').first()
            
            if last_expense:
                try:
                    last_num = int(last_expense.expense_number.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.expense_number = f"EXP-{date_str}-{new_num:04d}"
        
        self.total_amount = self.amount + self.tax_amount
        super().save(*args, **kwargs)