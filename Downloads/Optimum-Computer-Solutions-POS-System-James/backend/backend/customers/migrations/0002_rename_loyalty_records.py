import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='customer',
            old_name='loyalty_records',
            new_name='loyalty_points',
        ),
        migrations.AlterField(
            model_name='loyalty_points',
            name='customer',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='loyalty_point_records',
                to='customers.customer',
            ),
        ),
    ]
