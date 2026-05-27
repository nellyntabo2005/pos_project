
# returns/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Sum, Count
from django.utils import timezone
from decimal import Decimal

from .models import Return, ReturnItem, ReturnImage, ReturnLog
from .serializers import (
    ReturnSerializer, ReturnItemSerializer, ReturnImageSerializer,
    #ReturnApproveSerializer, ReturnRejectSerializer, ReturnProcessSerializer
)
from sales.models import Sale, SaleItem


class ReturnViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Returns and Refunds
    """
    
    queryset = Return.objects.all()
    serializer_class = ReturnSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'reason', 'refund_method', 'customer']
    search_fields = ['return_number', 'customer__name', 'customer__phone', 'original_sale__sale_id']
    ordering_fields = ['return_date', 'refund_amount', 'status']
    ordering = ['-return_date']
    
    def get_queryset(self):
        user = self.request.user
        if user.role in ['super_admin', 'admin', 'manager']:
            return Return.objects.all()
        return Return.objects.filter(requested_by=user)
    
    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)
    
    @action(detail=True, methods=['post'], url_path='approve')
    def approve_return(self, request, pk=None):
        """Approve a return request"""
        return_obj = self.get_object()
        
        if request.user.role not in ['super_admin', 'admin', 'manager']:
            return Response(
                {"error": "Only managers can approve returns"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if return_obj.status != 'pending':
            return Response(
                {"error": f"Cannot approve return with status: {return_obj.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return_obj.approve_return(request.user)
        
        ReturnLog.objects.create(
            return_obj=return_obj,
            action='approved',
            performed_by=request.user,
            notes=request.data.get('notes', '')
        )
        
        return Response({
            'message': 'Return approved successfully',
            'return_number': return_obj.return_number
        })
    
    @action(detail=True, methods=['post'], url_path='reject')
    def reject_return(self, request, pk=None):
        """Reject a return request"""
        return_obj = self.get_object()
        
        if request.user.role not in ['super_admin', 'admin', 'manager']:
            return Response(
                {"error": "Only managers can reject returns"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if return_obj.status != 'pending':
            return Response(
                {"error": f"Cannot reject return with status: {return_obj.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        reason = request.data.get('reason', '')
        return_obj.reject_return(request.user, reason)
        
        return Response({
            'message': 'Return rejected',
            'return_number': return_obj.return_number
        })
    
    @action(detail=True, methods=['post'], url_path='process')
    def process_refund(self, request, pk=None):
        """Process the refund"""
        return_obj = self.get_object()
        
        if request.user.role not in ['super_admin', 'admin', 'manager', 'accountant']:
            return Response(
                {"error": "Only managers or accountants can process refunds"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if return_obj.status != 'approved':
            return Response(
                {"error": f"Cannot process refund for return with status: {return_obj.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        success, transaction, message = return_obj.process_refund(request.user)
        
        if not success:
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'message': message,
            'return_number': return_obj.return_number,
            'refund_amount': float(return_obj.net_refund)
        })


class ReturnItemViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing return items (read-only)
    """
    
    queryset = ReturnItem.objects.all()
    serializer_class = ReturnItemSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['return_obj', 'product']


class ReturnImageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing return images (read-only)
    """
    
    queryset = ReturnImage.objects.all()
    serializer_class = ReturnImageSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['return_obj']


#class ReturnLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing return logs (read-only)
    """
    
    #queryset = ReturnLog.objects.all()
    #serializer_class = ReturnLogSerializer
    #permission_classes = [IsAuthenticated]
    
    #filter_backends = [DjangoFilterBackend]
    #filterset_fields = ['return_obj', 'action']

# Create your views here.
from rest_framework import viewsets
from .models import Return
from .serializers import ReturnSerializer
from notifications.utils import send_notification
from urllib3 import request


class ReturnViewSet(viewsets.ModelViewSet):
    queryset = Return.objects.all()
    serializer_class = ReturnSerializer

    def perform_create(self, serializer):
        returned_product = serializer.save()

        send_notification(
          request.user,  f"🔄 Product returned: {returned_product.product.name}"
        )

        send_notification(
          request.user,  f"💰 Refund processed for return #{returned_product.id}"
        )
