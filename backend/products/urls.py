from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, SupplierViewSet, ProductViewSet, ProductImageViewSet

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'', ProductViewSet, basename='product')
router.register(r'images', ProductImageViewSet, basename='product-image')

urlpatterns = [
    path('', include(router.urls)),
]
