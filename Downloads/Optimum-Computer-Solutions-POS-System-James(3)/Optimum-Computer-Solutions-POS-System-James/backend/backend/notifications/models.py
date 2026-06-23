
# notifications/models.py
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import uuid
from datetime import datetime, timedelta

from users.models import User
from products.models import Product
from sales.models import Sale


class NotificationChannel(models.Model):
    """
    Configure notification channels (Email, SMS, WhatsApp, etc.)
    """
    
    CHANNEL_TYPES = [
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('whatsapp', 'WhatsApp'),
        ('in_app', 'In-App Notification'),
        ('webhook', 'Webhook'),
    ]
    
    name = models.CharField(max_length=100)
    channel_type = models.CharField(max_length=20, choices=CHANNEL_TYPES)
    
    # Configuration (JSON)
    config = models.JSONField(default=dict, help_text="Channel-specific settings")
    
    # Rate limiting
    rate_limit_per_minute = models.IntegerField(default=60)
    rate_limit_per_hour = models.IntegerField(default=1000)
    rate_limit_per_day = models.IntegerField(default=10000)
    
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    
    # Priority order (lower number = higher priority)
    priority = models.IntegerField(default=10)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['priority', 'name']
    
    def __str__(self):
        return f"{self.name} ({self.get_channel_type_display()})"
    
    def save(self, *args, **kwargs):
        # Ensure only one default channel per type
        if self.is_default:
            NotificationChannel.objects.filter(
                channel_type=self.channel_type,
                is_default=True
            ).exclude(id=self.id).update(is_default=False)
        super().save(*args, **kwargs)


class NotificationTemplate(models.Model):
    """
    Templates for different notification types
    Supports variables like {{customer_name}}, {{sale_total}}, etc.
    """
    
    TEMPLATE_CATEGORIES = [
        ('low_stock', 'Low Stock Alert'),
        ('sale', 'Sale Notification'),
        ('return', 'Return Request'),
        ('refund', 'Refund Processed'),
        ('payment', 'Payment Received'),
        ('customer_welcome', 'Customer Welcome'),
        ('customer_birthday', 'Customer Birthday'),
        ('daily_summary', 'Daily Sales Summary'),
        ('weekly_report', 'Weekly Report'),
        ('system_alert', 'System Alert'),
    ]
    
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=30, choices=TEMPLATE_CATEGORIES)
    channel = models.ForeignKey(NotificationChannel, on_delete=models.PROTECT, related_name='templates')
    
    # Subject/Title
    subject_template = models.CharField(max_length=200, help_text="Email subject or SMS title")
    
    # Body template (supports Django template syntax)
    body_template = models.TextField(help_text="Template body with {{ variables }}")
    
    # HTML version (for emails)
    html_template = models.TextField(blank=True, help_text="HTML version for email")
    
    # Variables documentation
    available_variables = models.JSONField(default=list, help_text="List of available variables")
    
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['category', 'channel']
    
    def __str__(self):
        return f"{self.name} - {self.get_category_display()}"
    
    def render_subject(self, context):
        """Render subject with context variables"""
        from django.template import Template, Context
        template = Template(self.subject_template)
        return template.render(Context(context))
    
    def render_body(self, context):
        """Render body with context variables"""
        from django.template import Template, Context
        template = Template(self.body_template)
        return template.render(Context(context))
    
    def render_html(self, context):
        """Render HTML with context variables"""
        if not self.html_template:
            return None
        from django.template import Template, Context
        template = Template(self.html_template)
        return template.render(Context(context))


