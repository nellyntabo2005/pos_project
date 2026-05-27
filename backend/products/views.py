# products/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Sum, F
from django.http import HttpResponse
from decimal import Decimal
import pandas as pd
import io

from .models import Category, Supplier, Product, ProductImage
from .serializers import (
    CategorySerializer, SupplierSerializer, ProductSerializer,
    ProductImageSerializer
)


class CategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for Categories"""
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name']


class SupplierViewSet(viewsets.ModelViewSet):
    """ViewSet for Suppliers"""
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'phone']


class ProductViewSet(viewsets.ModelViewSet):
    """ViewSet for Products"""
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'supplier', 'is_active', 'unit']
    search_fields = ['name', 'sku', 'barcode']
    ordering_fields = ['name', 'retail_price', 'stock_quantity']
    ordering = ['name']

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        """Get low stock products"""
        low_stock = Product.objects.filter(
            is_active=True,
            stock_quantity__lte=F('reorder_level')
        ).exclude(reorder_level=0)
        serializer = self.get_serializer(low_stock, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='by-barcode')
    def by_barcode(self, request):
        """Get product by barcode (for POS)"""
        barcode = request.query_params.get('barcode')
        if not barcode:
            return Response({'error': 'barcode required'}, status=400)
        try:
            product = Product.objects.get(barcode=barcode, is_active=True)
            serializer = self.get_serializer(product)
            return Response(serializer.data)
        except Product.DoesNotExist:
            return Response({'error': 'Product not found'}, status=404)

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """Import products from Excel"""
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'File required'}, status=400)

        try:
            if file.name.endswith('.csv'):
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file)

            created = 0
            updated = 0
            errors = []

            for idx, row in df.iterrows():
                try:
                    name = str(row.get('name', '')).strip()
                    if not name:
                        errors.append(f"Row {idx+2}: Name required")
                        continue

                    # Get or create category
                    cat_name = str(row.get('category', '')).strip() if pd.notna(row.get('category')) else None
                    category = None
                    if cat_name:
                        category, _ = Category.objects.get_or_create(
                            name=cat_name,
                            defaults={'slug': cat_name.lower().replace(' ', '-')}
                        )

                    # Get or create supplier
                    sup_name = str(row.get('supplier', '')).strip() if pd.notna(row.get('supplier')) else None
                    supplier = None
                    if sup_name:
                        supplier, _ = Supplier.objects.get_or_create(
                            name=sup_name,
                            defaults={'phone': '0000000000'}
                        )

                    retail_price = Decimal(str(row.get('retail_price', 0)))
                    cost_price = Decimal(str(row.get('cost_price', 0)))

                    product, is_new = Product.objects.update_or_create(
                        sku=row.get('sku', '') if pd.notna(row.get('sku')) else None,
                        defaults={
                            'name': name,
                            'barcode': str(row.get('barcode', '')) if pd.notna(row.get('barcode')) else '',
                            'category': category,
                            'supplier': supplier,
                            'cost_price': cost_price,
                            'retail_price': retail_price,
                            'stock_quantity': Decimal(str(row.get('stock_quantity', 0))),
                            'reorder_level': Decimal(str(row.get('reorder_level', 0))),
                            'unit': str(row.get('unit', 'piece')).lower(),
                            'tax_rate': int(row.get('tax_rate', 16)),
                            'is_active': True,
                        }
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
                except Exception as e:
                    errors.append(f"Row {idx+2}: {str(e)}")

            return Response({
                'created': created,
                'updated': updated,
                'errors': errors[:20]
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """Export products to Excel"""
        products = Product.objects.filter(is_active=True)
        data = []
        for p in products:
            data.append({
                'SKU': p.sku,
                'Name': p.name,
                'Category': p.category.name if p.category else '',
                'Retail Price': float(p.retail_price),
                'Stock': float(p.stock_quantity),
                'Unit': p.unit,
            })
        df = pd.DataFrame(data)
        output = io.BytesIO()
        df.to_excel(output, index=False)
        output.seek(0)
        response = HttpResponse(output, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = 'attachment; filename="products.xlsx"'
        return response


class ProductImageViewSet(viewsets.ModelViewSet):
    """ViewSet for Product Images"""
    queryset = ProductImage.objects.all()
    serializer_class = ProductImageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        product_id = self.request.query_params.get('product_id')
        if product_id:
            return ProductImage.objects.filter(product_id=product_id)
        return ProductImage.objects.all()