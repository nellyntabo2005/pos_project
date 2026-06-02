# products/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, SupplierViewSet, ProductViewSet, ProductImageViewSet
from . import views

router = DefaultRouter()
router.register(r'categories', CategoryViewSet)
router.register(r'suppliers', SupplierViewSet)
router.register(r'', ProductViewSet)
router.register(r'images', ProductImageViewSet)

urlpatterns = [
    path('', include(router.urls)),
    # Add this manual URL for the template download
    path('download-template/', views.ProductViewSet.as_view({'get': 'download_template'}), name='download-template'),
]