#Combines multiple report services into a unified dashboard analytics response.
from .sales_reports import (
    get_sales_summary,
    get_sales_trend,
)
from .product_reports import get_top_products
from .payment_reports import get_payment_summary
from .sales_reports import get_monthly_revenue_trend
from .sales_reports import get_revenue_growth



def get_dashboard_data(start_date=None, end_date=None):

    return {
        "summary": get_sales_summary(start_date, end_date),

        "sales_trend": get_sales_trend(start_date, end_date),

        "top_products": get_top_products(),

        "payments": get_payment_summary(start_date, end_date),

        "revenue_growth": get_revenue_growth(),

        "monthly_trend": get_monthly_revenue_trend(),
    }