from django.urls import path

from apps.qr.views import QRResolveView

# The customer-initiated collect/redeem routes lived in the deleted loyalty app.
# Post-restructure the model is staff-scans-customer (see apps.campaigns staff
# scanner), so only the public token-resolve route remains here.
urlpatterns = [
    path("<str:token>/", QRResolveView.as_view(), name="qr-resolve"),
]
