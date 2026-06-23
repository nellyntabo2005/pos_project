# products/models.py
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal
import uuid


class Category(models.Model):
    """Product Category model"""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['name']
    
    def __str__(self):
        if self.parent:
            return f"{self.parent.name} > {self.name}"
        return self.name
    
    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self.name.lower().replace(' ', '-')
        super().save(*args, **kwargs)


class Product(models.Model):
    """Main Product model - Supplier is now in inventory app"""
    
    UNIT_CHOICES = [
        ('piece', 'Piece'),
        ('kg', 'Kilogram'),
        ('g', 'Gram'),
        ('l', 'Liter'),
        ('ml', 'Milliliter'),
        ('box', 'Box'),
        ('carton', 'Carton'),
        ('pack', 'Pack'),
    ]
    
    TAX_CHOICES = [
        (0, '0%'),
        (8, '8%'),
        (16, '16%'),
    ]
    
    # Identifiers
    sku = models.CharField(max_length=50, unique=True, editable=False, db_index=True)
    barcode = models.CharField(max_length=100, unique=True, blank=True, db_index=True)
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    
    # Basic info
    name = models.CharField(max_length=200, db_index=True)
    description = models.TextField(blank=True)
    generic_name = models.CharField(max_length=120, blank=True, db_index=True)
    brand = models.CharField(max_length=120, blank=True, db_index=True)
    variant = models.CharField(max_length=120, blank=True)
    pack_size = models.CharField(max_length=80, blank=True)
    model_number = models.CharField(max_length=80, blank=True)
    
    # Category (still in products)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    
    # Supplier - NOW REFERENCES INVENTORY APP
    supplier = models.ForeignKey(
        'inventory.Supplier', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='products'
    )
    supplier_sku = models.CharField(max_length=50, blank=True)
    
    # Pricing
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    retail_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    carton_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    carton_quantity = models.IntegerField(default=1)
    
    # Stock
    stock_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    reorder_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    minimum_stock = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    maximum_stock = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reserved_stock = models.IntegerField(default=0)
    
    # Unit & Tax
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default='piece')
    tax_rate = models.IntegerField(choices=TAX_CHOICES, default=16)
    
    # Weight & Dimensions
    weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    length = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    width = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    # Status
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    is_digital = models.BooleanField(default=False)
    
    # Image
    main_image = models.ImageField(upload_to='products/', null=True, blank=True)
    external_image_url = models.URLField(blank=True)
    
    # Notes
    notes = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_purchased_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['sku']),
            models.Index(fields=['barcode']),
            models.Index(fields=['name']),
            models.Index(fields=['generic_name']),
            models.Index(fields=['brand']),
            models.Index(fields=['category']),
            models.Index(fields=['supplier']),
            models.Index(fields=['is_active']),
            models.Index(fields=['stock_quantity']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.sku})"
    
    def save(self, *args, **kwargs):
        if not self.sku:
            prefix = self.category.name[:3].upper() if self.category else 'PRD'
            last_product = Product.objects.order_by('-id').first()
            if last_product and last_product.sku:
                try:
                    last_num = int(last_product.sku.split('-')[1])
                    self.sku = f"{prefix}-{last_num + 1:06d}"
                except (IndexError, ValueError):
                    self.sku = f"{prefix}-000001"
            else:
                self.sku = f"{prefix}-000001"
        if not self.barcode:
            while True:
                generated_barcode = f"BC-{uuid.uuid4().hex[:12].upper()}"
                if not Product.objects.filter(barcode=generated_barcode).exclude(pk=self.pk).exists():
                    self.barcode = generated_barcode
                    break
        super().save(*args, **kwargs)
    
    @property
    def profit_margin(self):
        if self.cost_price > 0:
            return ((self.retail_price - self.cost_price) / self.cost_price) * 100
        return 0
    
    @property
    def is_low_stock(self):
        return self.stock_quantity <= self.reorder_level and self.reorder_level > 0
    
    @property
    def stock_value(self):
        return self.stock_quantity * self.cost_price


class ProductImage(models.Model):
    """Product Images"""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/')
    caption = models.CharField(max_length=200, blank=True)
    is_primary = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['order']
    
    def __str__(self):
        return f"Image for {self.product.name}"
