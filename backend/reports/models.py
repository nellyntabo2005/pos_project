
# reports/models.py
from django.db import models
from django.conf import settings
from users.models import User


class SavedReport(models.Model):
    REPORT_TYPES = [
        ('sales', 'Sales Report'),
        ('inventory', 'Inventory Report'),
        ('products', 'Products Report'),
        ('customers', 'Customers Report'),
    ]
    
    name = models.CharField(max_length=100)
    report_type = models.CharField(max_length=30, choices=REPORT_TYPES)
    description = models.TextField(blank=True)
    config = models.JSONField(default=dict)
    is_public = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='saved_reports')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.name} - {self.report_type}"


class ReportExport(models.Model):
    export_id = models.CharField(max_length=50, unique=True)
    report_type = models.CharField(max_length=30)
    parameters = models.JSONField(default=dict)
    file_format = models.CharField(max_length=10)
    status = models.CharField(max_length=20, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.export_id} - {self.status}"

from django.db import models

# Create your models here.

