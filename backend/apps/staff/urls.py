from django.urls import path

from apps.qr.views import StaffTodayCodeView
from apps.staff.views import (
    StaffProgramsView,
    StaffProfileCompleteView,
    StaffRecentActivityView,
    StaffScanView,
    StaffStatsView,
)

# The loyalty collect/redeem and groups verify/redeem staff endpoints moved to the
# campaigns unified scanner at /api/staff/campaigns/ (scan, visit, confirm-group,
# confirm-social, redeem-voucher) when the loyalty + groups apps were deleted.
urlpatterns = [
    path("programs/", StaffProgramsView.as_view(), name="staff-programs"),
    path("today-code/", StaffTodayCodeView.as_view(), name="staff-today-code"),
    path("scan/", StaffScanView.as_view(), name="staff-scan"),
    path("recent-activity/", StaffRecentActivityView.as_view(), name="staff-recent-activity"),
    path("stats/", StaffStatsView.as_view(), name="staff-stats"),
    path("profile/complete/", StaffProfileCompleteView.as_view(), name="staff-profile-complete"),
]
