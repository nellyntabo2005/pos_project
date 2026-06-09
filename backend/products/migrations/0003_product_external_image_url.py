from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0002_alter_product_supplier_alter_category_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='external_image_url',
            field=models.URLField(blank=True),
        ),
    ]
