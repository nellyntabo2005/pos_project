# inventory/admin.py
from django.contrib import admin
from django.utils.html import format_html
from .models import (
    Supplier, Batch, StockMovement, PurchaseOrder, PurchaseOrderItem,
    StockCount, StockCountItem, StoreTransfer, StoreTransferItem,
    StoreStock, InventoryAlert
)


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'code', 'phone', 'email', 'is_active', 'is_preferred']
    list_filter = ['is_active', 'is_preferred', 'city']
    search_fields = ['name', 'code', 'phone', 'email']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ['batch_number', 'product', 'remaining_quantity', 'expiry_date', 'status']
    list_filter = ['status', 'product', 'location']
    search_fields = ['batch_number', 'product__name', 'product__sku']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ['movement_id', 'product', 'movement_type', 'quantity', 'movement_date']
    list_filter = ['movement_type', 'location', 'movement_date']
    search_fields = ['movement_id', 'reference_id', 'product__name']
    readonly_fields = ['movement_id', 'uuid', 'movement_date', 'created_at']


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    readonly_fields = ['product', 'quantity', 'unit_cost', 'total']


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ['po_number', 'supplier', 'order_date', 'expected_delivery_date', 'status', 'total']
    list_filter = ['status', 'payment_status', 'order_date']
    search_fields = ['po_number', 'supplier__name']
    readonly_fields = ['po_number', 'uuid', 'order_date', 'created_at', 'updated_at']
    inlines = [PurchaseOrderItemInline]


@admin.register(StockCount)
class StockCountAdmin(admin.ModelAdmin):
    list_display = ['count_number', 'location', 'count_date', 'status', 'total_discrepancies']
    list_filter = ['status', 'location', 'count_date']
    search_fields = ['count_number']
    readonly_fields = ['count_number', 'created_at', 'completed_at']


@admin.register(StoreTransfer)
class StoreTransferAdmin(admin.ModelAdmin):
    list_display = ['transfer_number', 'from_store', 'to_store', 'status', 'transfer_date']
    list_filter = ['status', 'from_store', 'to_store']
    search_fields = ['transfer_number']
    readonly_fields = ['transfer_number', 'transfer_date', 'created_at', 'updated_at']


@admin.register(StoreStock)
class StoreStockAdmin(admin.ModelAdmin):
    list_display = ['store', 'product', 'quantity', 'reorder_level', 'is_low_stock']
    list_filter = ['store']
    search_fields = ['product__name', 'product__sku']
    
    def is_low_stock(self, obj):
        return obj.is_low_stock
    is_low_stock.boolean = True
    is_low_stock.short_description = 'Low Stock'


@admin.register(InventoryAlert)
class InventoryAlertAdmin(admin.ModelAdmin):
    list_display = ['alert_type', 'product', 'priority', 'is_resolved', 'created_at']
    list_filter = ['alert_type', 'priority', 'is_resolved']
    search_fields = ['product__name', 'message']
    readonly_fields = ['created_at']