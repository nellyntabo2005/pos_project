#Handles product-related analytics and reporting services.

from django.db.models import Sum
from sales.models import SaleItem


def get_top_products(limit=5):
#Returns the top-selling products based on quantity sold.

    products = (
        SaleItem.objects
        .values("product__name")
        .annotate(
            total_quantity=Sum("quantity"),
            total_revenue=Sum("subtotal")
        )
        .order_by("-total_quantity")[:limit]
    )

    return list(products)