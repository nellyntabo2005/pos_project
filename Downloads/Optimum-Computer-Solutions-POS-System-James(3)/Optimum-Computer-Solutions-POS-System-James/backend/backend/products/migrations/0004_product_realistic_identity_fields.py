from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0003_product_external_image_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='brand',
            field=models.CharField(blank=True, db_index=True, max_length=120),
        ),
        migrations.AddField(
            model_name='product',
            name='generic_name',
            field=models.CharField(blank=True, db_index=True, max_length=120),
        ),
        migrations.AddField(
            model_name='product',
            name='model_number',
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name='product',
            name='pack_size',
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name='product',
            name='variant',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(fields=['generic_name'], name='products_pr_generic_01ff46_idx'),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(fields=['brand'], name='products_pr_brand_568957_idx'),
        ),
    ]
