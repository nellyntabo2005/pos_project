# Generated for GRN verification inventory flow.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0004_supplier_full_profile_fields'),
        ('products', '0003_product_external_image_url'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='GoodsReceivedNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('grn_number', models.CharField(db_index=True, editable=False, max_length=50, unique=True)),
                ('status', models.CharField(choices=[('pending', 'Pending Verification'), ('verified', 'Verified and Posted'), ('cancelled', 'Cancelled')], db_index=True, default='pending', max_length=20)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='goods_received_notes', to=settings.AUTH_USER_MODEL)),
                ('purchase_order', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='goods_received_notes', to='inventory.purchaseorder')),
                ('supplier', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='goods_received_notes', to='inventory.supplier')),
                ('verified_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='verified_goods_received_notes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='GoodsReceivedNoteItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0.01'))])),
                ('batch_number', models.CharField(blank=True, max_length=50)),
                ('manufacturing_date', models.DateField(blank=True, null=True)),
                ('expiry_date', models.DateField(blank=True, null=True)),
                ('location', models.CharField(blank=True, default='Main Store', max_length=100)),
                ('notes', models.TextField(blank=True)),
                ('is_verified', models.BooleanField(default=False)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('goods_received_note', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='inventory.goodsreceivednote')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='products.product')),
                ('purchase_order_item', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='grn_items', to='inventory.purchaseorderitem')),
                ('verified_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='verified_goods_received_note_items', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['id'],
            },
        ),
    ]
