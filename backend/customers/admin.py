# customers/admin.py
from django.contrib import admin
from django.utils.html import format_html
from .models import Customer

@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    """
    Django admin configuration for Customer model.
    Makes it easy to manage customers from admin panel.
    """
    
    # Fields to display in list view
    list_display = [
        'account_reference',
        'name',
        'phone',
        'email',
        'total_spent',
        'pricing_tier',
        'is_active',
        'last_purchase_date_display',
    ]
    
    # Fields to filter by
    list_filter = [
        'is_active',
        'is_blacklisted',
        'pricing_tier',
        'created_at',
    ]
    
    # Fields to search
    search_fields = [
        'account_reference',
        'name',
        'phone',
        'email',
    ]
    
    # Read-only fields
    readonly_fields = [
        'account_reference',
        'uuid',
        'loyalty_points',
        'total_spent',
        'created_at',
        'updated_at',
        'get_loyalty_summary',
    ]
    
    # Fields grouping in edit form
    fieldsets = (
        ('Identification', {
            'fields': ('account_reference', 'uuid', 'name', 'phone', 'email')
        }),
        ('Address', {
            'fields': ('address_line1', 'address_line2', 'city', 'county', 'postal_code'),
            'classes': ('collapse',)
        }),
        ('Business Information', {
            'fields': ('tax_number', 'pricing_tier', 'notes'),
        }),
        ('Loyalty Program', {
            'fields': ('loyalty_points', 'total_spent', 'get_loyalty_summary'),
        }),
        ('Status', {
            'fields': ('is_active', 'is_blacklisted', 'last_purchase_date'),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    # Actions for bulk operations
    actions = ['activate_customers', 'deactivate_customers', 'apply_vip_tier']
    
    def last_purchase_date_display(self, obj):
        """Display last purchase date nicely"""
        if obj.last_purchase_date:
            return obj.last_purchase_date.strftime('%Y-%m-%d %H:%M')
        return 'No purchases'
    last_purchase_date_display.short_description = 'Last Purchase'
    
    def get_loyalty_summary(self, obj):
        """Display loyalty summary in admin"""
        return format_html(
            '<div style="background: #f0f0f0; padding: 10px; border-radius: 5px;">'
            '<strong>Points:</strong> {}<br>'
            '<strong>Total Spent:</strong> KES {:,}<br>'
            '<strong>Discount:</strong> {}%<br>'
            '</div>',
            obj.loyalty_points,
            obj.total_spent,
            obj.get_discount_percentage()
        )
    get_loyalty_summary.short_description = 'Loyalty Summary'
    
    def activate_customers(self, request, queryset):
        """Bulk activate customers"""
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} customers activated.')
    activate_customers.short_description = 'Activate selected customers'
    
    def deactivate_customers(self, request, queryset):
        """Bulk deactivate customers"""
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} customers deactivated.')
    deactivate_customers.short_description = 'Deactivate selected customers'
    
    def apply_vip_tier(self, request, queryset):
        """Bulk upgrade selected customers to VIP"""
        updated = queryset.update(pricing_tier='vip')
        self.message_user(request, f'{updated} customers upgraded to VIP.')
    apply_vip_tier.short_description = 'Upgrade to VIP tier'
