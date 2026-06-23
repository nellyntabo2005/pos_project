# inventory/models.py
from django.db import models, transaction
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError
from decimal import Decimal
import uuid
from datetime import datetime
from django.utils import timezone

from products.models import Product, Category

# SUPPLIER MODEL (MOVED FROM PRODUCTS)

class Supplier(models.Model):
    """Supplier/Vendor model - moved from products to inventory"""
    
    name = models.CharField(max_length=200, db_index=True)
    code = models.CharField(max_length=20, unique=True, blank=True)
    contact_person = models.CharField(max_length=100, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, db_index=True)
    alternate_phone = models.CharField(max_length=20, blank=True)
    fax_number = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    supplier_type = models.CharField(max_length=50, blank=True)
    supplier_category = models.CharField(max_length=100, blank=True)
    registration_number = models.CharField(max_length=100, blank=True)
    
    # Address
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    county = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True, default='Kenya')
    
    # Tax info
    tax_number = models.CharField(max_length=50, blank=True)
    
    # Bank details
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account = models.CharField(max_length=50, blank=True)
    currency = models.CharField(max_length=10, blank=True, default='KES')
    credit_limit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    preferred_payment_method = models.CharField(max_length=50, blank=True)
    mpesa_paybill = models.CharField(max_length=30, blank=True)
    mpesa_till = models.CharField(max_length=30, blank=True)
    default_warehouse = models.CharField(max_length=100, blank=True)
    minimum_order_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    lead_time_days = models.PositiveIntegerField(default=0)
    uploaded_documents = models.JSONField(default=list, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    is_preferred = models.BooleanField(default=False)
    
    # Payment terms
    payment_terms = models.IntegerField(default=30)
    
    # Notes
    notes = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['phone']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        return self.name
    
    def save(self, *args, **kwargs):
        if not self.code:
            next_number = Supplier.objects.count() + 1
            while True:
                candidate = f"SUP-{next_number:04d}"
                if not Supplier.objects.filter(code=candidate).exclude(pk=self.pk).exists():
                    self.code = candidate
                    break
                next_number += 1
        super().save(*args, **kwargs)


# ============================================================
# BATCH MODEL
# ============================================================
class Batch(models.Model):
    """Product batches for tracking expiry dates"""
    
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
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active', db_index=True)
    
    location = models.CharField(max_length=100, blank=True, default='Main Store')
    shelf_location = models.CharField(max_length=50, blank=True)
    
    quality_passed = models.BooleanField(default=True)
    quality_notes = models.TextField(blank=True)
    inspected_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True)
    inspected_at = models.DateTimeField(null=True, blank=True)
    
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['expiry_date', 'batch_number']
    
    def __str__(self):
        return f"{self.batch_number} - {self.product.name}"
    
    def save(self, *args, **kwargs):
        if self.expiry_date and self.expiry_date < datetime.now().date():
            self.status = 'expired'
        elif self.remaining_quantity <= 0:
            self.status = 'depleted'
        super().save(*args, **kwargs)


# ============================================================
# STOCK MOVEMENT MODEL
# ============================================================
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
    ]
    
    movement_id = models.CharField(max_length=50, unique=True, editable=False, db_index=True)
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='movements', db_index=True)
    batch = models.ForeignKey(Batch, on_delete=models.SET_NULL, null=True, blank=True, related_name='movements')
    
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES, db_index=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    
    stock_before = models.DecimalField(max_digits=12, decimal_places=2)
    stock_after = models.DecimalField(max_digits=12, decimal_places=2)
    
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    reference_id = models.CharField(max_length=100, blank=True, db_index=True)
    reference_type = models.CharField(max_length=50, blank=True)
    
    reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    approved_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_movements')
    recorded_by = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='stock_movements')
    
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


# ============================================================
# PURCHASE ORDER MODEL
# ============================================================
class PurchaseOrder(models.Model):
    ORDER_STATUS = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('confirmed', 'Confirmed'),
        ('shipped', 'Shipped'),
        ('receiving', 'Receiving Pending Verification'),
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
    
    created_by = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='purchase_orders')
    approved_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_orders')
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
    
    def calculate_totals(self):
        items = self.items.all()
        self.subtotal = sum(item.subtotal for item in items)
        tax_rate = Decimal(str(self.tax_rate)) / Decimal('100')
        self.tax_amount = self.subtotal * tax_rate
        self.total = self.subtotal + self.tax_amount + self.shipping_cost - self.discount_amount
        self.save(update_fields=['subtotal', 'tax_amount', 'total'])
        return self.total

    def submit(self):
        self.status = 'submitted'
        self.save(update_fields=['status', 'updated_at'])

    def approve(self, user):
        self.status = 'confirmed'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

    def receive_items(self, user, received_items):
        grn = GoodsReceivedNote.objects.create(
            purchase_order=self,
            supplier=self.supplier,
            created_by=user,
            notes='Goods received pending verification',
        )

        for received_item in received_items:
            item = self.items.select_related('product').get(id=received_item['item_id'])
            quantity = Decimal(str(received_item['quantity']))
            remaining = item.remaining_to_receive - item.pending_verification_quantity
            if quantity > remaining:
                raise ValidationError(f"Cannot receive {quantity} for {item.product.name}. Remaining: {remaining}")

            GoodsReceivedNoteItem.objects.create(
                goods_received_note=grn,
                purchase_order_item=item,
                product=item.product,
                quantity=quantity,
                batch_number=received_item.get('batch_number', ''),
                manufacturing_date=received_item.get('manufacturing_date'),
                expiry_date=received_item.get('expiry_date'),
                location=received_item.get('location', 'Main Store'),
                notes=received_item.get('notes', ''),
            )

        self.status = 'receiving'
        self.delivery_date = timezone.now()
        self.save(update_fields=['status', 'delivery_date', 'updated_at'])
        return grn


