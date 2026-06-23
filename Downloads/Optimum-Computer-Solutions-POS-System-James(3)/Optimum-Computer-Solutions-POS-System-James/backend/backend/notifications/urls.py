# notifications/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    NotificationChannelViewSet, NotificationTemplateViewSet,
    NotificationRuleViewSet, NotificationViewSet
)

router = DefaultRouter()
router.register(r'channels', NotificationChannelViewSet, basename='notification-channel')
router.register(r'templates', NotificationTemplateViewSet, basename='notification-template')
router.register(r'rules', NotificationRuleViewSet, basename='notification-rule')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
]