# inventory/serializers.py
from rest_framework import serializers
from decimal import Decimal
from django.db import transaction
from .models import (
    StockMovement, Supplier, Batch, PurchaseOrder, PurchaseOrderItem,
    StockCount, StockCountItem, StoreTransfer, StoreTransferItem,
    StoreStock, InventoryAlert, ImportJob

)


from products.serializers import ProductSerializer
from products.models import Product
from .models import Supplier

from users.serializers import UserSerializer
  
class SupplierSerializer(serializers.ModelSerializer):
    """Serializer for Suppliers"""
    
    class Meta:
        model = Supplier
        fields = [
            'id', 'name', 'code', 'contact_person', 'phone', 'email',
            'website', 'address_line1', 'address_line2', 'city', 'county',
            'postal_code', 'tax_number', 'bank_name', 'bank_account',
            'is_active', 'is_preferred', 'payment_terms', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'code', 'created_at', 'updated_at']

class BatchSerializer(serializers.ModelSerializer):
    """
    Serializer for Product Batches
    """
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_expiring_soon = serializers.BooleanField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    supplier_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Batch
        fields = [
            'id', 'batch_number', 'product', 'product_name', 'product_sku',
            'quantity', 'remaining_quantity', 'manufacturing_date', 'expiry_date',
            'purchase_order', 'purchase_price', 'supplier', 'supplier_name',
            'status', 'location', 'shelf_location', 'quality_passed',
            'quality_notes', 'inspected_by', 'inspected_at', 'notes',
            'is_expired', 'is_expiring_soon', 'days_until_expiry',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'is_expired', 
                           'is_expiring_soon', 'days_until_expiry']
    
    def get_product_name(self, obj):
        return obj.product.name
    
    def get_product_sku(self, obj):
        return obj.product.sku
    
    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None


class StockMovementSerializer(serializers.ModelSerializer):
    """
    Serializer for Stock Movements (Audit Trail)
    """
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    batch_number = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    movement_type_display = serializers.SerializerMethodField()
    
    class Meta:
        model = StockMovement
        fields = [
            'id', 'movement_id', 'uuid', 'product', 'product_name', 
            'product_sku', 'batch', 'batch_number', 'movement_type',
            'movement_type_display', 'quantity', 'stock_before', 'stock_after',
            'unit_cost', 'unit_price', 'reference_id', 'reference_type',
            'reason', 'notes', 'approved_by', 'approved_by_name',
            'recorded_by', 'recorded_by_name', 'location',
            'movement_date', 'created_at'
        ]
        read_only_fields = ['id', 'movement_id', 'uuid', 'movement_date', 'created_at']
    
    def get_product_name(self, obj):
        return obj.product.name
    
    def get_product_sku(self, obj):
        return obj.product.sku
    
    def get_batch_number(self, obj):
        return obj.batch.batch_number if obj.batch else None
    
    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() or obj.recorded_by.username
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
    
    def get_movement_type_display(self, obj):
        return dict(StockMovement.MOVEMENT_TYPES).get(obj.movement_type, obj.movement_type)


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    """
    Serializer for Purchase Order Items
    """
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    remaining_to_receive = serializers.DecimalField(read_only=True, max_digits=12, decimal_places=2)
    
    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id', 'product', 'product_name', 'product_sku', 'quantity',
            'quantity_received', 'remaining_to_receive', 'unit_cost',
            'subtotal', 'discount_percentage', 'discount_amount', 'total',
            'expected_delivery_date', 'notes'
        ]
        read_only_fields = ['id', 'subtotal', 'discount_amount', 'total', 'quantity_received']
    
    def get_product_name(self, obj):
        return obj.product.name
    
    def get_product_sku(self, obj):
        return obj.product.sku


class PurchaseOrderSerializer(serializers.ModelSerializer):
    """
    Serializer for Purchase Orders
    """
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    supplier_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    
    # Write-only for creating items
    order_items = serializers.ListField(
        write_only=True,
        required=False,
        child=serializers.DictField(),
        help_text="List of items to order"
    )
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'uuid', 'supplier', 'supplier_name',
            'order_date', 'expected_delivery_date', 'delivery_date',
            'status', 'status_display', 'subtotal', 'tax_amount', 'tax_rate',
            'shipping_cost', 'discount_amount', 'total', 'payment_terms',
            'payment_status', 'shipping_method', 'tracking_number', 'courier',
            'supplier_notes', 'internal_notes', 'created_by', 'created_by_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'created_at', 'updated_at', 'items', 'order_items'
        ]
        read_only_fields = [
            'id', 'po_number', 'uuid', 'order_date', 'subtotal', 'total',
            'created_at', 'updated_at', 'approved_at'
        ]
    
    def get_supplier_name(self, obj):
        return obj.supplier.name
    
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
    
    def get_status_display(self, obj):
        return dict(PurchaseOrder.ORDER_STATUS).get(obj.status, obj.status)
    
    def validate_order_items(self, value):
        """Validate order items before processing"""
        if not value:
            raise serializers.ValidationError("At least one item is required")
        
        for item in value:
            if 'product_id' not in item:
                raise serializers.ValidationError("Each item must have product_id")
            if 'quantity' not in item:
                raise serializers.ValidationError("Each item must have quantity")
            if 'unit_cost' not in item:
                raise serializers.ValidationError("Each item must have unit_cost")
        
        return value
    
    @transaction.atomic
    def create(self, validated_data):
        """Create purchase order with items"""
        order_items = validated_data.pop('order_items', [])
        purchase_order = PurchaseOrder.objects.create(**validated_data)
        
        for item in order_items:
            PurchaseOrderItem.objects.create(
                purchase_order=purchase_order,
                product_id=item['product_id'],
                quantity=Decimal(str(item['quantity'])),
                unit_cost=Decimal(str(item['unit_cost'])),
                discount_percentage=Decimal(str(item.get('discount_percentage', 0))),
                expected_delivery_date=item.get('expected_delivery_date'),
                notes=item.get('notes', '')
            )
        
        return purchase_order