class PurchaseOrderItem(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    
    quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
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
        discount_rate = Decimal(str(self.discount_percentage)) / Decimal('100')
        self.discount_amount = self.subtotal * discount_rate
        self.total = self.subtotal - self.discount_amount
        super().save(*args, **kwargs)
        self.purchase_order.calculate_totals()
    
    def __str__(self):
        return f"{self.product.name} - {self.quantity}"

    @property
    def remaining_to_receive(self):
        return max(self.quantity - self.quantity_received, Decimal('0'))

    @property
    def pending_verification_quantity(self):
        total = self.grn_items.filter(
            goods_received_note__status='pending',
            is_verified=False,
        ).aggregate(total=models.Sum('quantity'))['total']
        return total or Decimal('0')


class GoodsReceivedNote(models.Model):
    GRN_STATUS = [
        ('pending', 'Pending Verification'),
        ('verified', 'Verified and Posted'),
        ('cancelled', 'Cancelled'),
    ]

    grn_number = models.CharField(max_length=50, unique=True, editable=False, db_index=True)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name='goods_received_notes')
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='goods_received_notes')
    status = models.CharField(max_length=20, choices=GRN_STATUS, default='pending', db_index=True)

    created_by = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='goods_received_notes')
    verified_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_goods_received_notes')
    verified_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.grn_number} - {self.purchase_order.po_number}"

    def save(self, *args, **kwargs):
        if not self.grn_number:
            date_str = datetime.now().strftime('%Y%m%d')
            last_grn = GoodsReceivedNote.objects.filter(
                grn_number__startswith=f'GRN-{date_str}'
            ).order_by('-grn_number').first()

            if last_grn:
                try:
                    last_num = int(last_grn.grn_number.split('-')[-1])
                    new_num = last_num + 1
                except (IndexError, ValueError):
                    new_num = 1
            else:
                new_num = 1

            self.grn_number = f"GRN-{date_str}-{new_num:05d}"
        super().save(*args, **kwargs)

    @transaction.atomic
    def verify_items(self, user, item_ids=None):
        if self.status == 'cancelled':
            raise ValidationError('Cannot verify a cancelled GRN')

        items = self.items.select_related('product', 'purchase_order_item')
        if item_ids:
            items = items.filter(id__in=item_ids)

        posted_count = 0
        for grn_item in items.filter(is_verified=False):
            po_item = grn_item.purchase_order_item
            product = grn_item.product
            remaining = po_item.remaining_to_receive
            if grn_item.quantity > remaining:
                raise ValidationError(f"Cannot verify {grn_item.quantity} for {product.name}. Remaining: {remaining}")

            stock_before = product.stock_quantity
            product.stock_quantity = stock_before + grn_item.quantity
            product.save(update_fields=['stock_quantity', 'updated_at'])

            po_item.quantity_received += grn_item.quantity
            po_item.save(update_fields=['quantity_received'])

            batch = None
            if grn_item.batch_number:
                batch, _ = Batch.objects.get_or_create(
                    batch_number=grn_item.batch_number,
                    defaults={
                        'product': product,
                        'quantity': grn_item.quantity,
                        'remaining_quantity': grn_item.quantity,
                        'manufacturing_date': grn_item.manufacturing_date,
                        'expiry_date': grn_item.expiry_date,
                        'purchase_order': self.purchase_order,
                        'purchase_price': po_item.unit_cost,
                        'supplier': self.supplier,
                        'location': grn_item.location,
                        'notes': grn_item.notes,
                    }
                )

            StockMovement.objects.create(
                product=product,
                batch=batch,
                movement_type='purchase',
                quantity=grn_item.quantity,
                stock_before=stock_before,
                stock_after=product.stock_quantity,
                unit_cost=po_item.unit_cost,
                reference_id=self.grn_number,
                reference_type='goods_received_note',
                reason='Goods received and verified from supplier',
                notes=grn_item.notes,
                recorded_by=user,
                location=grn_item.location,
            )

            grn_item.is_verified = True
            grn_item.verified_by = user
            grn_item.verified_at = timezone.now()
            grn_item.save(update_fields=['is_verified', 'verified_by', 'verified_at'])
            posted_count += 1

        if not self.items.filter(is_verified=False).exists():
            self.status = 'verified'
            self.verified_by = user
            self.verified_at = timezone.now()
            self.save(update_fields=['status', 'verified_by', 'verified_at', 'updated_at'])

        purchase_order = self.purchase_order
        if all(item.remaining_to_receive <= 0 for item in purchase_order.items.all()):
            purchase_order.status = 'completed'
        elif purchase_order.items.filter(quantity_received__gt=0).exists():
            purchase_order.status = 'received'
        else:
            purchase_order.status = 'receiving'
        purchase_order.save(update_fields=['status', 'updated_at'])

        return posted_count


