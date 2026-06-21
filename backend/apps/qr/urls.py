from django.urls import path

from apps.loyalty.views import CollectFromQRView, QRRedeemView
from apps.qr.views import QRResolveView

urlpatterns = [
    path("<str:token>/", QRResolveView.as_view(), name="qr-resolve"),
    path("<str:token>/collect/", CollectFromQRView.as_view(), name="qr-collect"),
    path("<str:token>/redeem/", QRRedeemView.as_view(), name="qr-redeem"),
]
