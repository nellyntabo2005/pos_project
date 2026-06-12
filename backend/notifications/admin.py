
# notifications/admin.py
from django.contrib import admin
from django.utils.html import format_html
from .models import NotificationChannel, NotificationTemplate, NotificationRule, Notification, NotificationLog
from .notification_service import NotificationService


@admin.register(NotificationChannel)
class NotificationChannelAdmin(admin.ModelAdmin):
    list_display = ['name', 'channel_type', 'is_active', 'is_default', 'priority']
    list_filter = ['channel_type', 'is_active', 'is_default']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']
    actions = ['activate_channels', 'deactivate_channels']

    def activate_channels(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} notification channels activated.')
    activate_channels.short_description = 'Activate selected channels'

    def deactivate_channels(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} notification channels deactivated.')
    deactivate_channels.short_description = 'Deactivate selected channels'


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'channel', 'is_active']
    list_filter = ['category', 'channel', 'is_active']
    search_fields = ['name', 'subject_template']
    readonly_fields = ['created_at', 'updated_at']
    actions = ['activate_templates', 'deactivate_templates']

    def activate_templates(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} notification templates activated.')
    activate_templates.short_description = 'Activate selected templates'

    def deactivate_templates(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} notification templates deactivated.')
    deactivate_templates.short_description = 'Deactivate selected templates'


@admin.register(NotificationRule)
class NotificationRuleAdmin(admin.ModelAdmin):
    list_display = ['name', 'event_type', 'template', 'is_active', 'created_at']
    list_filter = ['event_type', 'is_active']
    search_fields = ['name']
    filter_horizontal = ['recipients']
    readonly_fields = ['created_at', 'updated_at']
    actions = ['activate_rules', 'deactivate_rules']

    def activate_rules(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} notification rules activated.')
    activate_rules.short_description = 'Activate selected rules'

    def deactivate_rules(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} notification rules deactivated.')
    deactivate_rules.short_description = 'Deactivate selected rules'


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['notification_id', 'title_preview', 'channel', 'recipient_display', 'status_badge', 'created_at']
    list_filter = ['status', 'channel', 'priority', 'created_at']
    search_fields = ['notification_id', 'title', 'recipient_email', 'recipient_phone']
    readonly_fields = ['notification_id', 'created_at', 'sent_at', 'read_at']
    actions = ['mark_read', 'mark_sent', 'cancel_notifications', 'retry_notifications']
    
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

    def mark_read(self, request, queryset):
        updated = 0
        for notification in queryset:
            notification.mark_as_read()
            updated += 1
        self.message_user(request, f'{updated} notifications marked read.')
    mark_read.short_description = 'Mark selected notifications read'

    def mark_sent(self, request, queryset):
        updated = 0
        for notification in queryset:
            notification.mark_as_sent()
            updated += 1
        self.message_user(request, f'{updated} notifications marked sent.')
    mark_sent.short_description = 'Mark selected notifications sent'

    def cancel_notifications(self, request, queryset):
        updated = queryset.exclude(status='read').update(status='cancelled')
        self.message_user(request, f'{updated} notifications cancelled.')
    cancel_notifications.short_description = 'Cancel selected notifications'

    def retry_notifications(self, request, queryset):
        retried = 0
        for notification in queryset.filter(status='failed'):
            if NotificationService.send_notification(notification):
                retried += 1
        self.message_user(request, f'{retried} failed notifications retried successfully.')
    retry_notifications.short_description = 'Retry selected failed notifications'


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ['notification', 'attempt_number', 'success', 'created_at']
    list_filter = ['success', 'created_at']
    readonly_fields = ['notification', 'attempt_number', 'channel_response', 'error_details', 'success', 'created_at']

from django.contrib import admin

# Register your models here.

