# customers/models.py
from django.db import models
from django.core.validators import RegexValidator, MinValueValidator
from django.core.exceptions import ValidationError
import uuid
from decimal import Decimal

class Customer(models.Model):
    """
    Customer model for ERP/POS system.
    Stores all customer information and loyalty data.
    """
    
    # === IDENTIFIERS ===
    # Auto-generated unique reference (e.g., CUST-0001 format)
    account_reference = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated unique customer ID"
    )
    
    # UUID for API exposure (never expose sequential IDs)
    uuid = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True,
        help_text="Public identifier for API"
    )
    
    # === PERSONAL INFORMATION ===
    name = models.CharField(
        max_length=200,
        db_index=True,
        help_text="Customer's full name or business name"
    )
    
    # Phone with Kenyan format validation
    phone = models.CharField(
        max_length=15,
        unique=True,
        validators=[
            RegexValidator(
                regex=r'^(\+254|0)[17]\d{8}$',
                message="Phone must be Kenyan format: 0712345678 or +254712345678"
            )
        ],
        help_text="Kenyan phone number (e.g., 0712345678)"
    )
    
    email = models.EmailField(
        unique=True,
        help_text="Primary email address"
    )
    
    # === ADDRESS INFORMATION ===
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    county = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    
    # === BUSINESS/TAX INFORMATION ===
    tax_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="KRA PIN for VAT purposes"
    )
    
    # === LOYALTY SYSTEM ===
    loyalty_points = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Accumulated loyalty points"
    )
    
    total_spent = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Lifetime spending total"
    )
    
    # Pricing tier (for advanced pricing rules)
    PRICING_TIERS = [
        ('retail', 'Retail Customer'),
        ('wholesale', 'Wholesale Customer'),
        ('vip', 'VIP Customer'),
    ]
    pricing_tier = models.CharField(
        max_length=20,
        choices=PRICING_TIERS,
        default='retail',
        help_text="Determines which price tier applies"
    )
    
    # === STATUS ===
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive customers cannot make purchases"
    )
    
    is_blacklisted = models.BooleanField(
        default=False,
        help_text="Blacklisted customers are blocked from sales"
    )
    
    # === NOTES ===
    notes = models.TextField(blank=True, help_text="Internal notes about customer")
    
    # === TIMESTAMPS ===
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_purchase_date = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['phone']),
            models.Index(fields=['email']),
            models.Index(fields=['account_reference']),
            models.Index(fields=['is_active']),
            models.Index(fields=['pricing_tier']),
            models.Index(fields=['last_purchase_date']),
        ]
        verbose_name = "Customer"
        verbose_name_plural = "Customers"
    
    def __str__(self):
        return f"{self.name} ({self.phone})"
    
    def save(self, *args, **kwargs):
        """Auto-generate account_reference if not set"""
        if not self.account_reference:
            # Get the last customer ID and increment
            last_customer = Customer.objects.order_by('-id').first()
            if last_customer:
                last_id = last_customer.id
                self.account_reference = f"CUST-{last_id + 1:06d}"
            else:
                self.account_reference = "CUST-000001"
        super().save(*args, **kwargs)
    
    def add_loyalty_points(self, points):
        """Add loyalty points (positive integer)"""
        if points < 0:
            raise ValidationError("Points must be positive")
        self.loyalty_points += points
        self.save(update_fields=['loyalty_points', 'updated_at'])
    
    def redeem_loyalty_points(self, points):

        """Redeem loyalty points for discount"""
        if points > self.loyalty_points:
            raise ValidationError("Insufficient loyalty points")
        if points < 0:
            raise ValidationError("Points must be positive")
        self.loyalty_points -= points
        self.save(update_fields=['loyalty_points', 'updated_at'])
        return points  # Return points redeemed (can be used for discount calculation)
    
    def update_spending(self, amount):
        """Update total spent and loyalty points (1 point per 100 KES)"""
        if amount < 0:
            raise ValidationError("Amount must be positive")
        self.total_spent += amount
        # Award loyalty points: 1 point per 100 KES spent
        points_earned = int(amount / 100)
        if points_earned > 0:
            self.loyalty_points += points_earned
        self.save(update_fields=['total_spent', 'loyalty_points', 'updated_at'])
    
    def get_discount_percentage(self):
        """Get discount percentage based on pricing tier"""
        discounts = {
            'retail': 0,
            'wholesale': 10,  # 10% discount
            'vip': 15,        # 15% discount
        }
        return discounts.get(self.pricing_tier, 0)
    
    @property
    def full_address(self):
        """Return formatted full address"""
        parts = [self.address_line1, self.address_line2, self.city, self.county]
        return ", ".join([p for p in parts if p])

class loyalty_points(models.Model):

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='loyalty_point_records'
    )

    points = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.customer.name} - {self.points} points"
    
