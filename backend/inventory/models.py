# inventory/models.py
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from decimal import Decimal
import uuid
from datetime import datetime, timedelta

from products.models import Product, Category, Supplier
from users.models import User
from sales.models import Sale


class Batch(models.Model):
    """
    Product batches for tracking expiry and manufacturing dates
    """
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('depleted', 'Depleted'),
        ('recalled', 'Recalled'),
        ('quarantined', 'Quarantined'),
    ]
    
    batch_number = models.CharField(max_length=50, unique=True, db_index=True)
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE, 
        related_name='inventory_batches'
    )
    
    quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    remaining_quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True, db_index=True)
    
    purchase_order = models.ForeignKey('PurchaseOrder', on_delete=models.SET_NULL, null=True, blank=True)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active', db_index=True)
    
    location = models.CharField(max_length=100, blank=True, default='Main Store')
    shelf_location = models.CharField(max_length=50, blank=True)
    
    quality_passed = models.BooleanField(default=True)
    quality_notes = models.TextField(blank=True)
    inspected_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    inspected_at = models.DateTimeField(null=True, blank=True)
    
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['expiry_date', 'batch_number']
    
    def __str__(self):
        return f"{self.batch_number} - {self.product.name} - {self.remaining_quantity} left"
    
    def save(self, *args, **kwargs):
        if self.expiry_date and self.expiry_date < datetime.now().date():
            self.status = 'expired'
        elif self.remaining_quantity <= 0:
            self.status = 'depleted'
        super().save(*args, **kwargs)


class StockMovement(models.Model):
    MOVEMENT_TYPES = [
        ('purchase', 'Purchase Order Received'),
        ('sale', 'Sale'),
        ('return', 'Customer Return'),
        ('supplier_return', 'Return to Supplier'),
        ('adjustment', 'Manual Adjustment'),
        ('transfer', 'Store Transfer'),
        ('damage', 'Damaged Goods'),
        ('expired', 'Expired Stock'),
        ('count', 'Stock Count Adjustment'),
        ('production', 'Production'),
        ('sample', 'Sample/Tester'),
        ('donation', 'Donation/Write-off'),
    ] #this will be monitored by the inventory clerk
    
    movement_id = models.CharField(max_length=50, unique=True, editable=False, db_index=True)
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='movements', db_index=True)
    batch = models.ForeignKey(Batch, on_delete=models.SET_NULL, null=True, blank=True, related_name='movements')
    
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES, db_index=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    
    stock_before = models.DecimalField(max_digits=12, decimal_places=2)
    stock_after = models.DecimalField(max_digits=12, decimal_places=2)
    
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    reference_id = models.CharField(max_length=100, blank=True, db_index=True)
    reference_type = models.CharField(max_length=50, blank=True)
    
    reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_movements')
    recorded_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='stock_movements')
    
    location = models.CharField(max_length=100, blank=True, default='Main Store')
    
    movement_date = models.DateTimeField(auto_now_add=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-movement_date']
    
    def __str__(self):
        return f"{self.movement_type} - {self.product.name} - {self.quantity}"
    
    def save(self, *args, **kwargs):
        if not self.movement_id:
            date_str = datetime.now().strftime('%Y%m%d')
            last_movement = StockMovement.objects.filter(
                movement_id__startswith=f'MOV-{date_str}'
            ).order_by('-movement_id').first()
            
            if last_movement:
                try:
                    last_num = int(last_movement.movement_id.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.movement_id = f"MOV-{date_str}-{new_num:06d}"
        super().save(*args, **kwargs)


class PurchaseOrder(models.Model):
    ORDER_STATUS = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('confirmed', 'Confirmed'),
        ('shipped', 'Shipped'),
        ('received', 'Partially Received'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('returned', 'Returned'),
    ]
    
    po_number = models.CharField(max_length=50, unique=True, editable=False, db_index=True)
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='purchase_orders')
    
    order_date = models.DateTimeField(auto_now_add=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    delivery_date = models.DateTimeField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=ORDER_STATUS, default='draft', db_index=True)
    
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=16)
    shipping_cost = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0, editable=False)
    
    payment_terms = models.CharField(max_length=100, blank=True)
    payment_status = models.CharField(max_length=20, choices=[
        ('unpaid', 'Unpaid'),
        ('partial', 'Partially Paid'),
        ('paid', 'Paid'),
    ], default='unpaid')
    
    shipping_method = models.CharField(max_length=100, blank=True)
    tracking_number = models.CharField(max_length=100, blank=True)
    courier = models.CharField(max_length=100, blank=True)
    
    supplier_notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='purchase_orders')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_orders')
    approved_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-order_date']
    
    def __str__(self):
        return f"{self.po_number} - {self.supplier.name}"
    
    def save(self, *args, **kwargs):
        if not self.po_number:
            date_str = datetime.now().strftime('%Y%m')
            last_po = PurchaseOrder.objects.filter(
                po_number__startswith=f'PO-{date_str}'
            ).order_by('-po_number').first()
            
            if last_po:
                try:
                    last_num = int(last_po.po_number.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.po_number = f"PO-{date_str}-{new_num:05d}"
        
        self.total = self.subtotal + self.tax_amount + self.shipping_cost - self.discount_amount
        super().save(*args, **kwargs)


class PurchaseOrderItem(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    
    quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    quantity_received = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, editable=False)
    
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0, editable=False)
    total = models.DecimalField(max_digits=15, decimal_places=2, editable=False)
    
    expected_delivery_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    
    def save(self, *args, **kwargs):
        self.subtotal = self.unit_cost * self.quantity
        self.discount_amount = self.subtotal * (self.discount_percentage / 100)
        self.total = self.subtotal - self.discount_amount
        super().save(*args, **kwargs)
        self.purchase_order.calculate_totals()
    
    def __str__(self):
        return f"{self.product.name} - {self.quantity}"


