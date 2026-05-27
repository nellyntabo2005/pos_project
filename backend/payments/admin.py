# payments/admin.py
from django.contrib import admin
from django.utils.html import format_html
from .models import (
    PaymentAccount, 
    PaymentTransaction, 
    MpesaAccount, 
    MpesaTransaction,
    ExpenseCategory,
    Expense
)


@admin.register(PaymentAccount)
class PaymentAccountAdmin(admin.ModelAdmin):
    list_display = ['name', 'account_type', 'current_balance', 'is_active']
    list_filter = ['account_type', 'is_active']
    search_fields = ['name', 'account_number']
    readonly_fields = ['created_at']


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = ['transaction_id', 'transaction_type', 'amount', 'status', 'transaction_date']
    list_filter = ['transaction_type', 'payment_method', 'status']
    search_fields = ['transaction_id', 'reference_number']
    readonly_fields = ['transaction_id', 'transaction_date']


@admin.register(MpesaAccount)
class MpesaAccountAdmin(admin.ModelAdmin):
    list_display = ['name', 'shortcode', 'business_type', 'environment', 'is_active']
    list_filter = ['business_type', 'environment', 'is_active']
    search_fields = ['name', 'shortcode']


@admin.register(MpesaTransaction)
class MpesaTransactionAdmin(admin.ModelAdmin):
    list_display = ['mpesa_receipt_number', 'amount', 'phone_number', 'status', 'created_at']
    list_filter = ['status', 'transaction_type']
    search_fields = ['mpesa_receipt_number', 'checkout_request_id']
    readonly_fields = ['created_at']


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name']


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['expense_number', 'category', 'amount', 'status', 'expense_date']
    list_filter = ['status', 'category']
    search_fields = ['expense_number', 'description']
    readonly_fields = ['expense_number', 'created_at']