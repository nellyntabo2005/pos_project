# reports/serializers.py
from rest_framework import serializers
from .models import SavedReport, ReportExport


class SavedReportSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = SavedReport
        fields = [
            'id', 'name', 'report_type', 'description', 'config',
            'default_format', 'is_scheduled', 'schedule_frequency',
            'schedule_time', 'recipient_emails', 'created_by',
            'created_by_name', 'is_public', 'created_at', 'updated_at',
            'last_run_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at', 'last_run_at']
    
    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username


class ReportExportSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ReportExport
        fields = [
            'id', 'export_id', 'report_type', 'parameters', 'file_format',
            'file_path', 'file_size', 'status', 'error_message',
            'rows_generated', 'processing_time_ms', 'requested_by',
            'requested_by_name', 'created_at', 'completed_at'
        ]
        read_only_fields = ['id', 'export_id', 'created_at', 'completed_at']
    
    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.username


class ReportRequestSerializer(serializers.Serializer):
    """Serializer for report generation requests"""
    
    report_type = serializers.ChoiceField(choices=[
        'sales', 'top_products', 'inventory', 'customers', 
        'cashier_performance', 'tax'
    ])
    
    period = serializers.ChoiceField(choices=[
        'today', 'yesterday', 'this_week', 'last_week', 
        'this_month', 'last_month', 'this_year', 'custom'
    ], required=False, default='this_month')
    
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    
    format = serializers.ChoiceField(choices=['json', 'pdf', 'excel', 'csv'], default='json')
    
    group_by = serializers.ChoiceField(choices=['day', 'week', 'month', 'category', 'product'], required=False)
    
    limit = serializers.IntegerField(min_value=1, max_value=500, required=False, default=100)
    
    def validate(self, data):
        if data.get('period') == 'custom':
            if not data.get('start_date') or not data.get('end_date'):
                raise serializers.ValidationError(
                    "start_date and end_date are required when period is 'custom'"
                )
            if data['start_date'] > data['end_date']:
                raise serializers.ValidationError("start_date must be before end_date")
        return data


class DashboardStatsSerializer(serializers.Serializer):
    """Serializer for dashboard statistics"""
    
    # Sales stats
    today_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    week_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    month_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    sales_trend = serializers.DecimalField(max_digits=5, decimal_places=2)
    
    # Inventory stats
    low_stock_count = serializers.IntegerField()
    out_of_stock_count = serializers.IntegerField()
    total_products = serializers.IntegerField()
    
    # Customer stats
    total_customers = serializers.IntegerField()
    new_customers_this_month = serializers.IntegerField()
    
    # Top products
    top_products = serializers.ListField()
    
    # Recent sales
    recent_sales = serializers.ListField()