# payments/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.conf import settings
from django.db.models import Sum, Count
from django.http import HttpResponse
from django.utils import timezone
from decimal import Decimal
import pandas as pd
import io

# CORRECT IMPORTS - Use PaymentTransaction, NOT Payment
from .models import (
    PaymentAccount, 
    PaymentTransaction, 
    MpesaAccount, 
    MpesaTransaction,
    MpesaCallbackLog,
    MpesaReconciliation,
    ExpenseCategory,
    Expense
)
from .serializers import (
    PaymentAccountSerializer,
    PaymentTransactionSerializer,
    MpesaAccountSerializer,
    MpesaTransactionSerializer,
    MpesaStkPushSerializer,
    MpesaQueryStatusSerializer,
    ExpenseCategorySerializer,
    ExpenseSerializer
)
from .mpesa_service import MpesaService, MpesaCallbackHandler


class PaymentAccountViewSet(viewsets.ModelViewSet):
    """ViewSet for managing payment accounts"""
    
    queryset = PaymentAccount.objects.all()
    serializer_class = PaymentAccountSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['account_type', 'is_active', 'is_default']
    search_fields = ['name', 'account_number', 'bank_name']
    ordering_fields = ['name', 'current_balance']
    ordering = ['account_type', 'name']
    
    def get_queryset(self):
        user = self.request.user
        if user.role in ['super_admin', 'admin', 'accountant']:
            return PaymentAccount.objects.all()
        return PaymentAccount.objects.filter(is_active=True)


class PaymentTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing payment transactions"""
    
    queryset = PaymentTransaction.objects.all()
    serializer_class = PaymentTransactionSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['transaction_type', 'payment_method', 'status']
    search_fields = ['transaction_id', 'reference_number', 'description']
    ordering_fields = ['transaction_date', 'amount']
    ordering = ['-transaction_date']
    
    def get_queryset(self):
        user = self.request.user
        if user.role in ['super_admin', 'admin', 'accountant']:
            return PaymentTransaction.objects.all()
        return PaymentTransaction.objects.filter(recorded_by=user)
    
    @action(detail=False, methods=['get'], url_path='summary')
    def transaction_summary(self, request):
        """Get summary of transactions for a period"""
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        queryset = self.get_queryset()
        
        if start_date:
            queryset = queryset.filter(transaction_date__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(transaction_date__date__lte=end_date)
        
        summary = {
            'total_income': float(queryset.filter(
                transaction_type__in=['sale', 'deposit']
            ).aggregate(total=Sum('amount'))['total'] or 0),
            'total_expenses': float(queryset.filter(
                transaction_type__in=['expense', 'supplier_payment', 'salary', 'withdrawal']
            ).aggregate(total=Sum('amount'))['total'] or 0),
            'total_fees': float(queryset.aggregate(total=Sum('fee'))['total'] or 0),
            'total_tax': float(queryset.aggregate(total=Sum('tax'))['total'] or 0),
            'transaction_count': queryset.count(),
        }
        
        return Response(summary)


class MpesaAccountViewSet(viewsets.ModelViewSet):
    """ViewSet for M-Pesa account management"""
    
    queryset = MpesaAccount.objects.all()
    serializer_class = MpesaAccountSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        if self.request.user.role in ['super_admin', 'admin']:
            return MpesaAccount.objects.all()
        return MpesaAccount.objects.filter(is_active=True)
    
    @action(detail=False, methods=['post'], url_path='set-default')
    def set_default(self, request):
        account_id = request.data.get('account_id')
        try:
            account = MpesaAccount.objects.get(id=account_id)
            MpesaAccount.objects.filter(is_default=True).update(is_default=False)
            account.is_default = True
            account.save()
            return Response({'message': 'Default account set successfully'})
        except MpesaAccount.DoesNotExist:
            return Response({'error': 'Account not found'}, status=404)


class MpesaTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing M-Pesa transactions"""
    
    queryset = MpesaTransaction.objects.all()
    serializer_class = MpesaTransactionSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'transaction_type', 'phone_number']
    search_fields = ['mpesa_receipt_number', 'checkout_request_id', 'account_reference']
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']


