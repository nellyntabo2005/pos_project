# returns/serializers.py
from rest_framework import serializers
from decimal import Decimal
from django.db import transaction

from .models import Return, ReturnItem, ReturnImage, ReturnLog
from products.serializers import ProductSerializer
from sales.serializers import SaleSerializer, SaleItemSerializer
from customers.serializers import CustomerSerializer
from users.serializers import UserSerializer

from .models import Return, ReturnItem
from products.serializers import ProductSerializer
from sales.serializers import SaleSerializer


class ReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()

    original_price = serializers.SerializerMethodField()

    
    class Meta:
        model = ReturnItem
        fields = [

            'id', 'product', 'product_name', 'product_sku', 'original_sale_item',
            'quantity', 'refund_amount', 'item_reason', 'condition', 'restock',
            'original_price', 'created_at'
        ]
        read_only_fields = ['id', 'created_at'] [

               'id', 'product', 'product_name', 'product_sku',
               'quantity', 'refund_amount', 'reason', 'condition'
        ]
    def get_product_name(self, obj):
        return obj.product.name
    
    def get_product_sku(self, obj):
        return obj.product.sku
    
    def get_original_price(self, obj):
        return obj.original_sale_item.unit_price if obj.original_sale_item else 0


class ReturnImageSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ReturnImage
        fields = ['id', 'image', 'caption', 'uploaded_by', 'uploaded_by_name', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_by', 'uploaded_at']
    
    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else None


class ReturnLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ReturnLog
        fields = ['id', 'action', 'performed_by', 'performed_by_name', 'notes', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_performed_by_name(self, obj):
        return obj.performed_by.get_full_name() or obj.performed_by.username



class ReturnSerializer(serializers.ModelSerializer):
    items = ReturnItemSerializer(many=True, read_only=True)

    images = ReturnImageSerializer(many=True, read_only=True)
    logs = ReturnLogSerializer(many=True, read_only=True)
    
    original_sale_details = SaleSerializer(source='original_sale', read_only=True)
    customer_details = CustomerSerializer(source='customer', read_only=True)
    requested_by_details = UserSerializer(source='requested_by', read_only=True)
    approved_by_details = UserSerializer(source='approved_by', read_only=True)
    processed_by_details = UserSerializer(source='processed_by', read_only=True)
    
    customer_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    total_items_returned = serializers.IntegerField(read_only=True)
    days_since_return = serializers.IntegerField(read_only=True)
    
    return_items = serializers.ListField(
        write_only=True,
        required=True,
        child=serializers.DictField(),
        help_text="List of items being returned"
    )

    original_sale_details = SaleSerializer(source='original_sale', read_only=True)
    customer_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    
    # Write-only for creating
    return_items = serializers.ListField(write_only=True, required=False)

    class Meta:
        model = Return
        fields = [
            'id', 'return_number', 'uuid', 'original_sale', 'original_sale_details',

            'customer', 'customer_details', 'customer_name',
            'reason', 'reason_description', 'status',
            'refund_amount', 'restocking_fee', 'shipping_refund', 'net_refund',
            'refund_method', 'mpesa_phone', 'mpesa_refund_code',
            'bank_name', 'bank_account', 'bank_reference',
            'store_credit_code', 'store_credit_expiry',
            'restock_items', 'item_condition',
            'requested_by', 'requested_by_details', 'requested_by_name',
            'approved_by', 'approved_by_details',
            'processed_by', 'processed_by_details',
            'customer_notes', 'staff_notes', 'rejection_reason',
            'return_date', 'approved_at', 'processed_at', 'updated_at',
            'items', 'images', 'logs',
            'total_items_returned', 'days_since_return',
            'return_items'
        ]
        read_only_fields = [
            'id', 'return_number', 'uuid', 'return_date', 'approved_at',
            'processed_at', 'updated_at', 'net_refund', 'total_items_returned',
            'days_since_return'

            'customer', 'customer_name', 'reason', 'reason_description',
            'status', 'refund_amount', 'restocking_fee', 'net_refund',
            'refund_method', 'restock', 'notes', 'staff_notes',
            'requested_by', 'requested_by_name', 'approved_by', 'processed_by',
            'return_date', 'approved_at', 'processed_at',
            'items', 'return_items'
        ]
        read_only_fields = [
            'id', 'return_number', 'uuid', 'return_date', 'approved_at',
            'processed_at', 'net_refund'
        ]
    
    def get_customer_name(self, obj):
        return obj.customer.name
    
    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username
    

    @transaction.atomic
    def create(self, validated_data):
        return_items_data = validated_data.pop('return_items')
        original_sale = validated_data['original_sale']
        
        return_obj = Return.objects.create(**validated_data)
        
        for item_data in return_items_data:
            original_sale_item = item_data['original_sale_item']
            quantity = Decimal(str(item_data['quantity']))
            refund_amount = Decimal(str(item_data['refund_amount']))
            
            ReturnItem.objects.create(
                return_obj=return_obj,
                original_sale_item=original_sale_item,
                product=original_sale_item.product,
                quantity=quantity,
                refund_amount=refund_amount,
                item_reason=item_data.get('item_reason', ''),
                condition=item_data.get('condition', 'good'),
                restock=item_data.get('restock', True)
            )
        
        ReturnLog.objects.create(
            return_obj=return_obj,
            action='created',
            performed_by=validated_data['requested_by'],
            notes=f"Return created for sale {original_sale.sale_id}"
        )
        
        return return_obj


class ReturnApproveSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class ReturnRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ReturnProcessSerializer(serializers.Serializer):
    refund_method = serializers.ChoiceField(choices=Return.REFUND_METHODS, required=False)
    mpesa_phone = serializers.CharField(required=False, allow_blank=True)
    bank_name = serializers.CharField(required=False, allow_blank=True)
    bank_account = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
def validate_refund_amount(self, value):
        #Ensure refund amount doesn't exceed sale total
        if self.instance and self.instance.original_sale:
            if value > self.instance.original_sale.total:
                raise serializers.ValidationError(
                    f"Refund amount cannot exceed sale total of {self.instance.original_sale.total}"
                )
        return value
    
def create(self, validated_data):
        return_items = validated_data.pop('return_items', [])
        return_obj = Return.objects.create(**validated_data)
        
        for item in return_items:
            ReturnItem.objects.create(return_obj=return_obj, **item)
        
        return return_obj

