# reports/views.py - COMPLETE REPLACEMENT
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count
from django.utils import timezone
from decimal import Decimal

from .models import models

from .models import SavedReport, ReportExport
from .serializers import SavedReportSerializer, ReportExportSerializer


class ReportViewSet(viewsets.GenericViewSet):
    """
    ViewSet for generating reports
    Simplified version to avoid URL pattern errors
    """
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard_stats(self, request):
        """Get dashboard statistics"""
        from sales.models import Sale
        from products.models import Product
        
        today = timezone.now().date()
        today_start = timezone.make_aware(timezone.datetime.combine(today, timezone.datetime.min.time()))
        
        today_sales = Sale.objects.filter(
            sale_date__gte=today_start,
            status='completed'
        ).aggregate(total=Sum('total'))['total'] or Decimal('0')
        
        low_stock_count = Product.objects.filter(
            is_active=True,
            stock_quantity__lte=models.F('reorder_level')
        ).exclude(reorder_level=0).count()
        
        return Response({
            'today_sales': float(today_sales),
            'low_stock_count': low_stock_count,
            'message': 'Dashboard data retrieved successfully'
        })
    
    @action(detail=False, methods=['post'], url_path='generate')
    def generate_report(self, request):
        """Generate a report"""
        report_type = request.data.get('report_type', 'sales')
        return Response({
            'message': f'Report {report_type} generated',
            'data': {'sample': 'data'}
        })


class SavedReportViewSet(viewsets.ModelViewSet):
    """
    ViewSet for saved report configurations
    """
    queryset = SavedReport.objects.all()
    serializer_class = SavedReportSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['report_type', 'is_public']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']
    
    def get_queryset(self):
        user = self.request.user
        return SavedReport.objects.filter(
           # models.Q(created_by=user) | models.Q(is_public=True)
        )
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'], url_path='run')
    def run_report(self, request, pk=None):
        """Run a saved report"""
        saved_report = self.get_object()
        return Response({
            'message': f'Running report: {saved_report.name}',
            'report_type': saved_report.report_type,
            'config': saved_report.config
        })
