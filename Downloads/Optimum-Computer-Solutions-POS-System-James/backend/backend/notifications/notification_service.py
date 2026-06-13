# notifications/notification_service.py
from django.core.mail import send_mail, EmailMultiAlternatives
from django.template import Template, Context
from django.conf import settings
from django.utils import timezone
from datetime import datetime
import requests
import json
import logging
from decimal import Decimal

from .models import Notification, NotificationLog, NotificationRule, NotificationChannel
from products.models import Product
from sales.models import Sale
from customers.models import Customer
from returns.models import Return

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for sending notifications via various channels"""
    
    @staticmethod
    def send_notification(notification):
        """
        Send a single notification through its channel
        """
        try:
            channel = notification.channel
            
            if channel.channel_type == 'email':
                return NotificationService._send_email(notification)
            elif channel.channel_type == 'sms':
                return NotificationService._send_sms(notification)
            elif channel.channel_type == 'whatsapp':
                return NotificationService._send_whatsapp(notification)
            elif channel.channel_type == 'webhook':
                return NotificationService._send_webhook(notification)
            else:
                # In-app notification (just mark as sent)
                notification.mark_as_sent()
                return True
                
        except Exception as e:
            notification.status = 'failed'
            notification.error_message = str(e)
            notification.save()
            
            # Log the error
            NotificationLog.objects.create(
                notification=notification,
                success=False,
                error_details=str(e)
            )
            return False
    
    @staticmethod
    def _send_email(notification):
        """Send email notification"""
        config = notification.channel.config
        
        # Prepare email
        subject = notification.title
        from_email = config.get('from_email', settings.DEFAULT_FROM_EMAIL)
        to_email = notification.recipient_email or notification.recipient_user.email
        
        if not to_email:
            raise Exception("No recipient email address")
        
        # Create email
        email = EmailMultiAlternatives(
            subject=subject,
            body=notification.message,
            from_email=from_email,
            to=[to_email],
            reply_to=[config.get('reply_to', from_email)]
        )
        
        # Add HTML version if available
        if notification.metadata.get('html_content'):
            email.attach_alternative(notification.metadata['html_content'], 'text/html')
        
        # Send
        email.send(fail_silently=False)
        
        # Record success
        notification.mark_as_sent()
        NotificationLog.objects.create(
            notification=notification,
            success=True,
            channel_response={'message_id': email.message_id() if hasattr(email, 'message_id') else None}
        )
        
        # Update email message ID
        if hasattr(email, 'message_id'):
            notification.email_message_id = email.message_id()
            notification.save(update_fields=['email_message_id'])
        
        return True
    
    @staticmethod
    def _send_sms(notification):
        """Send SMS notification (using Africa's Talking or similar)"""
        config = notification.channel.config
        provider = config.get('provider', 'africastalking')
        
        phone = notification.recipient_phone
        if not phone and notification.recipient_user:
            phone = notification.recipient_user.phone
        
        if not phone:
            raise Exception("No recipient phone number")
        
        # Format phone number (Kenyan format)
        if not phone.startswith('+'):
            if phone.startswith('0'):
                phone = '+254' + phone[1:]
            elif phone.startswith('254'):
                phone = '+' + phone
        
        if provider == 'africastalking':
            return NotificationService._send_africastalking_sms(phone, notification.message, config)
        elif provider == 'twilio':
            return NotificationService._send_twilio_sms(phone, notification.message, config)
        else:
            # Mock for development
            logger.info(f"[SMS] To: {phone} - {notification.message}")
            notification.mark_as_sent()
            NotificationLog.objects.create(
                notification=notification,
                success=True,
                channel_response={'provider': 'mock', 'phone': phone}
            )
            return True
    
    @staticmethod
    def _send_africastalking_sms(phone, message, config):
        """Send SMS via Africa's Talking API"""
        # This requires Africa's Talking credentials
        # For now, mock implementation
        logger.info(f"[Africa's Talking SMS] To: {phone} - {message[:50]}...")
        
        # In production, implement API call:
        # import africastalking
        # africastalking.initialize(username, api_key)
        # sms = africastalking.SMS
        # response = sms.send(message, [phone])
        
        return True
    
    @staticmethod
    def _send_twilio_sms(phone, message, config):
        """Send SMS via Twilio API"""
        # Mock implementation
        logger.info(f"[Twilio SMS] To: {phone} - {message[:50]}...")
        return True
    
    @staticmethod
    def _send_whatsapp(notification):
        """Send WhatsApp notification"""
        config = notification.channel.config
        phone = notification.recipient_phone or notification.recipient_user.phone
        
        if not phone:
            raise Exception("No recipient phone number")
        
        # Format phone
        if not phone.startswith('+'):
            if phone.startswith('0'):
                phone = '+254' + phone[1:]
        
        # Use WhatsApp Business API or Twilio WhatsApp
        logger.info(f"[WhatsApp] To: {phone} - {notification.message[:50]}...")
        
        notification.mark_as_sent()
        return True
    
    @staticmethod
    def _send_webhook(notification):
        """Send webhook notification"""
        config = notification.channel.config
        webhook_url = config.get('webhook_url')
        
        if not webhook_url:
            raise Exception("No webhook URL configured")
        
        payload = {
            'notification_id': notification.notification_id,
            'title': notification.title,
            'message': notification.message,
            'priority': notification.priority,
            'timestamp': notification.created_at.isoformat(),
            'metadata': notification.metadata
        }
        
        response = requests.post(
            webhook_url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        response.raise_for_status()
        
        notification.mark_as_sent()
        NotificationLog.objects.create(
            notification=notification,
            success=True,
            channel_response={'status_code': response.status_code, 'response': response.text}
        )
        
        return True
    
    @staticmethod
    def check_and_trigger_rules():
        """
        Check all active rules and trigger notifications if conditions met
        This should be called by a cron job / Celery periodic task
        """
        rules = NotificationRule.objects.filter(is_active=True)
        triggered = []
        
        for rule in rules:
            if rule.event_type == 'low_stock':
                # Check low stock products
                low_stock_products = Product.objects.filter(
                    is_active=True,
                    stock_quantity__lte=models.F('reorder_level')
                ).exclude(reorder_level=0)
                
                for product in low_stock_products:
                    context = {
                        'product_name': product.name,
                        'product_sku': product.sku,
                        'stock_quantity': float(product.stock_quantity),
                        'reorder_level': float(product.reorder_level),
                        'reorder_quantity': float(product.reorder_quantity)
                    }
                    
                    if rule.should_send(context):
                        NotificationService.create_and_send(
                            rule=rule,
                            context=context,
                            recipient_emails=rule.get_recipient_list(),
                            related_product=product
                        )
                        triggered.append(f"Low stock: {product.name}")
            
            elif rule.event_type == 'high_value_sale':
                # Check high value sales in last hour
                hour_ago = timezone.now() - timezone.timedelta(hours=1)
                high_value_sales = Sale.objects.filter(
                    sale_date__gte=hour_ago,
                    status='completed',
                    total__gte=rule.conditions.get('threshold', 50000)
                )
                
                for sale in high_value_sales:
                    # Avoid duplicate notifications
                    if not Notification.objects.filter(
                        related_sale=sale,
                        created_at__gte=hour_ago,
                        title__icontains='High Value'
                    ).exists():
                        context = {
                            'sale_id': sale.sale_id,
                            'sale_total': float(sale.total),
                            'customer_name': sale.customer.name if sale.customer else 'Walk-in',
                            'cashier_name': sale.cashier.get_full_name() or sale.cashier.username,
                            'items_count': sale.items.count()
                        }
                        
                        NotificationService.create_and_send(
                            rule=rule,
                            context=context,
                            recipient_emails=rule.get_recipient_list(),
                            related_sale=sale
                        )
                        triggered.append(f"High value sale: {sale.sale_id}")
            
            elif rule.event_type == 'daily_summary':
                # Check if daily summary already sent today
                today = timezone.now().date()
                if not Notification.objects.filter(
                    title__icontains='Daily Sales Summary',
                    created_at__date=today
                ).exists():
                    NotificationService.send_daily_summary(rule)
                    triggered.append("Daily summary sent")
        
        return triggered
    
    @staticmethod
    def create_and_send(rule, context, recipient_emails, related_product=None, related_sale=None):
        """Create notification from rule and send it"""
        template = rule.template
        
        # Render content
        subject = template.render_subject(context)
        body = template.render_body(context)
        html_body = template.render_html(context) if template.html_template else None
        
        # Get channel
        channel = template.channel
        
        # Send to each recipient
        for email in recipient_emails:
            notification = Notification.objects.create(
                title=subject,
                message=body,
                channel=channel,
                priority='high' if rule.event_type == 'high_value_sale' else 'medium',
                recipient_email=email,
                related_product=related_product,
                related_sale=related_sale,
                metadata={
                    'rule_id': rule.id,
                    'rule_name': rule.name,
                    'event_type': rule.event_type,
                    'html_content': html_body,
                    'context': context
                }
            )
            
            # Send immediately (or use queue in production)
            NotificationService.send_notification(notification)
    
    @staticmethod
    def send_daily_summary(rule):
        """Send daily sales summary to recipients"""
        today = timezone.now().date()
        yesterday = today - timezone.timedelta(days=1)
        
        # Get yesterday's sales
        start = timezone.datetime.combine(yesterday, timezone.datetime.min.time())
        end = timezone.datetime.combine(yesterday, timezone.datetime.max.time())
        
        sales = Sale.objects.filter(
            sale_date__range=(start, end),
            status='completed'
        )
        
        total_sales = sales.aggregate(total=models.Sum('total'))['total'] or 0
        transaction_count = sales.count()
        
        # Top products
        from django.db.models import Sum
        top_products = SaleItem.objects.filter(
            sale__in=sales
        ).values('product_name').annotate(
            total_quantity=Sum('quantity')
        ).order_by('-total_quantity')[:5]
        
        context = {
            'date': yesterday.strftime('%B %d, %Y'),
            'total_sales': float(total_sales),
            'transaction_count': transaction_count,
            'average_transaction': float(total_sales / transaction_count) if transaction_count > 0 else 0,
            'top_products': list(top_products),
            'low_stock_count': Product.objects.filter(
                stock_quantity__lte=models.F('reorder_level')
            ).exclude(reorder_level=0).count()
        }
        
        # Create notification
        template = rule.template
        subject = template.render_subject(context)
        body = template.render_body(context)
        html_body = template.render_html(context) if template.html_template else None
        
        channel = template.channel
        
        for email in rule.get_recipient_list():
            Notification.objects.create(
                title=subject,
                message=body,
                channel=channel,
                priority='medium',
                recipient_email=email,
                metadata={
                    'rule_id': rule.id,
                    'rule_name': rule.name,
                    'html_content': html_body,
                    'context': context
                }
            )
            # In production, send via queue