class MpesaPaymentViewSet(viewsets.GenericViewSet):
    """ViewSet for M-Pesa payment operations"""
    
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action == 'mpesa_callback':
            return [AllowAny()]
        return [permission() for permission in self.permission_classes]
    
    @action(detail=False, methods=['post'], url_path='stk-push')
    def initiate_stk_push(self, request):
        serializer = MpesaStkPushSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data

        if getattr(settings, 'MPESA_DEMO_MODE', False):
            try:
                mpesa_service = MpesaService()
                phone = data['phone_number']
                if phone.startswith('0'):
                    phone = '254' + phone[1:]
                elif phone.startswith('+'):
                    phone = phone[1:]

                transaction = MpesaTransaction.objects.create(
                    merchant_request_id=f"DEMO-MER-{timezone.now().strftime('%Y%m%d%H%M%S%f')}",
                    checkout_request_id=f"DEMO-CHK-{timezone.now().strftime('%Y%m%d%H%M%S%f')}",
                    transaction_type='stk_push',
                    amount=data['amount'],
                    phone_number=phone,
                    account_reference=data['account_reference'],
                    transaction_desc=data.get('transaction_desc', 'Payment for goods'),
                    status='pending',
                    result_code=0,
                    result_desc='Transaction complete',
                    mpesa_account=mpesa_service.account,
                )
                transaction.mark_completed(f"DEMO{transaction.id:08d}", 0, 'Transaction complete')

                return Response({
                    'success': True,
                    'demo_mode': True,
                    'message': 'Transaction complete',
                    'checkout_request_id': transaction.checkout_request_id,
                    'transaction': {
                        'id': transaction.id,
                        'checkout_request_id': transaction.checkout_request_id,
                        'status': transaction.status,
                    },
                })
            except Exception as e:
                return Response(
                    {'success': False, 'error': str(e)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        try:
            mpesa_service = MpesaService()
            result = mpesa_service.stk_push(
                phone_number=data['phone_number'],
                amount=data['amount'],
                account_reference=data['account_reference'],
                transaction_desc=data.get('transaction_desc', 'Payment for goods')
            )
            
            if result['success'] and data.get('sale_id'):
                from sales.models import Sale
                try:
                    sale = Sale.objects.get(id=data['sale_id'])
                    transaction = MpesaTransaction.objects.get(id=result['transaction_id'])
                    transaction.sale = sale
                    transaction.save()
                except Sale.DoesNotExist:
                    pass
            
            return Response(result)
            
        except Exception as e:
            error_message = str(e)
            if '403' in error_message and 'stkpush' in error_message.lower():
                error_message = (
                    'M-Pesa STK Push is not authorized for the configured Daraja app. '
                    'Check the consumer key, consumer secret, shortcode, passkey, and environment.'
                )
            return Response(
                {'success': False, 'error': error_message},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get', 'post'], url_path='status')
    def status(self, request):
        checkout_request_id = (
            request.query_params.get('checkout_request_id')
            or request.data.get('checkout_request_id')
        )

        if not checkout_request_id:
            return Response(
                {'error': 'checkout_request_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        transaction = MpesaTransaction.objects.filter(
            checkout_request_id=checkout_request_id
        ).first()

        if not transaction:
            return Response(
                {'error': 'M-Pesa transaction not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        query_error = ''
        if transaction.status == 'pending':
            try:
                MpesaService(transaction.mpesa_account).query_status(checkout_request_id)
                transaction.refresh_from_db()
            except Exception as e:
                query_error = str(e)
                if 'authorization failed' in query_error.lower() or '403' in query_error:
                    query_error = (
                        'M-Pesa payment could not be confirmed because Daraja authorization failed. '
                        'Check MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, shortcode, passkey, and environment.'
                    )

        return Response({
            'id': transaction.id,
            'checkout_request_id': transaction.checkout_request_id,
            'status': transaction.status,
            'amount': transaction.amount,
            'mpesa_receipt_number': transaction.mpesa_receipt_number,
            'result_code': transaction.result_code,
            'result_desc': transaction.result_desc,
            'query_error': query_error,
            'completed_at': transaction.completed_at,
        })
    
    @action(detail=False, methods=['post'], url_path='callback')
    def mpesa_callback(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            client_ip = x_forwarded_for.split(',')[0]
        else:
            client_ip = request.META.get('REMOTE_ADDR')
        
        success, message = MpesaCallbackHandler.handle_stk_push_callback(
            request.data, client_ip
        )
        
        if success:
            return Response({'ResultCode': 0, 'ResultDesc': 'Success'})
        else:
            return Response({'ResultCode': 1, 'ResultDesc': message})


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for expense categories"""
    
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']
    ordering = ['name']


class ExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for expenses"""
    
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'status', 'expense_date']
    search_fields = ['expense_number', 'description']
    ordering_fields = ['expense_date', 'amount']
    ordering = ['-expense_date']
    
    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)
    
    @action(detail=True, methods=['post'], url_path='approve')
    def approve_expense(self, request, pk=None):
        expense = self.get_object()
        
        if request.user.role not in ['super_admin', 'admin', 'manager']:
            return Response(
                {"error": "Only managers can approve expenses"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if expense.status != 'submitted':
            return Response(
                {"error": f"Cannot approve expense with status: {expense.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        expense.status = 'approved'
        expense.approved_by = request.user
        expense.approved_at = timezone.now()
        expense.save()
        
        return Response({'message': 'Expense approved'})
    
    @action(detail=True, methods=['post'], url_path='pay')
    def pay_expense(self, request, pk=None):
        expense = self.get_object()
        
        if expense.status != 'approved':
            return Response(
                {"error": f"Cannot pay expense with status: {expense.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from_account_id = request.data.get('from_account_id')
        if not from_account_id:
            return Response(
                {"error": "from_account_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from_account = PaymentAccount.objects.get(id=from_account_id, is_active=True)
        except PaymentAccount.DoesNotExist:
            return Response(
                {"error": "Payment account not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        payment_transaction = PaymentTransaction.objects.create(
            transaction_type='expense',
            payment_method='cash' if from_account.account_type == 'cash' else 'bank_transfer',
            amount=expense.total_amount,
            from_account=from_account,
            reference_number=expense.expense_number,
            description=expense.description,
            recorded_by=request.user,
            status='completed'
        )
        
        expense.payment_transaction = payment_transaction
        expense.status = 'paid'
        expense.paid_at = timezone.now()
        expense.save()
        
        return Response({
            'message': 'Expense paid',
            'payment_transaction_id': payment_transaction.transaction_id
        })
