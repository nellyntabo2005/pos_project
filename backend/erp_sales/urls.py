# erp_sales/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.http import HttpResponseRedirect

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Redirect root to admin
    path('', lambda request: HttpResponseRedirect('/admin/'), name='my_index'),
    
    # ========== API ROUTES ==========
    # Customers
    path('api/customers/', include('customers.urls')),
    
    # Users
    path('api/users/', include('users.urls')),
    
    # Products
    path('api/products/', include('products.urls')),
    
    # Sales
    path('api/sales/', include('sales.urls')),
    
    # Returns
    path('api/returns/', include('returns.urls')),
    
    # Payments
    path('api/payments/', include('payments.urls')),
    
    # Reports
    path('api/reports/', include('reports.urls')),
    
    # Notifications
    path('api/notifications/', include('notifications.urls')),
    
    # Inventory
    path('api/inventory/', include('inventory.urls')),
    
    # ========== AUTHENTICATION ==========
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]