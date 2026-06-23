
# notifications/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from django.utils import timezone

from .models import NotificationChannel, NotificationTemplate, NotificationRule, Notification
from .serializers import (
    NotificationChannelSerializer, NotificationTemplateSerializer,
    NotificationRuleSerializer, NotificationSerializer, TestNotificationSerializer
)
from .notification_service import NotificationService


class NotificationChannelViewSet(viewsets.ModelViewSet):
    """ViewSet for managing notification channels"""
    
    queryset = NotificationChannel.objects.all()
    serializer_class = NotificationChannelSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Only admins can see all channels"""
        if self.request.user.role in ['super_admin', 'admin']:
            return NotificationChannel.objects.all()
        return NotificationChannel.objects.filter(is_active=True)


class NotificationTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for managing notification templates"""
    
    queryset = NotificationTemplate.objects.all()
    serializer_class = NotificationTemplateSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        if self.request.user.role in ['super_admin', 'admin']:
            return NotificationTemplate.objects.all()
        return NotificationTemplate.objects.filter(is_active=True)
    
    @action(detail=True, methods=['post'], url_path='preview')
    def preview_template(self, request, pk=None):
        """Preview rendered template with sample data"""
        template = self.get_object()
        
        # Sample context based on category
        sample_context = {
            'product_name': 'Sample Product',
            'product_sku': 'PRD-001',
            'stock_quantity': 5,
            'reorder_level': 10,
            'sale_id': 'INV-20241215-0001',
            'sale_total': 25000.00,
            'customer_name': 'John Doe',
            'cashier_name': 'Jane Cashier',
            'items_count': 3,
            'date': timezone.now().strftime('%B %d, %Y'),
            'return_number': 'RET-20241215-0001',
            'refund_amount': 25000.00
        }
        
        # Use only relevant variables
        context = {k: sample_context.get(k, '{{' + k + '}}') for k in template.available_variables}
        
        rendered_subject = template.render_subject(context)
        rendered_body = template.render_body(context)
        rendered_html = template.render_html(context) if template.html_template else None
        
        return Response({
            'subject': rendered_subject,
            'body': rendered_body,
            'html': rendered_html,
            'variables_used': context
        })


class NotificationRuleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing notification rules"""
    
    queryset = NotificationRule.objects.all()
    serializer_class = NotificationRuleSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        if self.request.user.role in ['super_admin', 'admin', 'manager']:
            return NotificationRule.objects.all()
        return NotificationRule.objects.filter(is_active=True)
    
    @action(detail=False, methods=['post'], url_path='trigger')
    def trigger_rules(self, request):
        """Manually trigger all rules check"""
        if request.user.role not in ['super_admin', 'admin', 'manager']:
            return Response(
                {"error": "Only managers can trigger rules"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        triggered = NotificationService.check_and_trigger_rules()
        
        return Response({
            'message': f'Triggered {len(triggered)} notifications',
            'triggered': triggered
        })
    
    @action(detail=True, methods=['post'], url_path='test')
    def test_rule(self, request, pk=None):
        """Test a rule with custom context"""
        rule = self.get_object()
        
        context = request.data.get('context', {})
        
        if rule.should_send(context):
            recipients = rule.get_recipient_list()
            return Response({
                'should_send': True,
                'recipients': recipients,
                'template': rule.template.name,
                'conditions_met': True
            })
        else:
            return Response({
                'should_send': False,
                'conditions_met': False,
                'message': 'Conditions not met'
            })


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing notifications"""
    
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Users see their own notifications"""
        queryset = Notification.objects.filter(
            Q(recipient_user=self.request.user) |
            Q(recipient_email=self.request.user.email)
        )
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset
    
    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_as_read(self, request, pk=None):
        """Mark notification as read"""
        notification = self.get_object()
        notification.mark_as_read()
        return Response({'success': True, 'message': 'Marked as read'})
    
    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        """Mark all user notifications as read"""
        self.get_queryset().filter(status__in=['pending', 'sent']).update(
            status='read',
            read_at=timezone.now()
        )
        return Response({'success': True, 'message': 'All notifications marked as read'})
    
    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        """Get count of unread notifications"""
        count = self.get_queryset().filter(status__in=['pending', 'sent']).count()
        return Response({'unread_count': count})
    
    @action(detail=False, methods=['post'], url_path='test')
    def test_notification(self, request):
        """Send a test notification"""
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only admins can send test notifications"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = TestNotificationSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        
        try:
            channel = NotificationChannel.objects.get(id=data['channel_id'], is_active=True)
        except NotificationChannel.DoesNotExist:
            return Response(
                {"error": "Channel not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        notification = Notification.objects.create(
            title=data['title'],
            message=data['message'],
            channel=channel,
            recipient_email=data.get('recipient_email'),
            recipient_phone=data.get('recipient_phone'),
            priority='high',
            metadata={'test': True}
        )
        
        success = NotificationService.send_notification(notification)
        
        if success:
            return Response({
                'message': 'Test notification sent successfully',
                'notification_id': notification.notification_id
            })
        else:
            return Response({
                'error': 'Failed to send notification',
                'error_message': notification.error_message
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

from django.shortcuts import render

# Create your views here.

