# sales/serializers.py
from rest_framework import serializers
from decimal import Decimal
from django.db import transaction

from .models import Sale, SaleItem, Payment, Receipt
from customers.models import Customer
from users.models import User
from products.models import Product


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(read_only=True)
    product_sku = serializers.CharField(read_only=True)
    product_barcode = serializers.CharField(read_only=True)
    
    class Meta:
        model = SaleItem
        fields = [
            'id', 'product', 'product_name', 'product_sku', 'product_barcode',
            'unit_price', 'quantity', 'subtotal', 'discount_percentage',
            'discount_amount', 'total', 'is_returned', 'returned_quantity'
        ]
        read_only_fields = ['id', 'subtotal', 'discount_amount', 'total']
    
    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero")
        return value
    
    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative")
        return value


class PaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Payment
        fields = [
            'id', 'sale', 'payment_method', 'amount', 'mpesa_receipt_number',
            'mpesa_phone_number', 'card_last_four', 'card_transaction_id',
            'points_used', 'reference_number', 'payment_date', 'notes',
            'recorded_by', 'recorded_by_name'
        ]
        read_only_fields = ['id', 'payment_date', 'recorded_by_name']
    
    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() or obj.recorded_by.username


class ReceiptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receipt
        fields = [
            'id', 'sale', 'receipt_number', 'receipt_html', 'receipt_text',
            'sent_via_email', 'sent_via_sms', 'sent_via_whatsapp', 'printed',
            'generated_at', 'printed_at'
        ]
        read_only_fields = ['id', 'receipt_number', 'generated_at']


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    receipt = ReceiptSerializer(read_only=True)
    
    customer_name = serializers.SerializerMethodField()
    cashier_name = serializers.SerializerMethodField()
    
    cart_items = serializers.ListField(
        write_only=True,
        required=False,
        child=serializers.DictField(),
        help_text="List of {product_id, quantity, discount_percentage}"
    )
    
    class Meta:
        model = Sale
        fields = [
            'id', 'uuid', 'sale_id', 'status', 'payment_status',
            'customer', 'customer_name', 'cashier', 'cashier_name',
            'voided_by', 'void_reason', 'voided_at',
            'subtotal', 'discount_amount', 'discount_percentage',
            'tax_amount', 'tax_rate', 'total', 'amount_paid', 'change_due',
            'loyalty_points_earned', 'loyalty_points_redeemed', 'loyalty_discount',
            'notes', 'sale_date', 'updated_at',
            'items', 'payments', 'receipt',
            'cart_items'
        ]
        read_only_fields = [
            'id', 'uuid', 'sale_id', 'sale_date', 'updated_at',
            'subtotal', 'discount_amount', 'tax_amount', 'total',
            'amount_paid', 'change_due', 'loyalty_points_earned'
        ]
    
    def get_customer_name(self, obj):
        return obj.customer.name if obj.customer else 'Walk-in Customer'
    
    def get_cashier_name(self, obj):
        return obj.cashier.get_full_name() or obj.cashier.username
    
    def validate_cart_items(self, value):
        if not value:
            raise serializers.ValidationError("Cart cannot be empty")
        
        for item in value:
            if 'product_id' not in item:
                raise serializers.ValidationError("Each cart item must have product_id")
            if 'quantity' not in item:
                raise serializers.ValidationError("Each cart item must have quantity")
            
            try:
                product = Product.objects.get(id=item['product_id'], is_active=True)
                quantity = Decimal(str(item['quantity']))
                
                if product.stock_quantity < quantity:
                    raise serializers.ValidationError(
                        f"Insufficient stock for {product.name}. "
                        f"Available: {product.stock_quantity}, Requested: {quantity}"
                    )
            except Product.DoesNotExist:
                raise serializers.ValidationError(f"Product with id {item['product_id']} does not exist")
        
        return value
    
    @transaction.atomic
    def create(self, validated_data):
        cart_items = validated_data.pop('cart_items', [])
        request = self.context.get('request')
        cashier = request.user if request else None
        
        sale = Sale.objects.create(cashier=cashier, **validated_data)
        
        for item_data in cart_items:
            product = Product.objects.get(id=item_data['product_id'])
            quantity = Decimal(str(item_data['quantity']))
            discount_percentage = Decimal(str(item_data.get('discount_percentage', 0)))
            
            unit_price = product.retail_price
            
            if sale.customer and sale.customer.pricing_tier == 'wholesale':
                unit_price = product.wholesale_price or product.retail_price
            
            SaleItem.objects.create(
                sale=sale,
                product=product,
                product_name=product.name,
                product_sku=product.sku,
                product_barcode=product.barcode,
                unit_price=unit_price,
                quantity=quantity,
                discount_percentage=discount_percentage
            )
            
            product.stock_quantity -= quantity
            product.save(update_fields=['stock_quantity'])
        
        sale.calculate_totals()
        sale.status = 'completed'
        sale.save(update_fields=['status'])
        sale.add_loyalty_points()
        Receipt.objects.create(sale=sale)
        
        return sale


class SalePaymentSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(choices=Payment.PAYMENT_METHODS)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    
    mpesa_receipt_number = serializers.CharField(required=False, allow_blank=True)
    mpesa_phone_number = serializers.CharField(required=False, allow_blank=True)
    
    card_last_four = serializers.CharField(required=False, allow_blank=True, max_length=4)
    card_transaction_id = serializers.CharField(required=False, allow_blank=True)
    
    redeem_points = serializers.BooleanField(default=False)
    points_to_redeem = serializers.IntegerField(min_value=1, required=False)
    
    reference_number = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        payment_method = data.get('payment_method')
        
        if payment_method == 'mpesa':
            if not data.get('mpesa_receipt_number'):
                raise serializers.ValidationError("M-Pesa receipt number is required")
        
        return data


class LoyaltyRedemptionSerializer(serializers.Serializer):
    points_to_redeem = serializers.IntegerField(min_value=1)
    
    def validate_points_to_redeem(self, value):
        sale = self.context.get('sale')
        if sale and sale.customer:
            if value > sale.customer.loyalty_points:
                raise serializers.ValidationError(
                    f"Insufficient points. You have {sale.customer.loyalty_points} points"
                )
        return value