# payments/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PaymentAccountViewSet,
    PaymentTransactionViewSet,
    MpesaAccountViewSet,
    MpesaTransactionViewSet,
    MpesaPaymentViewSet,
    ExpenseCategoryViewSet,
    ExpenseViewSet,
    
)

router = DefaultRouter()

router.register(r'accounts', PaymentAccountViewSet, basename='payment-account')
router.register(r'transactions', PaymentTransactionViewSet, basename='payment-transaction')
router.register(r'mpesa-accounts', MpesaAccountViewSet, basename='mpesa-account')
router.register(r'mpesa-transactions', MpesaTransactionViewSet, basename='mpesa-transaction')
router.register(r'mpesa-payments', MpesaPaymentViewSet, basename='mpesa-payment')
router.register(r'expense-categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'expenses', ExpenseViewSet, basename='expense')

urlpatterns = [
    path('api/', include(router.urls)),
]
path('mpesa-payments/callback/', MpesaPaymentViewSet.as_view({'post': 'mpesa_callback'}), name='mpesa-callback'),