class PurchaseOrderReceiveSerializer(serializers.Serializer):
    """
    Serializer for receiving purchase order items
    """
    item_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0.01)
    batch_number = serializers.CharField(required=False, allow_blank=True)
    manufacturing_date = serializers.DateField(required=False, allow_null=True)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    location = serializers.CharField(required=False, default='Main Store')
    notes = serializers.CharField(required=False, allow_blank=True)


class StockCountItemSerializer(serializers.ModelSerializer):
    """
    Serializer for Stock Count Items
    """
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    
    class Meta:
        model = StockCountItem
        fields = [
            'id', 'product', 'product_name', 'product_sku', 'expected_quantity',
            'counted_quantity', 'difference', 'is_discrepancy', 'notes'
        ]
        read_only_fields = ['id', 'difference', 'is_discrepancy']
    
    def get_product_name(self, obj):
        return obj.product.name
    
    def get_product_sku(self, obj):
        return obj.product.sku


class StockCountSerializer(serializers.ModelSerializer):
    """
    Serializer for Stock Counts
    """
    items = StockCountItemSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    
    # Write-only for adding items
    count_items = serializers.ListField(
        write_only=True, 
        required=False,
        child=serializers.DictField()
    )
    
    class Meta:
        model = StockCount
        fields = [
            'id', 'count_number', 'location', 'count_date', 'status',
            'status_display', 'notes', 'total_products', 'total_discrepancies',
            'total_adjustment_value', 'created_by', 'created_by_name',
            'completed_by', 'completed_by_name', 'created_at', 'completed_at',
            'items', 'count_items'
        ]
        read_only_fields = [
            'id', 'count_number', 'total_products', 'total_discrepancies',
            'total_adjustment_value', 'created_at', 'completed_at'
        ]
    
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username
    
    def get_completed_by_name(self, obj):
        return obj.completed_by.get_full_name() if obj.completed_by else None
    
    def get_status_display(self, obj):
        return dict(StockCount.STATUS_CHOICES).get(obj.status, obj.status)
    
    def create(self, validated_data):
        """Create stock count with items"""
        count_items = validated_data.pop('count_items', [])
        stock_count = StockCount.objects.create(**validated_data)
        
        for item in count_items:
            product = Product.objects.get(id=item['product_id'])
            StockCountItem.objects.create(
                stock_count=stock_count,
                product=product,
                expected_quantity=product.stock_quantity,
                counted_quantity=item.get('counted_quantity', product.stock_quantity),
                notes=item.get('notes', '')
            )
        
        stock_count.total_products = stock_count.items.count()
        stock_count.save()
        
        return stock_count


class StoreTransferItemSerializer(serializers.ModelSerializer):
    """
    Serializer for Store Transfer Items
    """
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    
    class Meta:
        model = StoreTransferItem
        fields = ['id', 'product', 'product_name', 'product_sku', 'quantity']
    
    def get_product_name(self, obj):
        return obj.product.name
    
    def get_product_sku(self, obj):
        return obj.product.sku


