# payments/serializers.py
from rest_framework import serializers
from .models import (
    PaymentAccount, PaymentTransaction, 
    MpesaAccount, MpesaTransaction, 
    ExpenseCategory, Expense
)


class PaymentAccountSerializer(serializers.ModelSerializer):
    account_type_display = serializers.SerializerMethodField()
    
    class Meta:
        model = PaymentAccount
        fields = [
            'id', 'name', 'account_type', 'account_type_display', 'account_number',
            'bank_name', 'bank_branch', 'bank_account_name', 'bank_account_number',
            'mpesa_shortcode', 'current_balance', 'opening_balance',
            'minimum_balance', 'maximum_balance', 'is_active', 'is_default',
            'description', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'current_balance', 'created_at', 'updated_at']
    
    def get_account_type_display(self, obj):
        return obj.get_account_type_display()


class PaymentTransactionSerializer(serializers.ModelSerializer):
    transaction_type_display = serializers.SerializerMethodField()
    payment_method_display = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    from_account_name = serializers.SerializerMethodField()
    to_account_name = serializers.SerializerMethodField()
    
    class Meta:
        model = PaymentTransaction
        fields = [
            'id', 'transaction_id', 'uuid', 'transaction_type', 'transaction_type_display',
            'payment_method', 'payment_method_display', 'amount', 'fee', 'tax', 'net_amount',
            'from_account', 'from_account_name', 'to_account', 'to_account_name',
            'reference_number', 'sale', 'customer', 'status', 'status_display',
            'description', 'notes', 'recorded_by', 'recorded_by_name',
            'verified_by', 'transaction_date', 'verified_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'transaction_id', 'uuid', 'net_amount', 'transaction_date', 'updated_at'
        ]
    
    def get_transaction_type_display(self, obj):
        return dict(PaymentTransaction.TRANSACTION_TYPES).get(obj.transaction_type, obj.transaction_type)
    
    def get_payment_method_display(self, obj):
        return dict(PaymentTransaction.PAYMENT_METHODS).get(obj.payment_method, obj.payment_method)
    
    def get_status_display(self, obj):
        return dict(PaymentTransaction.STATUS_CHOICES).get(obj.status, obj.status)
    
    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() or obj.recorded_by.username
    
    def get_from_account_name(self, obj):
        return obj.from_account.name if obj.from_account else None
    
    def get_to_account_name(self, obj):
        return obj.to_account.name if obj.to_account else None


class MpesaAccountSerializer(serializers.ModelSerializer):
    environment_display = serializers.SerializerMethodField()
    business_type_display = serializers.SerializerMethodField()
    
    class Meta:
        model = MpesaAccount
        fields = [
            'id', 'name', 'business_type', 'business_type_display', 'shortcode',
            'passkey', 'consumer_key', 'consumer_secret', 'environment',
            'environment_display', 'callback_url', 'timeout_url', 'result_url',
            'is_active', 'is_default', 'business_name', 'business_shortcode',
            'payment_account', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'passkey': {'write_only': True},
            'consumer_key': {'write_only': True},
            'consumer_secret': {'write_only': True},
        }
    
    def get_environment_display(self, obj):
        return dict(MpesaAccount.ENVIRONMENT_CHOICES).get(obj.environment, obj.environment)
    
    def get_business_type_display(self, obj):
        return dict(MpesaAccount.BUSINESS_TYPES).get(obj.business_type, obj.business_type)


class MpesaTransactionSerializer(serializers.ModelSerializer):
    status_display = serializers.SerializerMethodField()
    transaction_type_display = serializers.SerializerMethodField()
    mpesa_account_name = serializers.SerializerMethodField()
    
    class Meta:
        model = MpesaTransaction
        fields = [
            'id', 'merchant_request_id', 'checkout_request_id', 'mpesa_receipt_number',
            'transaction_type', 'transaction_type_display', 'amount', 'phone_number',
            'account_reference', 'transaction_desc', 'response_code', 'response_description',
            'status', 'status_display', 'result_code', 'result_desc',
            'payment_transaction', 'sale', 'customer', 'mpesa_account', 'mpesa_account_name',
            'created_at', 'completed_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'merchant_request_id', 'checkout_request_id', 'mpesa_receipt_number',
            'response_code', 'response_description', 'created_at', 'completed_at', 'updated_at'
        ]
    
    def get_status_display(self, obj):
        return dict(MpesaTransaction.STATUS_CHOICES).get(obj.status, obj.status)
    
    def get_transaction_type_display(self, obj):
        return dict(MpesaTransaction.TRANSACTION_TYPES).get(obj.transaction_type, obj.transaction_type)
    
    def get_mpesa_account_name(self, obj):
        return obj.mpesa_account.name if obj.mpesa_account else None


class MpesaStkPushSerializer(serializers.Serializer):
    #Serializer for initiating STK Push

 phone_number = serializers.CharField(max_length=15)
 amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=1)
 account_reference = serializers.CharField(max_length=50)
 transaction_desc = serializers.CharField(max_length=100, required=False, default="Payment for goods")
 sale_id = serializers.IntegerField(required=False)
    
def validate_phone_number(self, value):
        import re
        phone = re.sub(r'\D', '', value)
        
        if len(phone) == 9 and phone.startswith('7'):
            phone = '254' + phone
        elif len(phone) == 10 and phone.startswith('07'):
            phone = '254' + phone[1:]
        elif len(phone) == 12 and phone.startswith('254'):
            pass
        else:
            raise serializers.ValidationError(
                "Invalid phone number. Use format: 0712345678 or 254712345678"
            )
        
        return phone


class MpesaQueryStatusSerializer(serializers.Serializer):
 checkout_request_id = serializers.CharField(max_length=100)


class ExpenseCategorySerializer(serializers.ModelSerializer):
     class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'description', 'parent', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Expense
        fields = [
            'id', 'expense_number', 'category', 'category_name', 'amount',
            'tax_amount', 'total_amount', 'description', 'receipt_image',
            'payment_transaction', 'requested_by', 'requested_by_name',
            'approved_by', 'approved_by_name', 'status', 'status_display',
            'expense_date', 'approved_at', 'paid_at', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'expense_number', 'total_amount', 'created_at', 'updated_at']
    
    def get_category_name(self, obj):
        return obj.category.name
    
    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
    
    def get_status_display(self, obj):
        return dict(Expense.STATUS_CHOICES).get(obj.status, obj.status)