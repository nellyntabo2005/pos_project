# reports/views.py - COMPLETE REPLACEMENT
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db import models
from django.db.models import Sum, Count
from django.http import HttpResponse
from django.utils.text import slugify
from django.utils import timezone
from decimal import Decimal

from .models import SavedReport, ReportExport
from .serializers import SavedReportSerializer, ReportExportSerializer


def _escape_pdf_text(value):
    return str(value).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _build_simple_pdf(title, company_name, summary):
    lines = [title, company_name, f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}", ""]
    lines.extend([f"{key}: {value}" for key, value in summary.items()])

    content_lines = ["BT", "/F1 16 Tf", "72 770 Td", f"({_escape_pdf_text(lines[0])}) Tj"]
    content_lines.extend(["/F1 10 Tf", "0 -24 Td"])
    for line in lines[1:]:
        content_lines.append(f"({_escape_pdf_text(line)}) Tj")
        content_lines.append("0 -16 Td")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf)


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
        from sales.models import Sale
        from inventory.models import PurchaseOrder
        from products.models import Product

        report_type = request.data.get('report_type', 'sales')
        account = request.data.get('account', 'sales')

        if report_type == 'sales':
            sales = Sale.objects.filter(status='completed')
            if account == 'cashier' and request.data.get('cashier_id'):
                sales = sales.filter(cashier_id=request.data['cashier_id'])
            if account == 'customer' and request.data.get('customer_id'):
                sales = sales.filter(customer_id=request.data['customer_id'])

            totals = sales.aggregate(
                total_revenue=Sum('total'),
                transaction_count=Count('id')
            )
            return Response({
                'message': 'Sales report generated',
                'report_type': report_type,
                'account': account,
                'data': {
                    'total_revenue': float(totals['total_revenue'] or 0),
                    'transaction_count': totals['transaction_count'] or 0,
                }
            })

        if report_type == 'inventory':
            products = Product.objects.filter(is_active=True)
            return Response({
                'message': 'Inventory report generated',
                'report_type': report_type,
                'account': account,
                'data': {
                    'product_count': products.count(),
                    'stock_value': float(sum(product.stock_value for product in products)),
                }
            })

        if report_type == 'suppliers':
            purchase_orders = PurchaseOrder.objects.all()
            if request.data.get('supplier_id'):
                purchase_orders = purchase_orders.filter(supplier_id=request.data['supplier_id'])
            totals = purchase_orders.aggregate(total=Sum('total'), count=Count('id'))
            return Response({
                'message': 'Supplier report generated',
                'report_type': report_type,
                'account': account,
                'data': {
                    'purchase_order_total': float(totals['total'] or 0),
                    'purchase_order_count': totals['count'] or 0,
                }
            })

        return Response({
            'message': f'Report {report_type} generated',
            'data': {'sample': 'data'}
        })

    @action(detail=False, methods=['post'], url_path='export')
    def export_report(self, request):
        """Export a report as a downloadable PDF."""
        file_format = request.data.get('format', 'pdf')
        if file_format != 'pdf':
            return Response(
                {'detail': 'Only PDF export is currently supported.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        title = request.data.get('title') or 'Business Report'
        company_name = request.data.get('company_name') or 'POS Admin Dashboard'
        summary = request.data.get('summary') or {}
        rows = request.data.get('rows') or []

        data = {'summary': summary}
        if rows:
            data['summary'].update({
                str(row.get('metric', 'Metric')): str(row.get('value', ''))
                for row in rows
                if isinstance(row, dict)
            })

        try:
            from .report_service import ReportService
            pdf_bytes = ReportService.generate_pdf_report(data, title, company_name).getvalue()
        except ModuleNotFoundError:
            pdf_bytes = _build_simple_pdf(title, company_name, data['summary'])

        filename = f"{slugify(title) or 'report'}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


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
           models.Q(created_by=user) | models.Q(is_public=True)
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