class StoreTransferSerializer(serializers.ModelSerializer):
    """
    Serializer for Store Transfers
    """
    items = StoreTransferItemSerializer(many=True, read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    received_by_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    
    transfer_items = serializers.ListField(
        write_only=True, 
        required=False,
        child=serializers.DictField()
    )
    
    class Meta:
        model = StoreTransfer
        fields = [
            'id', 'transfer_number', 'from_store', 'to_store', 'status',
            'status_display', 'transfer_date', 'expected_delivery_date',
            'received_date', 'reason', 'notes', 'tracking_number', 'courier',
            'requested_by', 'requested_by_name', 'approved_by', 'approved_by_name',
            'received_by', 'received_by_name', 'created_at', 'updated_at',
            'items', 'transfer_items'
        ]
        read_only_fields = [
            'id', 'transfer_number', 'transfer_date', 'created_at', 'updated_at'
        ]
    
    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
    
    def get_received_by_name(self, obj):
        return obj.received_by.get_full_name() if obj.received_by else None
    
    def get_status_display(self, obj):
        return dict(StoreTransfer.TRANSFER_STATUS).get(obj.status, obj.status)
    
    def create(self, validated_data):
        """Create store transfer with items"""
        transfer_items = validated_data.pop('transfer_items', [])
        transfer = StoreTransfer.objects.create(**validated_data)
        
        for item in transfer_items:
            StoreTransferItem.objects.create(
                transfer=transfer,
                product_id=item['product_id'],
                quantity=Decimal(str(item['quantity']))
            )
        
        return transfer


class StoreStockSerializer(serializers.ModelSerializer):
    """
    Serializer for Store Stock Levels
    """
    product_details = ProductSerializer(source='product', read_only=True)
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    is_low_stock = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = StoreStock
        fields = [
            'id', 'store', 'product', 'product_name', 'product_sku',
            'product_details', 'quantity', 'reorder_level', 'shelf_location',
            'is_low_stock', 'updated_at'
        ]
        read_only_fields = ['id', 'updated_at', 'is_low_stock']
    
    def get_product_name(self, obj):
        return obj.product.name
    
    def get_product_sku(self, obj):
        return obj.product.sku


class InventoryAlertSerializer(serializers.ModelSerializer):
    """
    Serializer for Inventory Alerts
    """
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    batch_number = serializers.SerializerMethodField()
    alert_type_display = serializers.SerializerMethodField()
    priority_display = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = InventoryAlert
        fields = [
            'id', 'alert_type', 'alert_type_display', 'priority',
            'priority_display', 'product', 'product_name', 'product_sku',
            'batch', 'batch_number', 'store', 'message', 'suggested_action',
            'is_resolved', 'resolved_by', 'resolved_by_name', 'resolved_at',
            'resolution_notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
    
    def get_product_name(self, obj):
        return obj.product.name if obj.product else None
    
    def get_product_sku(self, obj):
        return obj.product.sku if obj.product else None
    
    def get_batch_number(self, obj):
        return obj.batch.batch_number if obj.batch else None
    
    def get_alert_type_display(self, obj):
        return dict(InventoryAlert.ALERT_TYPES).get(obj.alert_type, obj.alert_type)
    
    def get_priority_display(self, obj):
        return dict(InventoryAlert.PRIORITY_CHOICES).get(obj.priority, obj.priority)
    
    def get_resolved_by_name(self, obj):
        return obj.resolved_by.get_full_name() if obj.resolved_by else None


class ImportJobSerializer(serializers.ModelSerializer):
    """
    Serializer for Import Jobs
    """
    created_by_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    
    class Meta:
        model = ImportJob
        fields = [
            'id', 'job_id', 'job_type', 'status', 'status_display',
            'original_filename', 'file_size', 'file_path', 'total_records',
            'successful_records', 'failed_records', 'skipped_records',
            'error_log', 'created_by', 'created_by_name', 'created_at',
            'completed_at'
        ]
        read_only_fields = ['id', 'job_id', 'created_at', 'completed_at']
    
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username
    
    def get_status_display(self, obj):
        return dict(ImportJob.STATUS_CHOICES).get(obj.status, obj.status)


# ============================================================
# BULK IMPORT/EXPORT SERIALIZERS
# ============================================================

class BulkStockUpdateSerializer(serializers.Serializer):
    """
    Serializer for bulk stock updates via Excel/JSON
    """
    updates = serializers.ListField(
        child=serializers.DictField(),
        help_text="List of updates with product identifier and new quantity"
    )
    
    def validate_updates(self, value):
        if not value:
            raise serializers.ValidationError("At least one update is required")
        
        for update in value:
            if 'sku' not in update and 'barcode' not in update and 'id' not in update:
                raise serializers.ValidationError(
                    "Each update must have sku, barcode, or id"
                )
            if 'quantity' not in update:
                raise serializers.ValidationError("Each update must have quantity")
        
        return value


class BulkPriceUpdateSerializer(serializers.Serializer):
    """
    Serializer for bulk price updates
    """
    update_type = serializers.ChoiceField(choices=['percentage', 'fixed'])
    adjustment = serializers.DecimalField(max_digits=10, decimal_places=2)
    price_field = serializers.ChoiceField(
        choices=['cost_price', 'retail_price', 'wholesale_price', 'carton_price'],
        default='retail_price'
    )
    category_id = serializers.IntegerField(required=False)
    supplier_id = serializers.IntegerField(required=False)
    product_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False
    )
    
    def validate(self, data):
        if not data.get('category_id') and not data.get('supplier_id') and not data.get('product_ids'):
            raise serializers.ValidationError(
                "Either category_id, supplier_id, or product_ids must be provided"
            )
        return data


class StockMovementFilterSerializer(serializers.Serializer):
    """
    Serializer for filtering stock movements
    """
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    product_id = serializers.IntegerField(required=False)
    movement_type = serializers.ChoiceField(
        choices=StockMovement.MOVEMENT_TYPES,
        required=False
    )
    location = serializers.CharField(required=False)
    batch_id = serializers.IntegerField(required=False)