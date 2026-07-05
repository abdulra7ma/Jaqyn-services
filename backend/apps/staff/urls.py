from django.urls import path

from apps.qr.views import StaffTodayCodeView
from apps.staff.views import (
    StaffProgramsView,
    StaffProfileCompleteView,
    StaffRecentActivityView,
    StaffStatsView,
)

# The scan endpoint (/api/staff/scan/) is served by UnifiedStaffScanView declared
# in config/urls.py before this include — it shadows and supersedes StaffScanView
# (removed). The loyalty collect/redeem and groups verify/redeem staff endpoints
# moved to the campaigns unified scanner at /api/staff/campaigns/.
urlpatterns = [
    path("programs/", StaffProgramsView.as_view(), name="staff-programs"),
    path("today-code/", StaffTodayCodeView.as_view(), name="staff-today-code"),
    path("recent-activity/", StaffRecentActivityView.as_view(), name="staff-recent-activity"),
    path("stats/", StaffStatsView.as_view(), name="staff-stats"),
    path("profile/complete/", StaffProfileCompleteView.as_view(), name="staff-profile-complete"),
]
