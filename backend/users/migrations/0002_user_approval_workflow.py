from datetime import timedelta

from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


def set_existing_approval_deadlines(apps, schema_editor):
    User = apps.get_model('users', 'User')
    now = timezone.now()
    User.objects.filter(approval_deadline_at__isnull=True).update(
        approval_requested_at=now,
        approval_deadline_at=now + timedelta(hours=24),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='approval_status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending Approval'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                    ('expired', 'Expired'),
                ],
                db_index=True,
                default='approved',
                help_text='Controls whether a registered account may log in',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='approval_requested_at',
            field=models.DateTimeField(
                default=timezone.now,
                help_text='When the user requested account approval',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='approval_deadline_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Approval must happen before this timestamp',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='approved_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='approved_users',
                to='users.user',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='rejected_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='rejected_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='rejected_users',
                to='users.user',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='approval_notes',
            field=models.TextField(blank=True),
        ),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['approval_status'], name='users_approva_c75ee7_idx'),
        ),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['approval_deadline_at'], name='users_approva_f80f65_idx'),
        ),
        migrations.RunPython(set_existing_approval_deadlines, migrations.RunPython.noop),
    ]
