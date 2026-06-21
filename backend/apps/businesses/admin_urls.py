from django.urls import path

from apps.businesses.admin_views import (
    ApproveBusinessView,
    DisableBusinessView,
    PendingBusinessesView,
    RejectBusinessView,
    RequestChangesView,
    VerificationQueueView,
    VerifyBusinessView,
)

urlpatterns = [
    path("businesses/pending/", PendingBusinessesView.as_view(), name="admin-businesses-pending"),
    path("businesses/<uuid:business_id>/approve/", ApproveBusinessView.as_view(), name="admin-business-approve"),
    path("businesses/<uuid:business_id>/reject/", RejectBusinessView.as_view(), name="admin-business-reject"),
    path("businesses/<uuid:business_id>/disable/", DisableBusinessView.as_view(), name="admin-business-disable"),
    path("business-verifications/", VerificationQueueView.as_view(), name="admin-verification-queue"),
    path("business-verifications/<uuid:business_id>/verify/", VerifyBusinessView.as_view(), name="admin-business-verify"),
    path("business-verifications/<uuid:business_id>/request-changes/", RequestChangesView.as_view(), name="admin-business-request-changes"),
]
