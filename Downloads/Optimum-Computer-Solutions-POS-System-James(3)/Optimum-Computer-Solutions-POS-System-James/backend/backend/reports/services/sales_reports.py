#Handles sales analytics and reporting logic for the ERP system
from django.db.models import Sum, Count, Avg
from sales.models import Sale
from django.db.models.functions import TruncDate
from django.utils import timezone
from datetime import timedelta
from django.db.models.functions import TruncMonth


def get_sales_summary(start_date=None, end_date=None):
#
#    Returns high-level sales analytics total revenue, total number of sales and average sale value.


    queryset = Sale.objects.all()

    if start_date:
        queryset = queryset.filter(created_at__date__gte=start_date)

    if end_date:
        queryset = queryset.filter(created_at__date__lte=end_date)

    data = queryset.aggregate(
        total_revenue=Sum("total"),
        total_sales=Count("id"),
        average_sale=Avg("total"),
    )

    return {
        "total_revenue": data["total_revenue"] or 0,
        "total_sales": data["total_sales"] or 0,
        "average_sale": round(data["average_sale"] or 0, 2),
    }





def get_sales_trend(start_date=None, end_date=None):
#Returns daily sales totals for charting (line graph)

    queryset = Sale.objects.all()


    if start_date:
        queryset = queryset.filter(created_at__date__gte=start_date)

    if end_date:
        queryset = queryset.filter(created_at__date__lte=end_date)


    data = (
        queryset
        .annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(total=Sum("total"))
        .order_by("date")
    )

    return {
        "labels": [item["date"].strftime("%Y-%m-%d") for item in data],
        "values": [item["total"] for item in data],
    }

def get_revenue_growth():
#Compares current revenue against previous revenue period.

    today = timezone.now().date()

    # Current period (last 30 days)
    current_start = today - timedelta(days=30)

    # Previous period
    previous_start = current_start - timedelta(days=30)

    current_revenue = (
        Sale.objects.filter(created_at__date__gte=current_start)
        .aggregate(total=Sum("total"))["total"] or 0
    )

    previous_revenue = (
        Sale.objects.filter(
            created_at__date__gte=previous_start,
            created_at__date__lt=current_start
        )
        .aggregate(total=Sum("total"))["total"] or 0
    )

    # Avoid division by zero
    if previous_revenue == 0:
        growth_percentage = 100 if current_revenue > 0 else 0
    else:
        growth_percentage = (
            (current_revenue - previous_revenue)
            / previous_revenue
        ) * 100

    return {
        "current_revenue": current_revenue,
        "previous_revenue": previous_revenue,
        "growth_percentage": round(growth_percentage, 2),
    }

def get_monthly_revenue_trend():
#Returns monthly revenue totals for trend analysis.

    data = (
        Sale.objects
        .annotate(month=TruncMonth("created_at"))
        .values("month")
        .annotate(total_revenue=Sum("total"))
        .order_by("month")
    )

    return {
        "labels": [
            item["month"].strftime("%Y-%m") for item in data
        ],
        "values": [
            item["total_revenue"] or 0 for item in data
        ],
    }