#Handles payment analytics and reporting services.
from django.db.models import Sum, Count, Avg
from payments.models import Payment


def get_payment_summary(start_date=None, end_date=None):
    # Returns high-level payment analytics.
    
    queryset = Payment.objects.all()

    # Optional date filtering
    if start_date:
        queryset = queryset.filter(payment_date__date__gte=start_date)

    if end_date:
        queryset = queryset.filter(payment_date__date__lte=end_date)

    
    # Main payment summary
    summary = queryset.aggregate(
        total_payments=Sum("amount_paid"),
        total_transactions=Count("id"),
        average_payment=Avg("amount_paid"),
    )

    
    # Payment methods used
    methods = (
        queryset
        .values("payment_method")
        .annotate(total=Count("id"))
        .order_by("-total")
    )

    return {
        "total_payments": summary["total_payments"] or 0,
        "total_transactions": summary["total_transactions"] or 0,
        "average_payment": round(summary["average_payment"] or 0, 2),
        "payment_methods": list(methods),
    }