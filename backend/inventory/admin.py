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
    list_display = ['id', 'name', 'code', 'contact_person', 'phone', 'email', 'address_line1', 'is_active', 'is_preferred']
    list_filter = ['is_active', 'is_preferred', 'city']
    search_fields = ['name', 'code', 'contact_person', 'phone', 'email', 'address_line1']
    readonly_fields = ['created_at', 'updated_at']
    actions = ['activate_suppliers', 'deactivate_suppliers', 'mark_preferred', 'unmark_preferred']

    def activate_suppliers(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} suppliers activated.')
    activate_suppliers.short_description = 'Activate selected suppliers'

    def deactivate_suppliers(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} suppliers deactivated.')
    deactivate_suppliers.short_description = 'Deactivate selected suppliers'

    def mark_preferred(self, request, queryset):
        updated = queryset.update(is_preferred=True)
        self.message_user(request, f'{updated} suppliers marked as preferred.')
    mark_preferred.short_description = 'Mark selected suppliers as preferred'

    def unmark_preferred(self, request, queryset):
        updated = queryset.update(is_preferred=False)
        self.message_user(request, f'{updated} suppliers unmarked as preferred.')
    unmark_preferred.short_description = 'Remove preferred mark from selected suppliers'


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ['batch_number', 'product', 'remaining_quantity', 'expiry_date', 'status']
    list_filter = ['status', 'product', 'location']
    search_fields = ['batch_number', 'product__name', 'product__sku']
    readonly_fields = ['created_at', 'updated_at']
    actions = ['mark_active', 'mark_quarantined', 'mark_recalled']

    def mark_active(self, request, queryset):
        updated = queryset.update(status='active')
        self.message_user(request, f'{updated} batches marked active.')
    mark_active.short_description = 'Mark selected batches as active'

    def mark_quarantined(self, request, queryset):
        updated = queryset.update(status='quarantined')
        self.message_user(request, f'{updated} batches quarantined.')
    mark_quarantined.short_description = 'Quarantine selected batches'

    def mark_recalled(self, request, queryset):
        updated = queryset.update(status='recalled')
        self.message_user(request, f'{updated} batches recalled.')
    mark_recalled.short_description = 'Recall selected batches'


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
    actions = ['submit_orders', 'approve_orders', 'cancel_orders', 'mark_paid']

    def submit_orders(self, request, queryset):
        updated = 0
        for order in queryset.filter(status='draft'):
            order.submit()
            updated += 1
        self.message_user(request, f'{updated} purchase orders submitted.')
    submit_orders.short_description = 'Submit selected draft purchase orders'

    def approve_orders(self, request, queryset):
        updated = 0
        for order in queryset.filter(status='submitted'):
            order.approve(request.user)
            updated += 1
        self.message_user(request, f'{updated} purchase orders approved.')
    approve_orders.short_description = 'Approve selected submitted purchase orders'

    def cancel_orders(self, request, queryset):
        updated = queryset.exclude(status__in=['completed', 'cancelled']).update(status='cancelled')
        self.message_user(request, f'{updated} purchase orders cancelled.')
    cancel_orders.short_description = 'Cancel selected purchase orders'

    def mark_paid(self, request, queryset):
        updated = queryset.update(payment_status='paid')
        self.message_user(request, f'{updated} purchase orders marked paid.')
    mark_paid.short_description = 'Mark selected purchase orders as paid'


@admin.register(StockCount)
class StockCountAdmin(admin.ModelAdmin):
    list_display = ['count_number', 'location', 'count_date', 'status', 'total_discrepancies']
    list_filter = ['status', 'location', 'count_date']
    search_fields = ['count_number']
    readonly_fields = ['count_number', 'created_at', 'completed_at']
    actions = ['start_counts', 'cancel_counts']

    def start_counts(self, request, queryset):
        updated = 0
        for stock_count in queryset.filter(status='draft'):
            stock_count.start_count()
            updated += 1
        self.message_user(request, f'{updated} stock counts started.')
    start_counts.short_description = 'Start selected draft stock counts'

    def cancel_counts(self, request, queryset):
        updated = queryset.filter(status__in=['draft', 'in_progress']).update(status='cancelled')
        self.message_user(request, f'{updated} stock counts cancelled.')
    cancel_counts.short_description = 'Cancel selected stock counts'


@admin.register(StoreTransfer)
class StoreTransferAdmin(admin.ModelAdmin):
    list_display = ['transfer_number', 'from_store', 'to_store', 'status', 'transfer_date']
    list_filter = ['status', 'from_store', 'to_store']
    search_fields = ['transfer_number']
    readonly_fields = ['transfer_number', 'transfer_date', 'created_at', 'updated_at']
    actions = ['approve_transfers', 'send_transfers', 'cancel_transfers']

    def approve_transfers(self, request, queryset):
        updated = 0
        for transfer in queryset.filter(status='pending'):
            transfer.approve_transfer(request.user)
            updated += 1
        self.message_user(request, f'{updated} transfers approved.')
    approve_transfers.short_description = 'Approve selected pending transfers'

    def send_transfers(self, request, queryset):
        updated = 0
        for transfer in queryset.filter(status='approved'):
            transfer.send_transfer()
            updated += 1
        self.message_user(request, f'{updated} transfers marked in transit.')
    send_transfers.short_description = 'Send selected approved transfers'

    def cancel_transfers(self, request, queryset):
        updated = queryset.filter(status__in=['pending', 'approved']).update(status='cancelled')
        self.message_user(request, f'{updated} transfers cancelled.')
    cancel_transfers.short_description = 'Cancel selected transfers'


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
    actions = ['resolve_alerts', 'reopen_alerts']

    def resolve_alerts(self, request, queryset):
        updated = 0
        for alert in queryset.filter(is_resolved=False):
            alert.resolve(request.user, 'Resolved from Django admin bulk action.')
            updated += 1
        self.message_user(request, f'{updated} alerts resolved.')
    resolve_alerts.short_description = 'Resolve selected alerts'

    def reopen_alerts(self, request, queryset):
        updated = queryset.update(
            is_resolved=False,
            resolved_by=None,
            resolved_at=None,
            resolution_notes='',
        )
        self.message_user(request, f'{updated} alerts reopened.')
    reopen_alerts.short_description = 'Reopen selected alerts'