class NotificationRule(models.Model):
    """
    Rules for when to send notifications
    Example: When stock < reorder_level, send low stock alert
    """
    
    EVENT_TYPES = [
        ('low_stock', 'Low Stock'),
        ('out_of_stock', 'Out of Stock'),
        ('high_value_sale', 'High Value Sale'),
        ('sale_completed', 'Sale Completed'),
        ('return_requested', 'Return Requested'),
        ('refund_processed', 'Refund Processed'),
        ('customer_registered', 'Customer Registered'),
        ('daily_summary', 'Daily Summary'),
        ('weekly_report', 'Weekly Report'),
        ('system_error', 'System Error'),
    ]
    
    name = models.CharField(max_length=100)
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    
    # Conditions (JSON)
    conditions = models.JSONField(default=dict, help_text="Conditions to trigger notification")
    
    # Templates to use
    template = models.ForeignKey(NotificationTemplate, on_delete=models.PROTECT, related_name='rules')
    
    # Recipients
    recipients = models.ManyToManyField(User, related_name='notification_rules', blank=True)
    recipient_roles = models.JSONField(default=list, help_text="Roles to notify (admin, manager, cashier)")
    
    # Additional recipients (email addresses)
    additional_recipients = models.TextField(blank=True, help_text="Comma-separated emails")
    
    # Delay before sending (e.g., wait 5 minutes)
    delay_minutes = models.IntegerField(default=0)
    
    is_active = models.BooleanField(default=True)
    
    # Rate limiting per rule
    throttle_per_hour = models.IntegerField(default=10, help_text="Max notifications per hour")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['event_type', 'name']
    
    def __str__(self):
        return f"{self.name} - {self.get_event_type_display()}"
    
    def should_send(self, context):
        """Check if conditions are met"""
        if not self.is_active:
            return False
        
        # Check conditions
        if self.event_type == 'low_stock':
            stock = context.get('stock_quantity', 0)
            reorder_level = context.get('reorder_level', 0)
            return stock <= reorder_level
        
        elif self.event_type == 'high_value_sale':
            sale_total = context.get('sale_total', 0)
            threshold = self.conditions.get('threshold', 50000)
            return sale_total >= threshold
        
        elif self.event_type == 'out_of_stock':
            return context.get('stock_quantity', 0) == 0
        
        return True
    
    def get_recipient_list(self):
        """Get list of recipient email addresses"""
        recipients = []
        
        # Add direct users
        for user in self.recipients.filter(is_active=True):
            if user.email:
                recipients.append(user.email)
        
        # Add by role
        for role in self.recipient_roles:
            users = User.objects.filter(role=role, is_active=True)
            for user in users:
                if user.email and user.email not in recipients:
                    recipients.append(user.email)
        
        # Add additional emails
        if self.additional_recipients:
            for email in self.additional_recipients.split(','):
                email = email.strip()
                if email and email not in recipients:
                    recipients.append(email)
        
        return recipients


class Notification(models.Model):
    """
    Individual notification record
    """
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
        ('read', 'Read'),
        ('cancelled', 'Cancelled'),
    ]
    
    notification_id = models.CharField(max_length=50, unique=True, editable=False)
    
    # Notification details
    title = models.CharField(max_length=200)
    message = models.TextField()
    
    # Channel
    channel = models.ForeignKey(NotificationChannel, on_delete=models.PROTECT)
    
    # Priority
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    
    # Recipient
    recipient_user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    recipient_email = models.EmailField(null=True, blank=True)
    recipient_phone = models.CharField(max_length=20, blank=True)
    
    # Related objects
    related_product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    related_sale = models.ForeignKey(Sale, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True)
    
    # Tracking
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # For email tracking
    email_message_id = models.CharField(max_length=200, blank=True)
    
    # Metadata
    metadata = models.JSONField(default=dict)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['notification_id']),
            models.Index(fields=['recipient_user', 'status']),
            models.Index(fields=['created_at']),
            models.Index(fields=['status', 'priority']),
        ]
    
    def __str__(self):
        return f"{self.notification_id} - {self.title} - {self.status}"
    
    def save(self, *args, **kwargs):
        is_new = self.pk is None
        if not self.notification_id:
            date_str = datetime.now().strftime('%Y%m%d%H%M%S')
            self.notification_id = f"NOT-{date_str}-{uuid.uuid4().hex[:8].upper()}"
        super().save(*args, **kwargs)
        if is_new:
            self.broadcast()

    def broadcast(self):
        users = []
        if self.recipient_user_id:
            users.append(self.recipient_user_id)
        elif self.recipient_email:
            users.extend(User.objects.filter(email=self.recipient_email, is_active=True).values_list('id', flat=True))

        if not users:
            return

        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        payload = {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "priority": self.priority,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        try:
            for user_id in users:
                async_to_sync(channel_layer.group_send)(
                    f"user_{user_id}",
                    {"type": "send_notification", "message": payload}
                )
        except Exception:
            pass
    
    def mark_as_read(self):
        """Mark notification as read"""
        self.status = 'read'
        self.read_at = datetime.now()
        self.save(update_fields=['status', 'read_at'])
    
    def mark_as_sent(self):
        """Mark notification as sent"""
        self.status = 'sent'
        self.sent_at = datetime.now()
        self.save(update_fields=['status', 'sent_at'])


class NotificationLog(models.Model):
    """
    Detailed log of notification delivery attempts
    """
    
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name='logs')
    
    attempt_number = models.IntegerField(default=1)
    channel_response = models.JSONField(default=dict)
    error_details = models.TextField(blank=True)
    
    success = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Attempt {self.attempt_number} for {self.notification.notification_id} - {'Success' if self.success else 'Failed'}"

        from django.db import models

