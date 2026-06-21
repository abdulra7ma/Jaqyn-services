from django.urls import path

from apps.loyalty.views import StaffManualCodeRedeemView, StaffRedeemView
from apps.groups.views import StaffGroupRedeemView, StaffGroupVerifyView, StaffGroupsView
from apps.qr.views import StaffTodayCodeView
from apps.staff.views import StaffCollectView, StaffProgramsView, StaffRecentActivityView, StaffScanView

urlpatterns = [
    path("programs/", StaffProgramsView.as_view(), name="staff-programs"),
    path("today-code/", StaffTodayCodeView.as_view(), name="staff-today-code"),
    path("scan/", StaffScanView.as_view(), name="staff-scan"),
    path("collect/", StaffCollectView.as_view(), name="staff-collect"),
    path("redeem/", StaffRedeemView.as_view(), name="staff-redeem"),
    path("redeem/manual-code/", StaffManualCodeRedeemView.as_view(), name="staff-redeem-manual-code"),
    path("recent-activity/", StaffRecentActivityView.as_view(), name="staff-recent-activity"),
    path("groups/", StaffGroupsView.as_view(), name="staff-groups"),
    path("groups/<uuid:group_id>/verify/", StaffGroupVerifyView.as_view(), name="staff-group-verify"),
    path("groups/<uuid:group_id>/redeem/", StaffGroupRedeemView.as_view(), name="staff-group-redeem"),
]
