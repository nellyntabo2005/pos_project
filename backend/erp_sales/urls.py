# erp_sales/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.http import HttpResponseRedirect

# erp_sales/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API Routes
    path('api/customers/', include('customers.urls')),
    path('api/users/', include('users.urls')),
    path('api/products/', include('products.urls')),
    path('api/sales/', include('sales.urls')),
    path('api/returns/', include('returns.urls')),
    path('api/payments/', include('payments.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/inventory/', include('inventory.urls')),
    
    # Authentication
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]