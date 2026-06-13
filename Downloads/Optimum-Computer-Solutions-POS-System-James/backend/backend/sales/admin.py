# sales/admin.py
from django.contrib import admin
from django.utils.html import format_html
from .models import Sale, SaleItem, Payment, Receipt


class SaleItemInline(admin.TabularInline):
    """Display sale items inline in sale admin"""
    model = SaleItem
    extra = 0
    readonly_fields = ['product_name', 'product_sku', 'unit_price', 'quantity', 'total']
    can_delete = False


class PaymentInline(admin.TabularInline):
    """Display payments inline in sale admin"""
    model = Payment
    extra = 0
    readonly_fields = ['payment_method', 'amount', 'payment_date']
    can_delete = False


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    """Admin interface for Sales"""
    
    list_display = [
        'sale_id', 'customer_display', 'cashier_display', 'total',
        'amount_paid', 'status_badge', 'payment_status_badge', 'sale_date'
    ]
    
    list_filter = ['status', 'payment_status', 'sale_date', 'cashier']
    search_fields = ['sale_id', 'customer__name', 'customer__phone']
    readonly_fields = ['sale_id', 'uuid', 'sale_date', 'updated_at', 'voided_at']
    
    inlines = [SaleItemInline, PaymentInline]
    
    fieldsets = (
        ('Sale Information', {
            'fields': ('sale_id', 'status', 'payment_status', 'customer', 'cashier')
        }),
        ('Financial Details', {
            'fields': ('subtotal', 'discount_amount', 'tax_amount', 'total', 'amount_paid', 'change_due')
        }),
        ('Loyalty', {
            'fields': ('loyalty_points_earned', 'loyalty_points_redeemed', 'loyalty_discount'),
            'classes': ('collapse',)
        }),
        ('Void Information', {
            'fields': ('voided_by', 'void_reason', 'voided_at'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('sale_date', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def customer_display(self, obj):
        return obj.customer.name if obj.customer else 'Walk-in'
    customer_display.short_description = 'Customer'
    
    def cashier_display(self, obj):
        return obj.cashier.get_full_name() or obj.cashier.username
    cashier_display.short_description = 'Cashier'
    
    def status_badge(self, obj):
        colors = {
            'completed': 'green',
            'pending': 'orange',
            'cancelled': 'red',
            'refunded': 'purple',
            'voided': 'darkred',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background: {}; color: white; padding: 3px 8px; border-radius: 3px;">{}</span>',
            color,
            obj.status.upper()
        )
    status_badge.short_description = 'Status'
    
    def payment_status_badge(self, obj):
        colors = {
            'paid': 'green',
            'partial': 'orange',
            'unpaid': 'red',
            'overpaid': 'blue',
        }
        color = colors.get(obj.payment_status, 'gray')
        return format_html(
            '<span style="background: {}; color: white; padding: 3px 8px; border-radius: 3px;">{}</span>',
            color,
            obj.payment_status.upper()
        )
    payment_status_badge.short_description = 'Payment'


@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = ['sale', 'product_name', 'quantity', 'unit_price', 'total']
    list_filter = ['sale__sale_date']
    search_fields = ['product_name', 'product_sku', 'sale__sale_id']
    readonly_fields = ['product_name', 'product_sku', 'unit_price', 'quantity', 'total']


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['sale', 'payment_method', 'amount', 'payment_date', 'recorded_by']
    list_filter = ['payment_method', 'payment_date']
    search_fields = ['sale__sale_id', 'mpesa_receipt_number', 'reference_number']
    readonly_fields = ['payment_date']


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ['receipt_number', 'sale', 'generated_at', 'printed']
    list_filter = ['printed', 'generated_at']
    search_fields = ['receipt_number', 'sale__sale_id']
    readonly_fields = ['receipt_number', 'generated_at']
