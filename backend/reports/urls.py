# reports/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ReportViewSet, SavedReportViewSet

router = DefaultRouter()
router.register(r'reports', ReportViewSet, basename='report')
router.register(r'saved-reports', SavedReportViewSet, basename='saved-report')
# Remove exports router if causing issues
# router.register(r'exports', ReportExportViewSet, basename='report-export')

urlpatterns = [
    path('', include(router.urls)),
]