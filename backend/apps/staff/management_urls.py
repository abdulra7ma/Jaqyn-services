"""URL routes for the owner-facing "Manage Staff" surface.

Mounted at ``/api/business/staff/`` (see ``config/urls.py``). Owner-only; the
business is resolved from ``request.user.owned_business`` in the views.
"""

from django.urls import path

from apps.staff.management_views import (
    StaffMemberDetailView,
    StaffReactivateView,
    StaffResetPasswordView,
    StaffSuspendView,
    StaffTeamListView,
)

urlpatterns = [
    path("", StaffTeamListView.as_view(), name="business-staff-list"),
    path("<uuid:staff_id>/", StaffMemberDetailView.as_view(), name="business-staff-detail"),
    path("<uuid:staff_id>/suspend/", StaffSuspendView.as_view(), name="business-staff-suspend"),
    path("<uuid:staff_id>/reactivate/", StaffReactivateView.as_view(), name="business-staff-reactivate"),
    path("<uuid:staff_id>/reset-password/", StaffResetPasswordView.as_view(), name="business-staff-reset-password"),
]
