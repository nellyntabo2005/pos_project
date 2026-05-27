# products/admin.py
from django.contrib import admin
from .models import Category, Supplier, Product, ProductImage


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name']
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'phone', 'email', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name', 'phone', 'code']


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ['image', 'caption', 'is_primary', 'order']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'retail_price', 'stock_quantity', 'is_active']
    list_filter = ['is_active', 'category', 'unit']
    search_fields = ['name', 'sku', 'barcode']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [ProductImageInline]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'sku', 'barcode', 'description')
        }),
        ('Classification', {
            'fields': ('category', 'supplier', 'unit')
        }),
        ('Pricing', {
            'fields': ('cost_price', 'retail_price', 'wholesale_price')
        }),
        ('Stock Management', {
            'fields': ('stock_quantity', 'reorder_level', 'reorder_quantity')
        }),
        ('Tax & Status', {
            'fields': ('tax_rate', 'is_active', 'is_featured', 'main_image')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ['id', 'product', 'is_primary', 'order']
    list_filter = ['is_primary']
    search_fields = ['product__name']