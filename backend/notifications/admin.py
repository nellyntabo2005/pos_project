
# notifications/admin.py
from django.contrib import admin
from django.utils.html import format_html
from .models import NotificationChannel, NotificationTemplate, NotificationRule, Notification, NotificationLog


@admin.register(NotificationChannel)
class NotificationChannelAdmin(admin.ModelAdmin):
    list_display = ['name', 'channel_type', 'is_active', 'is_default', 'priority']
    list_filter = ['channel_type', 'is_active', 'is_default']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'channel', 'is_active']
    list_filter = ['category', 'channel', 'is_active']
    search_fields = ['name', 'subject_template']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(NotificationRule)
class NotificationRuleAdmin(admin.ModelAdmin):
    list_display = ['name', 'event_type', 'template', 'is_active', 'created_at']
    list_filter = ['event_type', 'is_active']
    search_fields = ['name']
    filter_horizontal = ['recipients']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['notification_id', 'title_preview', 'channel', 'recipient_display', 'status_badge', 'created_at']
    list_filter = ['status', 'channel', 'priority', 'created_at']
    search_fields = ['notification_id', 'title', 'recipient_email', 'recipient_phone']
    readonly_fields = ['notification_id', 'created_at', 'sent_at', 'read_at']
    
    def title_preview(self, obj):
        return obj.title[:50]
    title_preview.short_description = 'Title'
    
    def recipient_display(self, obj):
        if obj.recipient_user:
            return obj.recipient_user.email
        if obj.recipient_email:
            return obj.recipient_email
        return obj.recipient_phone or '-'
    recipient_display.short_description = 'Recipient'
    
    def status_badge(self, obj):
        colors = {
            'pending': 'orange',
            'sent': 'blue',
            'failed': 'red',
            'read': 'green',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background: {}; color: white; padding: 3px 8px; border-radius: 3px;">{}</span>',
            color,
            obj.status.upper()
        )
    status_badge.short_description = 'Status'


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ['notification', 'attempt_number', 'success', 'created_at']
    list_filter = ['success', 'created_at']
    readonly_fields = ['notification', 'attempt_number', 'channel_response', 'error_details', 'success', 'created_at']

from django.contrib import admin

# Register your models here.

