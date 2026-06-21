from django.urls import path

from apps.qr.views import ValidateApprovalCodeView

urlpatterns = [
    path("<uuid:business_id>/validate-code/", ValidateApprovalCodeView.as_view(), name="merchant-validate-code"),
]
