from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import F, Q

import pandas as pd
import io
import uuid
from decimal import Decimal
from django.http import HttpResponse
from django.utils.text import slugify

from .models import Category, Product, ProductImage
from inventory.models import Supplier

from .serializers import (
    CategorySerializer,
    SupplierSerializer,
    ProductSerializer,
    ProductImageSerializer,
)


PRODUCT_IMPORT_COLUMNS = [
    'sku',
    'name',
    'generic_name',
    'brand',
    'variant',
    'pack_size',
    'model_number',
    'category',
    'supplier',
    'cost_price',
    'retail_price',
    'wholesale_price',
    'stock_quantity',
    'reorder_level',
    'unit',
    'tax_rate',
    'image_url',
]


def read_cell(row, *names, default=''):
    for name in names:
        if name in row and pd.notna(row.get(name)):
            return row.get(name)
    return default


def clean_text(value, default=''):
    if value is None or pd.isna(value):
        return default
    return str(value).strip()


def clean_decimal(value, default='0'):
    value = default if value is None or pd.isna(value) or value == '' else value
    return Decimal(str(value))


def clean_int(value, default=0):
    value = default if value is None or pd.isna(value) or value == '' else value
    return int(float(value))


def get_or_create_category(name):
    name = clean_text(name)
    if not name:
        return None

    base_slug = slugify(name) or 'category'
    slug = base_slug
    counter = 1
    while Category.objects.filter(slug=slug).exclude(name=name).exists():
        counter += 1
        slug = f'{base_slug}-{counter}'

    category, _ = Category.objects.get_or_create(name=name, defaults={'slug': slug})
    return category


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
            stock_quantity__lte=F('reorder_level'),
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

    @action(detail=False, methods=['get'], url_path='download-template')
    def download_template(self, request):
        """Return an Excel template for product bulk import."""
        df = pd.DataFrame([{
            'sku': 'ITEM-001',
            'name': 'Brookside Milk 500ml',
            'generic_name': 'Milk',
            'brand': 'Brookside',
            'variant': 'Whole milk',
            'pack_size': '500ml',
            'model_number': '',
            'category': 'Beverages',
            'supplier': '',
            'cost_price': 50,
            'retail_price': 75,
            'wholesale_price': 65,
            'stock_quantity': 20,
            'reorder_level': 5,
            'unit': 'piece',
            'tax_rate': 16,
            'image_url': '',
        }], columns=PRODUCT_IMPORT_COLUMNS)

        output = io.BytesIO()
        df.to_excel(output, index=False, sheet_name='Products')
        output.seek(0)

        response = HttpResponse(
            output,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="product_template.xlsx"'
        return response

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """Import products from Excel (xlsx/xls) or CSV"""
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'File required'}, status=400)

        try:
            if file.name.lower().endswith('.csv'):
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file)

            created = 0
            updated = 0
            errors = []

            df.columns = [str(column).strip().lower().replace(' ', '_') for column in df.columns]

            for idx, row in df.iterrows():
                try:
                    name = clean_text(read_cell(row, 'name', 'product_name', 'item_name'))
                    generic_name = clean_text(read_cell(row, 'generic_name', 'parent_product', 'base_product'))
                    brand = clean_text(read_cell(row, 'brand', 'manufacturer'))
                    variant = clean_text(read_cell(row, 'variant', 'variation', 'flavour', 'flavor'))
                    pack_size = clean_text(read_cell(row, 'pack_size', 'size', 'package_size'))
                    model_number = clean_text(read_cell(row, 'model_number', 'model', 'part_number'))
                    if not name:
                        name = ' '.join(part for part in [brand, generic_name, variant, pack_size] if part)
                    if not name:
                        errors.append({'row': idx + 2, 'message': 'Name or brand/generic product details required'})
                        continue

                    category = get_or_create_category(read_cell(row, 'category', 'category_name'))

                    sup_name = clean_text(read_cell(row, 'supplier', 'supplier_name'))
                    supplier = None
                    if sup_name:
                        supplier, _ = Supplier.objects.get_or_create(
                            name=sup_name,
                            defaults={'phone': '0000000000'},
                        )

                    sku_or_barcode = clean_text(read_cell(row, 'sku', 'barcode'))
                    retail_price = clean_decimal(read_cell(row, 'retail_price', 'price'), '0')
                    cost_price = clean_decimal(read_cell(row, 'cost_price', 'buying_price'), '0')
                    wholesale_price_value = read_cell(row, 'wholesale_price', default=None)
                    wholesale_price = None if wholesale_price_value in [None, ''] or pd.isna(wholesale_price_value) else clean_decimal(wholesale_price_value)

                    product = None
                    if sku_or_barcode:
                        product = Product.objects.filter(
                            Q(sku=sku_or_barcode) | Q(barcode=sku_or_barcode)
                        ).first()
                    if product is None and brand and generic_name:
                        product = Product.objects.filter(
                            brand__iexact=brand,
                            generic_name__iexact=generic_name,
                            variant__iexact=variant,
                            pack_size__iexact=pack_size,
                        ).first()
                    if product is None:
                        product = Product.objects.filter(name=name).first()

                    is_new = product is None
                    if is_new:
                        product = Product()

                    product.name = name
                    product.generic_name = generic_name
                    product.brand = brand
                    product.variant = variant
                    product.pack_size = pack_size
                    product.model_number = model_number
                    if sku_or_barcode and (is_new or product.barcode != sku_or_barcode):
                        product.barcode = sku_or_barcode
                    elif is_new and not product.barcode:
                        product.barcode = f'BULK-{uuid.uuid4().hex[:10].upper()}'
                    product.category = category
                    product.supplier = supplier
                    product.cost_price = cost_price
                    product.retail_price = retail_price
                    product.wholesale_price = wholesale_price
                    product.stock_quantity = clean_decimal(read_cell(row, 'stock_quantity', 'stock', 'quantity'), '0')
                    product.reorder_level = clean_decimal(read_cell(row, 'reorder_level', 'minimum_stock'), '0')
                    product.minimum_stock = product.reorder_level
                    product.unit = clean_text(read_cell(row, 'unit', 'uom'), 'piece').lower()
                    product.tax_rate = clean_int(read_cell(row, 'tax_rate', 'tax'), 16)
                    image_url = clean_text(read_cell(row, 'image_url', 'external_image_url'))
                    if image_url:
                        product.external_image_url = image_url
                    product.is_active = True
                    product.save()

                    if is_new:
                        created += 1
                    else:
                        updated += 1

                except Exception as e:
                    errors.append({'row': idx + 2, 'message': str(e)})

            return Response({'created': created, 'updated': updated, 'errors': errors[:20]})

        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """Export products to Excel"""
        products = Product.objects.filter(is_active=True).select_related('category', 'supplier')
        data = []
        for p in products:
            data.append({
                'sku': p.barcode or p.sku,
                'system_sku': p.sku,
                'name': p.name,
                'generic_name': p.generic_name,
                'brand': p.brand,
                'variant': p.variant,
                'pack_size': p.pack_size,
                'model_number': p.model_number,
                'category': p.category.name if p.category else '',
                'supplier': p.supplier.name if p.supplier else '',
                'cost_price': float(p.cost_price),
                'retail_price': float(p.retail_price),
                'wholesale_price': float(p.wholesale_price) if p.wholesale_price is not None else '',
                'stock_quantity': float(p.stock_quantity),
                'reorder_level': float(p.reorder_level),
                'unit': p.unit,
                'tax_rate': p.tax_rate,
                'image_url': p.external_image_url or '',
                'active': p.is_active,
            })

        df = pd.DataFrame(data)
        output = io.BytesIO()
        df.to_excel(output, index=False)
        output.seek(0)

        response = HttpResponse(
            output,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
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

