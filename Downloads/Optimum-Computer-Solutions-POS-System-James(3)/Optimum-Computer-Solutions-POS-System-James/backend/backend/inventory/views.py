# inventory/views.py - Add at the very top
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Sum, F, Avg, Count, Case, When, IntegerField
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError
from django.http import HttpResponse
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.urls import reverse
from decimal import Decimal
from html import escape
import pandas as pd

import io
from datetime import datetime, timedelta

from .models import (
    StockMovement, Batch, PurchaseOrder, PurchaseOrderItem,
    GoodsReceivedNote,
    StockCount, StockCountItem, StoreTransfer, StoreTransferItem,
    StoreStock, InventoryAlert
)
from .serializers import (
    StockMovementSerializer, BatchSerializer, PurchaseOrderSerializer,
    PurchaseOrderReceiveSerializer, GoodsReceivedNoteSerializer,
    GoodsReceivedNoteVerifySerializer, StockCountSerializer,
    StoreTransferSerializer, StoreStockSerializer, InventoryAlertSerializer,
    BulkStockUpdateSerializer, BulkPriceUpdateSerializer,
    StockMovementFilterSerializer,ImportJobSerializer,
)

from products.models import Product, Category
from .models import Supplier, ImportJob
from users.models import User


def has_inventory_write_access(user):
    return getattr(user, 'role', None) in ['super_admin', 'admin', 'manager', 'inventory_clerk']


def has_purchase_approval_access(user):
    return getattr(user, 'role', None) in ['super_admin', 'admin', 'manager']


def build_purchase_order_pdf(purchase_order):
    def escape_pdf_text(value):
        return str(value).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    lines = [
        'Local Purchase Order',
        f'PO Number: {purchase_order.po_number}',
        f'Supplier: {purchase_order.supplier.name}',
        f'Email: {purchase_order.supplier.email or "Not captured"}',
        f'Order Date: {purchase_order.order_date.strftime("%Y-%m-%d")}',
        '',
        'Item | SKU | Supplier SKU | Qty | Unit Cost | Line Total',
    ]
    for item in purchase_order.items.select_related('product'):
        lines.append(
            f'{item.product.name} | {item.product.sku} | {item.product.supplier_sku or item.product.sku} | '
            f'{item.quantity:g} | {item.unit_cost:,.2f} | {item.total:,.2f}'
        )
    lines.extend(['', f'PO Total: {purchase_order.total:,.2f}'])

    text_commands = ['BT', '/F1 11 Tf', '50 790 Td']
    for index, line in enumerate(lines[:42]):
        if index > 0:
            text_commands.append('0 -18 Td')
        text_commands.append(f'({escape_pdf_text(line)}) Tj')
    text_commands.append('ET')
    stream = '\n'.join(text_commands).encode('utf-8')

    objects = [
        b'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
        b'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
        b'3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n',
        b'4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
        f'5 0 obj << /Length {len(stream)} >> stream\n'.encode('utf-8') + stream + b'\nendstream endobj\n',
    ]

    pdf = io.BytesIO()
    pdf.write(b'%PDF-1.4\n')
    offsets = []
    for obj in objects:
        offsets.append(pdf.tell())
        pdf.write(obj)
    xref_offset = pdf.tell()
    pdf.write(f'xref\n0 {len(objects) + 1}\n'.encode('utf-8'))
    pdf.write(b'0000000000 65535 f \n')
    for offset in offsets:
        pdf.write(f'{offset:010d} 00000 n \n'.encode('utf-8'))
    pdf.write(f'trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF'.encode('utf-8'))
    pdf.seek(0)
    return pdf


def format_decimal(value):
    return f'{Decimal(value):,.2f}'


def format_quantity(value):
    return f'{Decimal(value):g}'


