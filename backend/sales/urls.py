from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SaleViewSet, PaymentViewSet

router = DefaultRouter()
router.register(r'', SaleViewSet, basename='sale')
router.register(r'payments', PaymentViewSet, basename='payment')

urlpatterns = [
    path('', include(router.urls)),
]
