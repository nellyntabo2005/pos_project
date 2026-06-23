# Generated for PO receiving pending verification status.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0005_goods_received_notes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='purchaseorder',
            name='status',
            field=models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('confirmed', 'Confirmed'), ('shipped', 'Shipped'), ('receiving', 'Receiving Pending Verification'), ('received', 'Partially Received'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('returned', 'Returned')], db_index=True, default='draft', max_length=20),
        ),
    ]
