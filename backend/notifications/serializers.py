# notifications/serializers.py
from rest_framework import serializers
from .models import (
    NotificationChannel, NotificationTemplate, 
    NotificationRule, Notification, NotificationLog
)


class NotificationChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationChannel
        fields = [
            'id', 'name', 'channel_type', 'config', 
            'rate_limit_per_minute', 'rate_limit_per_hour', 
            'rate_limit_per_day', 'is_active', 'is_default', 
            'priority', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class NotificationTemplateSerializer(serializers.ModelSerializer):
    channel_name = serializers.SerializerMethodField()
    category_display = serializers.SerializerMethodField()
    
    class Meta:
        model = NotificationTemplate
        fields = [
            'id', 'name', 'category', 'category_display', 'channel',
            'channel_name', 'subject_template', 'body_template',
            'html_template', 'available_variables', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_channel_name(self, obj):
        return obj.channel.name
    
    def get_category_display(self, obj):
        return obj.get_category_display()


class NotificationRuleSerializer(serializers.ModelSerializer):
    template_name = serializers.SerializerMethodField()
    event_type_display = serializers.SerializerMethodField()
    recipients_list = serializers.SerializerMethodField()
    
    class Meta:
        model = NotificationRule
        fields = [
            'id', 'name', 'event_type', 'event_type_display',
            'conditions', 'template', 'template_name', 'recipients',
            'recipients_list', 'recipient_roles', 'additional_recipients',
            'delay_minutes', 'is_active', 'throttle_per_hour',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_template_name(self, obj):
        return obj.template.name
    
    def get_event_type_display(self, obj):
        return obj.get_event_type_display()
    
    def get_recipients_list(self, obj):
        return [user.email for user in obj.recipients.filter(is_active=True)]


class NotificationSerializer(serializers.ModelSerializer):
    channel_name = serializers.SerializerMethodField()
    severity = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    action_url = serializers.SerializerMethodField()
    priority_display = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    recipient_display = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'notification_id', 'title', 'message', 'channel',
            'channel_name', 'priority', 'priority_display', 'status',
            'status_display', 'severity', 'is_read', 'action_url',
            'recipient_user', 'recipient_email',
            'recipient_phone', 'recipient_display', 'related_product',
            'related_sale', 'error_message', 'sent_at', 'read_at',
            'created_at'
        ]
        read_only_fields = [
            'id', 'notification_id', 'sent_at', 'read_at', 'created_at'
        ]
    
    def get_channel_name(self, obj):
        return obj.channel.name

    def get_severity(self, obj):
        return {
            'low': 'info',
            'medium': 'info',
            'high': 'warning',
            'critical': 'error',
        }.get(obj.priority, 'info')

    def get_is_read(self, obj):
        return obj.status == 'read' or obj.read_at is not None

    def get_action_url(self, obj):
        if obj.related_product_id:
            return '/inventory'
        if obj.related_sale_id:
            return '/sales'
        return ''
    
    def get_priority_display(self, obj):
        return obj.get_priority_display()
    
    def get_status_display(self, obj):
        return obj.get_status_display()
    
    def get_recipient_display(self, obj):
        if obj.recipient_user:
            return obj.recipient_user.email or obj.recipient_user.username
        if obj.recipient_email:
            return obj.recipient_email
        if obj.recipient_phone:
            return obj.recipient_phone
        return 'Unknown'


class NotificationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationLog
        fields = [
            'id', 'notification', 'attempt_number', 'channel_response',
            'error_details', 'success', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class TestNotificationSerializer(serializers.Serializer):
    """Serializer for testing notifications"""
    
    channel_id = serializers.IntegerField()
    recipient_email = serializers.EmailField(required=False)
    recipient_phone = serializers.CharField(required=False, max_length=20)
    title = serializers.CharField(max_length=200, default="Test Notification")
    message = serializers.CharField(
        default="This is a test notification from your ERP system."
    )