def build_purchase_order_email_body(purchase_order, pdf_url):
    items = list(purchase_order.items.select_related('product'))
    plain_item_lines = [
        f'{index}. {item.product.name} ({item.product.supplier_sku or item.product.sku}) - '
        f'{format_quantity(item.quantity)} x KES {format_decimal(item.unit_cost)} = KES {format_decimal(item.total)}'
        for index, item in enumerate(items, start=1)
    ]

    plain_body = (
        f'Dear {purchase_order.supplier.name},\n\n'
        f'Please process purchase order {purchase_order.po_number}.\n\n'
        'Items ordered:\n'
        f'{chr(10).join(plain_item_lines) if plain_item_lines else "No items captured on this purchase order."}\n\n'
        f'Subtotal: KES {format_decimal(purchase_order.subtotal)}\n'
        f'Tax: KES {format_decimal(purchase_order.tax_amount)}\n'
        f'Shipping: KES {format_decimal(purchase_order.shipping_cost)}\n'
        f'Discount: KES {format_decimal(purchase_order.discount_amount)}\n'
        f'Total: KES {format_decimal(purchase_order.total)}\n\n'
        f'PDF copy/download link: {pdf_url}\n\n'
        'Regards,\nPOS Admin'
    )

    item_rows = ''.join(
        '<tr>'
        f'<td style="padding:8px;border:1px solid #d0d7de;">{index}</td>'
        f'<td style="padding:8px;border:1px solid #d0d7de;">{escape(item.product.name)}</td>'
        f'<td style="padding:8px;border:1px solid #d0d7de;">{escape(item.product.supplier_sku or item.product.sku)}</td>'
        f'<td style="padding:8px;border:1px solid #d0d7de;text-align:right;">{format_quantity(item.quantity)}</td>'
        f'<td style="padding:8px;border:1px solid #d0d7de;text-align:right;">KES {format_decimal(item.unit_cost)}</td>'
        f'<td style="padding:8px;border:1px solid #d0d7de;text-align:right;">KES {format_decimal(item.total)}</td>'
        '</tr>'
        for index, item in enumerate(items, start=1)
    ) or (
        '<tr><td colspan="6" style="padding:8px;border:1px solid #d0d7de;">'
        'No items captured on this purchase order.'
        '</td></tr>'
    )

    html_body = f'''
    <p>Dear {escape(purchase_order.supplier.name)},</p>
    <p>Please process purchase order <strong>{escape(purchase_order.po_number)}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px;">
      <thead>
        <tr style="background:#f6f8fa;">
          <th style="padding:8px;border:1px solid #d0d7de;text-align:left;">#</th>
          <th style="padding:8px;border:1px solid #d0d7de;text-align:left;">Item</th>
          <th style="padding:8px;border:1px solid #d0d7de;text-align:left;">Supplier SKU</th>
          <th style="padding:8px;border:1px solid #d0d7de;text-align:right;">Qty</th>
          <th style="padding:8px;border:1px solid #d0d7de;text-align:right;">Unit Cost</th>
          <th style="padding:8px;border:1px solid #d0d7de;text-align:right;">Line Total</th>
        </tr>
      </thead>
      <tbody>{item_rows}</tbody>
    </table>
    <p>
      Subtotal: KES {format_decimal(purchase_order.subtotal)}<br>
      Tax: KES {format_decimal(purchase_order.tax_amount)}<br>
      Shipping: KES {format_decimal(purchase_order.shipping_cost)}<br>
      Discount: KES {format_decimal(purchase_order.discount_amount)}<br>
      <strong>Total: KES {format_decimal(purchase_order.total)}</strong>
    </p>
    <p>A PDF copy is attached. You can also download it here: <a href="{escape(pdf_url)}">{escape(pdf_url)}</a></p>
    <p>Regards,<br>POS Admin</p>
    '''

    return plain_body, html_body


class BatchViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Product Batches
    """
    
    queryset = Batch.objects.all()
    serializer_class = BatchSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['product', 'status', 'supplier', 'location']
    search_fields = ['batch_number', 'product__name', 'product__sku']
    ordering_fields = ['expiry_date', 'created_at', 'remaining_quantity']
    ordering = ['expiry_date']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter expiring soon
        expiring_days = self.request.query_params.get('expiring_days')
        if expiring_days:
            days = int(expiring_days)
            expiry_threshold = timezone.now().date() + timedelta(days=days)
            queryset = queryset.filter(
                expiry_date__lte=expiry_threshold,
                expiry_date__gte=timezone.now().date(),
                remaining_quantity__gt=0
            )
        
        # Filter expired
        expired = self.request.query_params.get('expired')
        if expired and expired.lower() == 'true':
            queryset = queryset.filter(expiry_date__lt=timezone.now().date())
        
        return queryset
    
    @action(detail=True, methods=['post'], url_path='consume')
    def consume_batch(self, request, pk=None):
        """
        POST /api/batches/{id}/consume/
        
        Consume stock from this batch
        Body: {"quantity": 10, "sale_id": 123, "reason": "Sold to customer"}
        """
        batch = self.get_object()
        quantity = Decimal(str(request.data.get('quantity', 0)))
        
        if quantity <= 0:
            return Response(
                {"error": "Quantity must be greater than zero"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if quantity > batch.remaining_quantity:
            return Response(
                {"error": f"Insufficient stock. Available: {batch.remaining_quantity}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Consume from batch
        old_quantity = batch.remaining_quantity
        batch.remaining_quantity -= quantity
        batch.save()
        
        # Record stock movement
        StockMovement.objects.create(
            product=batch.product,
            batch=batch,
            movement_type='sale',
            quantity=quantity,
            stock_before=old_quantity,
            stock_after=batch.remaining_quantity,
            unit_cost=batch.purchase_price,
            reference_id=request.data.get('sale_id'),
            reference_type='Sale',
            recorded_by=request.user,
            notes=request.data.get('reason', ''),
            location=batch.location
        )
        
        return Response({
            'message': f'Consumed {quantity} units from batch {batch.batch_number}',
            'remaining_quantity': batch.remaining_quantity
        })


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing stock movements (audit trail)
    """
    
    queryset = StockMovement.objects.all()
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['product', 'movement_type', 'reference_type', 'location']
    search_fields = ['movement_id', 'reference_id', 'product__name', 'product__sku']
    ordering_fields = ['movement_date', 'quantity']
    ordering = ['-movement_date']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Date range filter
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if start_date:
            queryset = queryset.filter(movement_date__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(movement_date__date__lte=end_date)
        
        return queryset
    
    @action(detail=False, methods=['get'], url_path='summary')
    def movement_summary(self, request):
        """
        GET /api/stock-movements/summary/?start_date=2024-01-01&end_date=2024-12-31
        
        Get summary of stock movements
        """
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        queryset = self.get_queryset()
        
        if start_date:
            queryset = queryset.filter(movement_date__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(movement_date__date__lte=end_date)
        
        summary = {
            'total_movements': queryset.count(),
            'total_inbound': queryset.filter(
                movement_type__in=['purchase', 'return', 'transfer']
            ).aggregate(total=Sum('quantity'))['total'] or Decimal('0'),
            'total_outbound': queryset.filter(
                movement_type__in=['sale', 'damage', 'expired', 'supplier_return']
            ).aggregate(total=Sum('quantity'))['total'] or Decimal('0'),
            'by_type': queryset.values('movement_type').annotate(
                total_quantity=Sum('quantity'),
                count=Count('id')
            )
        }
        
        return Response(summary)


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Purchase Orders
    """
    
    queryset = PurchaseOrder.objects.all()
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['supplier', 'status', 'payment_status']
    search_fields = ['po_number', 'supplier__name', 'tracking_number']
    ordering_fields = ['order_date', 'total', 'expected_delivery_date']
    ordering = ['-order_date']
    
    def get_queryset(self):
        user = self.request.user
        
        # Admins see all, others see only their own
        if user.role in ['super_admin', 'admin', 'manager']:
            return PurchaseOrder.objects.all()
        return PurchaseOrder.objects.filter(created_by=user)
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        if not has_inventory_write_access(request.user):
            return Response(
                {"error": "You do not have permission to create purchase orders"},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'], url_path='submit')
    def submit_order(self, request, pk=None):
        """Submit purchase order to supplier"""
        po = self.get_object()
        
        if po.status != 'draft':
            return Response(
                {"error": f"Cannot submit order with status: {po.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.submit()
        
        return Response({
            'message': 'Purchase order submitted successfully',
            'status': po.status
        })
    
    @action(detail=True, methods=['post'], url_path='approve')
    def approve_order(self, request, pk=None):
        """Approve purchase order (manager approval)"""
        po = self.get_object()
        
        # Check permission
        if not has_purchase_approval_access(request.user):
            return Response(
                {"error": "Only managers can approve purchase orders"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if po.status != 'submitted':
            return Response(
                {"error": f"Cannot approve order with status: {po.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.approve(request.user)
        
        return Response({
            'message': 'Purchase order approved',
            'status': po.status,
            'approved_by': po.approved_by.get_full_name(),
            'approved_at': po.approved_at
        })
    
    @action(detail=True, methods=['post'], url_path='receive')
    def receive_order(self, request, pk=None):
        """Receive items from purchase order"""
        if not has_inventory_write_access(request.user):
            return Response(
                {"error": "You do not have permission to receive purchase orders"},
                status=status.HTTP_403_FORBIDDEN
            )

        po = self.get_object()

        if po.status in ['draft', 'submitted']:
            po.status = 'confirmed'
            po.save(update_fields=['status', 'updated_at'])

        if po.status not in ['confirmed', 'shipped', 'receiving', 'received']:
            return Response(
                {"error": f"Cannot receive order with status: {po.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not isinstance(request.data, list) or len(request.data) == 0:
            return Response(
                {"error": "Add at least one item with a received quantity before posting the GRN."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = PurchaseOrderReceiveSerializer(data=request.data, many=True)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        pending_grn = po.goods_received_notes.filter(
            status='pending',
            items__is_verified=False
        ).distinct().order_by('-created_at').first()

        if pending_grn:
            return Response({
                'message': 'Pending goods received note found. Verify the GRN to post stock.',
                'status': po.status,
                'goods_received_note': GoodsReceivedNoteSerializer(pending_grn).data,
                'purchase_order': self.get_serializer(po).data
            })
        
        try:
            grn = po.receive_items(request.user, serializer.validated_data)
        except ValidationError as error:
            return Response({'error': str(error)}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'message': 'Goods received note created. Verify the GRN to post stock.',
            'status': po.status,
            'goods_received_note': GoodsReceivedNoteSerializer(grn).data,
            'purchase_order': self.get_serializer(po).data
        })
    
    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_order(self, request, pk=None):
        """Cancel purchase order"""
        if not has_purchase_approval_access(request.user):
            return Response(
                {"error": "Only managers can cancel purchase orders"},
                status=status.HTTP_403_FORBIDDEN
            )

        po = self.get_object()
        
        if po.status in ['completed', 'cancelled']:
            return Response(
                {"error": f"Cannot cancel order with status: {po.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        po.status = 'cancelled'
        po.save()
        
        return Response({
            'message': 'Purchase order cancelled',
            'status': po.status
        })

    @action(detail=True, methods=['get'], url_path='pdf')
    def download_pdf(self, request, pk=None):
        """Download purchase order PDF"""
        po = self.get_object()
        pdf_buffer = build_purchase_order_pdf(po)
        response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{po.po_number}.pdf"'
        return response

    @action(detail=True, methods=['post'], url_path='send-to-supplier')
    def send_to_supplier(self, request, pk=None):
        """Email purchase order PDF to supplier"""
        po = self.get_object()
        supplier_email = po.supplier.email

        if not supplier_email:
            return Response(
                {"error": f"Supplier {po.supplier.name} does not have an email address."},
                status=status.HTTP_400_BAD_REQUEST
            )

        pdf_url = request.build_absolute_uri(reverse('purchase-order-download-pdf', kwargs={'pk': po.pk}))
        pdf_buffer = build_purchase_order_pdf(po)
        subject = f'Purchase Order {po.po_number}'
        plain_body, html_body = build_purchase_order_email_body(po, pdf_url)

        email = EmailMultiAlternatives(
            subject=subject,
            body=plain_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[supplier_email],
        )
        email.attach_alternative(html_body, 'text/html')
        email.attach(f'{po.po_number}.pdf', pdf_buffer.getvalue(), 'application/pdf')
        email.send(fail_silently=False)

        if po.status == 'draft':
            po.submit()

        return Response({
            'message': f'Purchase order emailed to {supplier_email}',
            'email': supplier_email,
            'download_url': pdf_url,
            'status': po.status,
            'purchase_order': self.get_serializer(po).data
        })


class GoodsReceivedNoteViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Goods Received Notes.
    GRNs are created from purchase orders and only post stock when verified.
    """

    queryset = GoodsReceivedNote.objects.select_related(
        'purchase_order', 'supplier', 'created_by', 'verified_by'
    ).prefetch_related('items__product', 'items__purchase_order_item')
    serializer_class = GoodsReceivedNoteSerializer
    permission_classes = [IsAuthenticated]

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['purchase_order', 'supplier', 'status']
    search_fields = ['grn_number', 'purchase_order__po_number', 'supplier__name']
    ordering_fields = ['created_at', 'verified_at']
    ordering = ['-created_at']

    @action(detail=True, methods=['post'], url_path='verify')
    def verify_grn(self, request, pk=None):
        if not has_inventory_write_access(request.user):
            return Response(
                {"error": "You do not have permission to verify goods received notes"},
                status=status.HTTP_403_FORBIDDEN
            )

        grn = self.get_object()
        serializer = GoodsReceivedNoteVerifySerializer(data=request.data or {})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if grn.status == 'verified':
            return Response({
                'message': 'GRN already verified and posted to stock',
                'posted_count': 0,
                'goods_received_note': self.get_serializer(grn).data,
                'purchase_order': PurchaseOrderSerializer(grn.purchase_order).data
            })

        try:
            posted_count = grn.verify_items(
                request.user,
                serializer.validated_data.get('item_ids')
            )
        except ValidationError as error:
            return Response({'error': str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f'{posted_count} GRN item(s) verified and posted to stock',
            'posted_count': posted_count,
            'goods_received_note': self.get_serializer(grn).data,
            'purchase_order': PurchaseOrderSerializer(grn.purchase_order).data
        })


class StockCountViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Stock Counts (Physical Inventory)
    """
    
    queryset = StockCount.objects.all()
    serializer_class = StockCountSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'location']
    search_fields = ['count_number']
    ordering_fields = ['count_date', 'created_at']
    ordering = ['-count_date']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'], url_path='start')
    def start_count(self, request, pk=None):
        """Start the stock count process"""
        stock_count = self.get_object()
        
        if stock_count.status != 'draft':
            return Response(
                {"error": f"Cannot start count with status: {stock_count.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stock_count.start_count()
        
        return Response({
            'message': 'Stock count started',
            'total_products': stock_count.total_products,
            'status': stock_count.status
        })
    
    @action(detail=True, methods=['post'], url_path='update-item')
    def update_count_item(self, request, pk=None):
        """
        POST /api/stock-counts/{id}/update-item/
        
        Update counted quantity for a product
        Body: {"product_id": 1, "counted_quantity": 100, "notes": "Found in back room"}
        """
        stock_count = self.get_object()
        
        if stock_count.status != 'in_progress':
            return Response(
                {"error": f"Cannot update count with status: {stock_count.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        product_id = request.data.get('product_id')
        counted_quantity = Decimal(str(request.data.get('counted_quantity', 0)))
        
        try:
            item = StockCountItem.objects.get(stock_count=stock_count, product_id=product_id)
            item.counted_quantity = counted_quantity
            item.notes = request.data.get('notes', '')
            item.save()
            
            return Response({
                'message': 'Item updated',
                'product': item.product.name,
                'expected': item.expected_quantity,
                'counted': item.counted_quantity,
                'difference': item.difference
            })
        except StockCountItem.DoesNotExist:
            return Response(
                {"error": "Product not found in this stock count"},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'], url_path='complete')
    def complete_count(self, request, pk=None):
        """Complete stock count and apply adjustments"""
        stock_count = self.get_object()
        
        if stock_count.status != 'in_progress':
            return Response(
                {"error": f"Cannot complete count with status: {stock_count.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stock_count.complete_count(request.user)
        
        return Response({
            'message': 'Stock count completed',
            'total_discrepancies': stock_count.total_discrepancies,
            'total_adjustment_value': stock_count.total_adjustment_value
        })


class StoreTransferViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Store Transfers (Multi-store inventory)
    """
    
    queryset = StoreTransfer.objects.all()
    serializer_class = StoreTransferSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['from_store', 'to_store', 'status']
    search_fields = ['transfer_number']
    ordering_fields = ['transfer_date']
    ordering = ['-transfer_date']
    
    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)
    
    @action(detail=True, methods=['post'], url_path='approve')
    def approve_transfer(self, request, pk=None):
        """Approve store transfer"""
        transfer = self.get_object()
        
        if request.user.role not in ['super_admin', 'admin', 'manager']:
            return Response(
                {"error": "Only managers can approve transfers"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if transfer.status != 'pending':
            return Response(
                {"error": f"Cannot approve transfer with status: {transfer.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        transfer.approve_transfer(request.user)
        
        return Response({
            'message': 'Transfer approved',
            'status': transfer.status
        })
    
    @action(detail=True, methods=['post'], url_path='send')
    def send_transfer(self, request, pk=None):
        """Mark transfer as in transit"""
        transfer = self.get_object()
        
        if transfer.status != 'approved':
            return Response(
                {"error": f"Cannot send transfer with status: {transfer.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        transfer.send_transfer()
        
        # Update tracking info
        if request.data.get('tracking_number'):
            transfer.tracking_number = request.data['tracking_number']
            transfer.courier = request.data.get('courier', '')
            transfer.save()
        
        return Response({
            'message': 'Transfer is now in transit',
            'status': transfer.status,
            'tracking_number': transfer.tracking_number
        })
    
    @action(detail=True, methods=['post'], url_path='receive')
    def receive_transfer(self, request, pk=None):
        """Receive transfer at destination store"""
        transfer = self.get_object()
        
        if transfer.status != 'in_transit':
            return Response(
                {"error": f"Cannot receive transfer with status: {transfer.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        transfer.receive_transfer(request.user)
        
        return Response({
            'message': 'Transfer received successfully',
            'status': transfer.status,
            'received_date': transfer.received_date
        })


class StoreStockViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing store stock levels
    """
    
    queryset = StoreStock.objects.all()
    serializer_class = StoreStockSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['store', 'product__category']
    search_fields = ['product__name', 'product__sku', 'store']
    ordering_fields = ['quantity', 'product__name']
    ordering = ['store', 'product__name']
    
    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        """
        GET /api/store-stock/low-stock/?store=Main Store
        
        Get low stock items across all or specific store
        """
        store = request.query_params.get('store')
        
        queryset = self.get_queryset()
        if store:
            queryset = queryset.filter(store=store)
        
        low_stock = queryset.filter(
            quantity__lte=F('reorder_level'),
            reorder_level__gt=0
        )
        
        # Add product details
        results = []
        for item in low_stock:
            data = self.get_serializer(item).data
            data['reorder_quantity'] = float(item.product.reorder_quantity) if item.product.reorder_quantity else 0
            results.append(data)
        
        return Response({
            'count': low_stock.count(),
            'store': store if store else 'All Stores',
            'results': results
        })
    
    @action(detail=False, methods=['get'], url_path='summary')
    def store_summary(self, request):
        """
        GET /api/store-stock/summary/
        
        Get stock summary by store
        """
        summary = StoreStock.objects.values('store').annotate(
            total_quantity=Sum('quantity'),
            total_value=Sum(F('quantity') * F('product__cost_price')),
            total_retail_value=Sum(F('quantity') * F('product__retail_price')),
            product_count=Count('product', distinct=True),
            low_stock_count=Sum(
                Case(
                    When(quantity__lte=F('reorder_level'), then=1),
                    default=0,
                    output_field=IntegerField()
                )
            )
        )
        
        return Response(summary)


class InventoryAlertViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for inventory alerts
    """
    
    queryset = InventoryAlert.objects.all()
    serializer_class = InventoryAlertSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['alert_type', 'priority', 'is_resolved', 'store']
    search_fields = ['message', 'product__name']
    ordering_fields = ['created_at', 'priority']
    ordering = ['-priority', '-created_at']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Only show unresolved by default
        show_resolved = self.request.query_params.get('show_resolved')
        if not show_resolved or show_resolved.lower() != 'true':
            queryset = queryset.filter(is_resolved=False)
        
        return queryset
    
    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve_alert(self, request, pk=None):
        """
        POST /api/inventory-alerts/{id}/resolve/
        
        Mark alert as resolved
        Body: {"notes": "Reordered stock"}
        """
        alert = self.get_object()
        
        if alert.is_resolved:
            return Response(
                {"error": "Alert already resolved"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        alert.resolve(request.user, request.data.get('notes', ''))
        
        return Response({
            'message': 'Alert resolved',
            'resolved_by': alert.resolved_by.get_full_name(),
            'resolved_at': alert.resolved_at
        })
    
    @action(detail=False, methods=['post'], url_path='generate-alerts')
    def generate_alerts(self, request):
        """
        POST /api/inventory-alerts/generate-alerts/
        
        Manually trigger alert generation
        """
        from .alert_service import AlertService
        
        alerts_created = AlertService.check_all_alerts()
        
        return Response({
            'message': f'Generated {alerts_created} alerts',
            'alerts_created': alerts_created
        })


class ImportJobViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing import job history
    """
    
    queryset = ImportJob.objects.all()
    serializer_class = ImportJobSerializer
    permission_classes = [IsAuthenticated]
    
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['job_type', 'status']
    search_fields = ['job_id', 'original_filename']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        user = self.request.user
        
        # Admins see all, others see their own
        if user.role in ['super_admin', 'admin', 'manager']:
            return ImportJob.objects.all()
        return ImportJob.objects.filter(created_by=user)


class BulkInventoryViewSet(viewsets.GenericViewSet):
    """
    ViewSet for bulk inventory operations (Excel import/export)
    """
    
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['post'], url_path='update-stock')
    def bulk_update_stock(self, request):
        """
        POST /api/inventory/bulk/update-stock/
        
        Update stock for multiple products via JSON
        Body: {
            "updates": [
                {"sku": "ELEC-000001", "quantity": 100, "operation": "set"},
                {"barcode": "123456789", "quantity": 50, "operation": "add"}
            ]
        }
        """
        serializer = BulkStockUpdateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        updates = serializer.validated_data['updates']
        results = {'successful': [], 'failed': [], 'total': len(updates)}
        
        for update in updates:
            operation = update.get('operation', 'set')
            quantity = Decimal(str(update.get('quantity', 0)))
            
            if quantity <= 0:
                results['failed'].append({
                    'identifier': update,
                    'error': 'Quantity must be greater than zero'
                })
                continue
            
            # Find product
            product = None
            identifier = None
            
            if 'id' in update:
                product = Product.objects.filter(id=update['id'], is_active=True).first()
                identifier = f"ID:{update['id']}"
            elif 'sku' in update:
                product = Product.objects.filter(sku=update['sku'], is_active=True).first()
                identifier = f"SKU:{update['sku']}"
            elif 'barcode' in update:
                product = Product.objects.filter(barcode=update['barcode'], is_active=True).first()
                identifier = f"Barcode:{update['barcode']}"
            
            if not product:
                results['failed'].append({
                    'identifier': identifier or update,
                    'error': 'Product not found'
                })
                continue
            
            old_stock = product.stock_quantity
            
            if operation == 'set':
                new_stock = quantity
            elif operation == 'add':
                new_stock = old_stock + quantity
            elif operation == 'subtract':
                if old_stock < quantity:
                    results['failed'].append({
                        'identifier': identifier,
                        'error': f'Insufficient stock. Available: {old_stock}'
                    })
                    continue
                new_stock = old_stock - quantity
            else:
                results['failed'].append({
                    'identifier': identifier,
                    'error': f'Invalid operation: {operation}'
                })
                continue
            
            # Update stock
            product.stock_quantity = new_stock
            product.save()
            
            # Record movement
            StockMovement.objects.create(
                product=product,
                movement_type='adjustment',
                quantity=abs(quantity),
                stock_before=old_stock,
                stock_after=new_stock,
                unit_cost=product.cost_price,
                reference_id='bulk_update',
                recorded_by=request.user,
                notes=f"Bulk update: {operation} {quantity} units",
                reason=request.data.get('reason', '')
            )
            
            results['successful'].append({
                'sku': product.sku,
                'name': product.name,
                'operation': operation,
                'old_stock': float(old_stock),
                'new_stock': float(new_stock)
            })
        
        return Response({
            'message': f"Updated {len(results['successful'])} of {results['total']} products",
            'successful_count': len(results['successful']),
            'failed_count': len(results['failed']),
            'successful': results['successful'],
            'failed': results['failed']
        })
    
    @action(detail=False, methods=['post'], url_path='update-prices')
    def bulk_update_prices(self, request):
        """
        POST /api/inventory/bulk/update-prices/
        
        Bulk update product prices
        Body: {
            "update_type": "percentage",
            "adjustment": 10,
            "price_field": "retail_price",
            "category_id": 1
        }
        """
        serializer = BulkPriceUpdateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        update_type = data['update_type']
        adjustment = data['adjustment']
        price_field = data['price_field']
        
        # Get products to update
        queryset = Product.objects.filter(is_active=True)
        
        if data.get('category_id'):
            queryset = queryset.filter(category_id=data['category_id'])
        elif data.get('supplier_id'):
            queryset = queryset.filter(supplier_id=data['supplier_id'])
        elif data.get('product_ids'):
            queryset = queryset.filter(id__in=data['product_ids'])
        
        original_count = queryset.count()
        updated_count = 0
        updated_products = []
        
        for product in queryset:
            current_price = getattr(product, price_field)
            
            if current_price is None:
                continue
            
            if update_type == 'percentage':
                new_price = current_price * (1 + Decimal(str(adjustment)) / 100)
            else:
                new_price = current_price + Decimal(str(adjustment))
            
            new_price = max(Decimal('0'), new_price)
            
            setattr(product, price_field, new_price)
            product.save(update_fields=[price_field, 'updated_at'])
            updated_count += 1
            
            updated_products.append({
                'id': product.id,
                'name': product.name,
                'sku': product.sku,
                'old_price': float(current_price),
                'new_price': float(new_price)
            })
        
        return Response({
            'message': f'Updated {updated_count} of {original_count} products',
            'updated_count': updated_count,
            'price_field': price_field,
            'update_type': update_type,
            'adjustment': adjustment,
            'updated_products': updated_products[:50]
        })
    
    @action(detail=False, methods=['get'], url_path='export-stock')
    def export_stock(self, request):
        """
        GET /api/inventory/bulk/export-stock/
        
        Export current stock levels to Excel
        """
        products = Product.objects.filter(is_active=True)
        
        data = []
        for product in products:
            data.append({
                'SKU': product.sku,
                'Product Name': product.name,
                'Category': product.category.name if product.category else '',
                'Supplier': product.supplier.name if product.supplier else '',
                'Current Stock': float(product.stock_quantity),
                'Reorder Level': float(product.reorder_level),
                'Reorder Quantity': float(product.reorder_quantity),
                'Unit': product.unit,
                'Cost Price': float(product.cost_price),
                'Retail Price': float(product.retail_price),
                'Stock Value': float(product.stock_value),
                'Status': 'Active' if product.is_active else 'Inactive',
                'Last Updated': product.updated_at.strftime('%Y-%m-%d %H:%M:%S') if product.updated_at else ''
            })
        
        df = pd.DataFrame(data)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Current Stock', index=False)
            
            # Add summary sheet
            summary = {
                'Metric': ['Total Products', 'Total Stock Value', 'Low Stock Items', 'Out of Stock'],
                'Value': [
                    len(data),
                    f"KES {sum(p['Stock Value'] for p in data):,.2f}",
                    sum(1 for p in data if p['Current Stock'] <= p['Reorder Level'] and p['Reorder Level'] > 0),
                    sum(1 for p in data if p['Current Stock'] == 0)
                ]
            }
            summary_df = pd.DataFrame(summary)
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
        
        output.seek(0)
        
        response = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="stock_export.xlsx"'
        
        return response
