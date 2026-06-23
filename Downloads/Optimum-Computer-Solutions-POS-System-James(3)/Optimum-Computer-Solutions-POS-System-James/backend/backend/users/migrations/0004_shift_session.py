import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_user_must_change_password'),
    ]

    operations = [
        migrations.CreateModel(
            name='ShiftSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('expected_end_at', models.DateTimeField(blank=True)),
                ('ended_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='shift_sessions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_shift_sessions',
                'ordering': ['-started_at'],
            },
        ),
        migrations.AddIndex(
            model_name='shiftsession',
            index=models.Index(fields=['user', 'started_at'], name='user_shift__user_id_7fe822_idx'),
        ),
        migrations.AddIndex(
            model_name='shiftsession',
            index=models.Index(fields=['ended_at'], name='user_shift__ended_a_80f4e3_idx'),
        ),
        migrations.AddIndex(
            model_name='shiftsession',
            index=models.Index(fields=['expected_end_at'], name='user_shift__expecte_480ed4_idx'),
        ),
    ]