class StockCount(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    count_number = models.CharField(max_length=50, unique=True, editable=False, db_index=True)
    location = models.CharField(max_length=200, default='Main Store')
    count_date = models.DateField(db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    notes = models.TextField(blank=True)
    total_products = models.IntegerField(default=0)
    total_discrepancies = models.IntegerField(default=0)
    total_adjustment_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='stock_counts')
    completed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='completed_counts')
    
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-count_date']
    
    def __str__(self):
        return f"Stock Count {self.count_number} - {self.count_date}"
    
    def save(self, *args, **kwargs):
        if not self.count_number:
            date_str = datetime.now().strftime('%Y%m%d')
            last_count = StockCount.objects.filter(
                count_number__startswith=f'SC-{date_str}'
            ).order_by('-count_number').first()
            
            if last_count:
                try:
                    last_num = int(last_count.count_number.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.count_number = f"SC-{date_str}-{new_num:04d}"
        super().save(*args, **kwargs)


class StockCountItem(models.Model):
    stock_count = models.ForeignKey(StockCount, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    
    expected_quantity = models.DecimalField(max_digits=12, decimal_places=2)
    counted_quantity = models.DecimalField(max_digits=12, decimal_places=2)
    
    difference = models.DecimalField(max_digits=12, decimal_places=2, editable=False)
    is_discrepancy = models.BooleanField(default=False, editable=False)
    
    notes = models.TextField(blank=True)
    
    class Meta:
        unique_together = ['stock_count', 'product']
    
    def save(self, *args, **kwargs):
        self.difference = self.counted_quantity - self.expected_quantity
        self.is_discrepancy = self.difference != 0
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.product.name}: Expected {self.expected_quantity}, Counted {self.counted_quantity}"


class StoreTransfer(models.Model):
    TRANSFER_STATUS = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('in_transit', 'In Transit'),
        ('received', 'Received'),
        ('cancelled', 'Cancelled'),
        ('rejected', 'Rejected'),
    ]
    
    transfer_number = models.CharField(max_length=50, unique=True, editable=False, db_index=True)
    from_store = models.CharField(max_length=100)
    to_store = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=TRANSFER_STATUS, default='pending')
    
    transfer_date = models.DateTimeField(auto_now_add=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    received_date = models.DateTimeField(null=True, blank=True)
    
    reason = models.TextField()
    notes = models.TextField(blank=True)
    
    tracking_number = models.CharField(max_length=100, blank=True)
    courier = models.CharField(max_length=100, blank=True)
    
    requested_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='transfers_requested')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_approved')
    received_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_received')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Transfer {self.transfer_number}: {self.from_store} → {self.to_store}"
    
    def save(self, *args, **kwargs):
        if not self.transfer_number:
            date_str = datetime.now().strftime('%Y%m%d')
            last_transfer = StoreTransfer.objects.filter(
                transfer_number__startswith=f'TRF-{date_str}'
            ).order_by('-transfer_number').first()
            
            if last_transfer:
                try:
                    last_num = int(last_transfer.transfer_number.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1
            
            self.transfer_number = f"TRF-{date_str}-{new_num:04d}"
        super().save(*args, **kwargs)


class StoreTransferItem(models.Model):
    transfer = models.ForeignKey(StoreTransfer, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    
    class Meta:
        unique_together = ['transfer', 'product']
    
    def __str__(self):
        return f"{self.product.name} - {self.quantity}"


class StoreStock(models.Model):
    store = models.CharField(max_length=100, db_index=True)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='store_stocks')
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shelf_location = models.CharField(max_length=100, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['store', 'product']
    
    def __str__(self):
        return f"{self.store} - {self.product.name}: {self.quantity}"


class InventoryAlert(models.Model):
    # Define ALERT_TYPES here - this was missing!
    ALERT_TYPES = [
        ('low_stock', 'Low Stock'),
        ('out_of_stock', 'Out of Stock'),
        ('expiring', 'Expiring Soon'),
        ('expired', 'Expired'),
        ('overstock', 'Overstock'),
        ('slow_moving', 'Slow Moving'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]
    
    alert_type = models.CharField(max_length=20, choices=ALERT_TYPES, db_index=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='alerts', null=True, blank=True)
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name='alerts', null=True, blank=True)
    store = models.CharField(max_length=100, blank=True)
    
    message = models.TextField()
    suggested_action = models.TextField(blank=True)
    
    is_resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_alert_type_display()} - {self.product.name if self.product else 'General'}"


class ImportJob(models.Model):
    JOB_TYPES = [
        ('products', 'Product Import'),
        ('suppliers', 'Supplier Import'),
        ('stock', 'Stock Update'),
        ('prices', 'Price Update'),
        ('purchase_orders', 'Purchase Order Import'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('partial', 'Partially Completed'),
    ]
    
    job_id = models.CharField(max_length=50, unique=True, editable=False)
    job_type = models.CharField(max_length=20, choices=JOB_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    original_filename = models.CharField(max_length=255)
    file_size = models.IntegerField()
    file_path = models.CharField(max_length=500, blank=True)
    
    total_records = models.IntegerField(default=0)
    successful_records = models.IntegerField(default=0)
    failed_records = models.IntegerField(default=0)
    skipped_records = models.IntegerField(default=0)
    
    error_log = models.JSONField(default=list)
    
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='import_jobs')
    
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.job_type} - {self.status}"
    
    def save(self, *args, **kwargs):
        if not self.job_id:
            date_str = datetime.now().strftime('%Y%m%d%H%M%S')
            self.job_id = f"IMP-{date_str}"
        super().save(*args, **kwargs)