from django.urls import path

from apps.qr.views import CustomerProfileQRView

urlpatterns = [
    path("qr/", CustomerProfileQRView.as_view(), name="customer-profile-qr"),
]