class GoodsReceivedNoteItem(models.Model):
    goods_received_note = models.ForeignKey(GoodsReceivedNote, on_delete=models.CASCADE, related_name='items')
    purchase_order_item = models.ForeignKey(PurchaseOrderItem, on_delete=models.PROTECT, related_name='grn_items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])

    batch_number = models.CharField(max_length=50, blank=True)
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=100, blank=True, default='Main Store')
    notes = models.TextField(blank=True)

    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_goods_received_note_items')
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.goods_received_note.grn_number} - {self.product.name} - {self.quantity}"


# ============================================================
# STOCK COUNT MODELS
# ============================================================
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
    
    created_by = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='stock_counts')
    completed_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='completed_counts')
    
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

    @transaction.atomic
    def start_count(self):
        if not self.items.exists():
            products = Product.objects.filter(is_active=True)
            StockCountItem.objects.bulk_create([
                StockCountItem(
                    stock_count=self,
                    product=product,
                    expected_quantity=product.stock_quantity,
                    counted_quantity=product.stock_quantity,
                )
                for product in products
            ])

        self.total_products = self.items.count()
        self.status = 'in_progress'
        self.save(update_fields=['total_products', 'status'])

    @transaction.atomic
    def complete_count(self, user):
        discrepancies = self.items.filter(is_discrepancy=True).select_related('product')
        total_adjustment_value = Decimal('0')

        for item in discrepancies:
            product = item.product
            old_stock = product.stock_quantity
            product.stock_quantity = item.counted_quantity
            product.save(update_fields=['stock_quantity'])

            adjustment_quantity = abs(item.difference)
            total_adjustment_value += abs(item.difference * product.cost_price)

            if adjustment_quantity > 0:
                StockMovement.objects.create(
                    product=product,
                    movement_type='count',
                    quantity=adjustment_quantity,
                    stock_before=old_stock,
                    stock_after=product.stock_quantity,
                    unit_cost=product.cost_price,
                    reference_id=self.count_number,
                    reference_type='StockCount',
                    reason='Physical stock count adjustment',
                    notes=item.notes,
                    recorded_by=user,
                    location=self.location,
                )

        self.total_products = self.items.count()
        self.total_discrepancies = discrepancies.count()
        self.total_adjustment_value = total_adjustment_value
        self.status = 'completed'
        self.completed_by = user
        self.completed_at = timezone.now()
        self.save(update_fields=[
            'total_products', 'total_discrepancies', 'total_adjustment_value',
            'status', 'completed_by', 'completed_at'
        ])


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
        return f"{self.product.name}: {self.difference}"


# ============================================================
# STORE TRANSFER MODELS
# ============================================================
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
    
    requested_by = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='transfers_requested')
    approved_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_approved')
    received_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='transfers_received')
    
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

    def approve_transfer(self, user):
        self.status = 'approved'
        self.approved_by = user
        self.save(update_fields=['status', 'approved_by', 'updated_at'])

    def send_transfer(self):
        self.status = 'in_transit'
        self.save(update_fields=['status', 'updated_at'])

    def receive_transfer(self, user):
        self.status = 'received'
        self.received_by = user
        self.received_date = timezone.now()
        self.save(update_fields=['status', 'received_by', 'received_date', 'updated_at'])


class StoreTransferItem(models.Model):
    transfer = models.ForeignKey(StoreTransfer, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    
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

    @property
    def is_low_stock(self):
        return self.reorder_level > 0 and self.quantity <= self.reorder_level


class ImportJob(models.Model):
    """Track imports/exports processing jobs"""

    JOB_TYPE_CHOICES = [
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
    job_type = models.CharField(max_length=20, choices=JOB_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    original_filename = models.CharField(max_length=255)
    file_size = models.IntegerField()
    file_path = models.CharField(max_length=500, blank=True)

    total_records = models.IntegerField(default=0)
    successful_records = models.IntegerField(default=0)
    failed_records = models.IntegerField(default=0)
    skipped_records = models.IntegerField(default=0)
    error_log = models.JSONField(default=list)

    created_by = models.ForeignKey('users.User', on_delete=models.PROTECT, related_name='inventory_import_jobs')

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.job_id} ({self.get_status_display()})"


class InventoryAlert(models.Model):

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
    resolved_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_alert_type_display()} - {self.product.name if self.product else 'General'}"

    def resolve(self, user, notes=''):
        self.is_resolved = True
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.resolution_notes = notes
        self.save(update_fields=['is_resolved', 'resolved_by', 'resolved_at', 'resolution_notes'])
