# products/serializers.py
import base64
import uuid

from django.core.files.base import ContentFile
from django.utils.text import slugify
from rest_framework import serializers
from decimal import Decimal
from .models import Category, Product, ProductImage
from inventory.models import InventoryAlert, StockMovement, StoreStock, Supplier
from notifications.utils import create_role_notifications



class CategorySerializer(serializers.ModelSerializer):
    full_path = serializers.SerializerMethodField()
    level = serializers.IntegerField(read_only=True)
    children_count = serializers.SerializerMethodField()
    parent_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Category
        fields = [
            'id', 'name', 'slug', 'description', 'parent', 'parent_name',
            'icon', 'color', 'is_active', 'full_path', 'level',
            'children_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']
    
    def get_full_path(self, obj):
        return obj.get_full_path() if hasattr(obj, 'get_full_path') else obj.name
    
    def get_children_count(self, obj):
        return obj.children.filter(is_active=True).count() if hasattr(obj, 'children') else 0
    
    def get_parent_name(self, obj):
        return obj.parent.name if obj.parent else None


class SupplierSerializer(serializers.ModelSerializer):
    address = serializers.CharField(source='address_line1', required=False, allow_blank=True)

    class Meta:
        model = Supplier
        fields = [
            'id', 'name', 'code', 'contact_person', 'designation', 'phone',
            'alternate_phone', 'fax_number', 'email', 'website', 'supplier_type',
            'supplier_category', 'registration_number', 'address', 'address_line1',
            'address_line2', 'city', 'county', 'postal_code', 'country',
            'tax_number', 'bank_name', 'bank_account', 'currency', 'credit_limit',
            'preferred_payment_method', 'mpesa_paybill', 'mpesa_till',
            'default_warehouse', 'minimum_order_amount', 'lead_time_days',
            'uploaded_documents', 'is_active', 'is_preferred', 'payment_terms', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_website(self, value):
        if value and not value.startswith(('http://', 'https://')):
            return f'https://{value}'
        return value


class ProductImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'image_url', 'caption', 'is_primary', 'order']
        read_only_fields = ['id']
    
    def get_image_url(self, obj):
        if obj.image:
            return obj.image.url
        return None


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    category_name_input = serializers.CharField(write_only=True, required=False, allow_blank=True)
    supplier_name = serializers.SerializerMethodField()
    images = ProductImageSerializer(many=True, read_only=True)
    image_url = serializers.SerializerMethodField()
    image_data = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    profit_margin = serializers.DecimalField(read_only=True, max_digits=10, decimal_places=2)
    is_low_stock = serializers.BooleanField(read_only=True)
    stock_value = serializers.DecimalField(read_only=True, max_digits=12, decimal_places=2)
    
    class Meta:
        model = Product
        fields = [
            'id', 'uuid', 'sku', 'barcode', 'name', 'description',
            'generic_name', 'brand', 'variant', 'pack_size', 'model_number',
            'category', 'category_name', 'supplier', 'supplier_name', 'supplier_sku',
            'cost_price', 'retail_price', 'wholesale_price', 'carton_price', 'carton_quantity',
            'stock_quantity', 'reorder_level', 'reorder_quantity', 'minimum_stock', 'maximum_stock',
            'unit', 'tax_rate', 'weight', 'length', 'width', 'height',
            'is_active', 'is_featured', 'is_digital', 'main_image',
            'external_image_url', 'image_url', 'image_data', 'category_name_input',
            'profit_margin', 'is_low_stock', 'stock_value',
            'notes', 'created_at', 'updated_at', 'last_purchased_at',
            'images'
        ]
        read_only_fields = [
            'id', 'uuid', 'sku', 'created_at', 'updated_at',
            'profit_margin', 'is_low_stock', 'stock_value'
        ]
    
    def get_category_name(self, obj):
        return obj.category.name if obj.category else None

    def get_image_url(self, obj):
        if obj.external_image_url:
            return obj.external_image_url
        if obj.main_image:
            request = self.context.get('request')
            url = obj.main_image.url
            return request.build_absolute_uri(url) if request else url
        return None
    
    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None
    
    def validate_retail_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Retail price must be greater than zero")
        return value

    def _apply_category_name(self, validated_data):
        category_name = validated_data.pop('category_name_input', '').strip()
        if category_name and not validated_data.get('category'):
            base_slug = slugify(category_name) or 'category'
            slug = base_slug
            counter = 1
            while Category.objects.filter(slug=slug).exclude(name=category_name).exists():
                counter += 1
                slug = f"{base_slug}-{counter}"
            category, _ = Category.objects.get_or_create(
                name=category_name,
                defaults={'slug': slug}
            )
            validated_data['category'] = category

    def _apply_image_data(self, instance, image_data):
        if not image_data:
            return

        if image_data.startswith('http://') or image_data.startswith('https://'):
            instance.external_image_url = image_data
            instance.save(update_fields=['external_image_url'])
            return

        if not image_data.startswith('data:image/'):
            return

        header, encoded = image_data.split(',', 1)
        extension = header.split(';', 1)[0].split('/', 1)[1] or 'png'
        image_file = ContentFile(
            base64.b64decode(encoded),
            name=f"{slugify(instance.name) or 'product'}-{uuid.uuid4().hex[:8]}.{extension}"
        )
        instance.external_image_url = ''
        instance.main_image.save(image_file.name, image_file, save=True)

    def _sync_inventory_records(self, instance, previous_stock=None):
        store_stock, _ = StoreStock.objects.update_or_create(
            store='Main Warehouse',
            product=instance,
            defaults={
                'quantity': instance.stock_quantity,
                'reorder_level': instance.reorder_level,
            },
        )

        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return

        current_stock = Decimal(str(instance.stock_quantity or 0))
        previous_stock = Decimal(str(previous_stock if previous_stock is not None else 0))
        stock_changed = current_stock != previous_stock

        if stock_changed:
            movement_type = 'adjustment' if previous_stock else 'purchase'
            reason = 'Product stock updated from frontend'
            if previous_stock == 0 and current_stock > 0:
                reason = 'Opening stock from frontend'

            StockMovement.objects.create(
                product=instance,
                movement_type=movement_type,
                quantity=abs(current_stock - previous_stock),
                stock_before=previous_stock,
                stock_after=current_stock,
                unit_cost=instance.cost_price,
                reference_id=f'product-{instance.pk}',
                reference_type='Product',
                reason=reason,
                recorded_by=user,
                location=store_stock.store,
            )

            if previous_stock == 0 and current_stock > 0:
                create_role_notifications(
                    title='Inventory item added',
                    message=f'{instance.name} was added with opening stock of {current_stock}.',
                    priority='medium',
                    related_product=instance,
                    metadata={'event': 'opening_stock'},
                )

        if instance.reorder_level > 0 and instance.stock_quantity <= instance.reorder_level:
            alert_type = 'out_of_stock' if instance.stock_quantity == 0 else 'low_stock'
            priority = 'critical' if instance.stock_quantity == 0 else 'high'
            InventoryAlert.objects.get_or_create(
                alert_type=alert_type,
                product=instance,
                store=store_stock.store,
                is_resolved=False,
                defaults={
                    'priority': priority,
                    'message': f'{instance.name} stock is {instance.stock_quantity}; reorder level is {instance.reorder_level}.',
                    'suggested_action': 'Create a purchase order or adjust stock.',
                },
            )
            create_role_notifications(
                title='Out of stock warning' if alert_type == 'out_of_stock' else 'Low stock warning',
                message=f'{instance.name} has {instance.stock_quantity} remaining. Reorder level is {instance.reorder_level}.',
                priority=priority,
                related_product=instance,
                metadata={'event': alert_type, 'store': store_stock.store},
            )
        else:
            InventoryAlert.objects.filter(
                product=instance,
                store=store_stock.store,
                alert_type__in=['low_stock', 'out_of_stock'],
                is_resolved=False,
            ).update(is_resolved=True)

    def create(self, validated_data):
        image_data = validated_data.pop('image_data', '')
        self._apply_category_name(validated_data)
        instance = super().create(validated_data)
        self._apply_image_data(instance, image_data)
        self._sync_inventory_records(instance, previous_stock=0)
        return instance

    def update(self, instance, validated_data):
        image_data = validated_data.pop('image_data', '')
        previous_stock = instance.stock_quantity
        self._apply_category_name(validated_data)
        instance = super().update(instance, validated_data)
        self._apply_image_data(instance, image_data)
        self._sync_inventory_records(instance, previous_stock=previous_stock)
        return instance


class ProductImportSerializer(serializers.Serializer):
    file = serializers.FileField()
    
    def validate_file(self, value):
        if not value.name.endswith(('.xlsx', '.xls', '.csv')):
            raise serializers.ValidationError("File must be Excel or CSV format")
        if value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("File size must be less than 10MB")
        return value


class BulkPriceUpdateSerializer(serializers.Serializer):
    product_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False
    )
    category_id = serializers.IntegerField(required=False)
    supplier_id = serializers.IntegerField(required=False)
    update_type = serializers.ChoiceField(choices=['percentage', 'fixed'])
    adjustment = serializers.DecimalField(max_digits=10, decimal_places=2)
    price_field = serializers.ChoiceField(
        choices=['retail_price', 'wholesale_price', 'cost_price'],
        default='retail_price'
    )
    
    def validate(self, data):
        if not data.get('product_ids') and not data.get('category_id') and not data.get('supplier_id'):
            raise serializers.ValidationError(
                "Either product_ids, category_id, or supplier_id must be provided"
            )
        return data
