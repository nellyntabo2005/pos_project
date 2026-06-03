# returns/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReturnViewSet, ReturnItemViewSet, ReturnImageViewSet

router = DefaultRouter()
router.register(r'returns', ReturnViewSet, basename='return')
router.register(r'return-items', ReturnItemViewSet, basename='return-item')
router.register(r'return-images', ReturnImageViewSet, basename='return-image')

urlpatterns = [
    path('', include(router.urls)),
]