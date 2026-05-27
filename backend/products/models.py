# products/models.py
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal
import uuid


class Supplier(models.Model):
    """Supplier model - must be defined before Product"""
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True, blank=True)
    contact_person = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.code:
            last = Supplier.objects.order_by('-id').first()
            if last and last.code:
                try:
                    num = int(last.code.split('-')[1]) + 1
                    self.code = f"SUP-{num:04d}"
                except:
                    self.code = "SUP-0001"
            else:
                self.code = "SUP-0001"
        super().save(*args, **kwargs)


class Category(models.Model):
    """Product Category model"""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self.name.lower().replace(' ', '-')
        super().save(*args, **kwargs)


class Product(models.Model):
    """Main Product model"""
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
    sku = models.CharField(max_length=50, unique=True, blank=True)
    barcode = models.CharField(max_length=100, unique=True, blank=True)
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    # Basic info
    name = models.CharField(max_length=200, db_index=True)
    description = models.TextField(blank=True)

    # Relationships
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)

    # Pricing
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    retail_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Stock
    stock_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Units & Tax
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default='piece')
    tax_rate = models.IntegerField(choices=TAX_CHOICES, default=16)

    # Status
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)

    # Image
    main_image = models.ImageField(upload_to='products/', null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.sku})"

    def save(self, *args, **kwargs):
        if not self.sku:
            prefix = self.category.name[:3].upper() if self.category else 'PRD'
            last = Product.objects.order_by('-id').first()
            if last and last.sku:
                try:
                    num = int(last.sku.split('-')[1]) + 1
                    self.sku = f"{prefix}-{num:06d}"
                except:
                    self.sku = f"{prefix}-000001"
            else:
                self.sku = f"{prefix}-000001"
        super().save(*args, **kwargs)


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