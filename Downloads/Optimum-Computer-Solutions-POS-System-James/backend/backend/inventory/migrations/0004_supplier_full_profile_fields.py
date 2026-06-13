# Generated for expanded supplier profile fields.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0003_alter_batch_purchase_price_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='supplier',
            name='alternate_phone',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='supplier',
            name='country',
            field=models.CharField(blank=True, default='Kenya', max_length=100),
        ),
        migrations.AddField(
            model_name='supplier',
            name='credit_limit',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=15),
        ),
        migrations.AddField(
            model_name='supplier',
            name='currency',
            field=models.CharField(blank=True, default='KES', max_length=10),
        ),
        migrations.AddField(
            model_name='supplier',
            name='default_warehouse',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='supplier',
            name='designation',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='supplier',
            name='fax_number',
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name='supplier',
            name='lead_time_days',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='supplier',
            name='minimum_order_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=15),
        ),
        migrations.AddField(
            model_name='supplier',
            name='mpesa_paybill',
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name='supplier',
            name='mpesa_till',
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name='supplier',
            name='preferred_payment_method',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='supplier',
            name='registration_number',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='supplier',
            name='supplier_category',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='supplier',
            name='supplier_type',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='supplier',
            name='uploaded_documents',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
