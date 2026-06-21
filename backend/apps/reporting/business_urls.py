from django.urls import path

from apps.reporting.views import BusinessCustomersView, BusinessReportsView

urlpatterns = [
    path("reports/", BusinessReportsView.as_view(), name="business-reports"),
    path("customers/", BusinessCustomersView.as_view(), name="business-customers"),
]
