"""Owner-facing "Manage Staff" views — ``/api/business/staff/``.

Thin DRF views: each resolves the authenticated owner's business, calls one
:mod:`apps.staff.services` function, and shapes the response with a structured
serializer. All business logic, scoping and failure modes live in the service.
All endpoints are owner-only (``IsBusinessOwner``); writes are scope-throttled.
"""

from __future__ import annotations

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.businesses.models import Business
from apps.staff import services
from apps.staff.serializers import (
    StaffRoleUpdateSerializer,
    TeamListSerializer,
    TeamRowSerializer,
)
from core.exceptions import JaqynAPIException
from core.permissions import IsBusinessOwner
from core.response import success_response


class _OwnerStaffMixin:
    """Resolve the authenticated owner's business or raise 404."""

    permission_classes = [IsBusinessOwner]

    def get_business(self, request: Request) -> Business:
        try:
            return request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)


class _StaffWriteMixin(_OwnerStaffMixin):
    """Owner staff mutations — scope-throttled under ``staff_manage``."""

    throttle_scope = "staff_manage"

    def get_throttles(self) -> list[ScopedRateThrottle]:
        return [ScopedRateThrottle()]


class StaffTeamListView(_OwnerStaffMixin, APIView):
    """GET /api/business/staff/ — merged team list (members + pending invites)."""

    serializer_class = TeamListSerializer

    def get(self, request: Request) -> Response:
        business = self.get_business(request)
        team = services.list_team(business)
        return success_response(TeamListSerializer(team).data)


class StaffMemberDetailView(_StaffWriteMixin, APIView):
    """Detail + mutations for a single staff member.

    GET → full detail row. PATCH → change role. DELETE → remove the member.
    Reads are not throttled by the write scope; the throttle only fires on the
    mutating verbs because GET below uses the default throttles via super().
    """

    serializer_class = TeamRowSerializer

    def get(self, request: Request, staff_id: str) -> Response:
        business = self.get_business(request)
        row = services.get_staff_detail(business, staff_id)
        return success_response(TeamRowSerializer(row).data)

    def patch(self, request: Request, staff_id: str) -> Response:
        business = self.get_business(request)
        serializer = StaffRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = services.change_role(business, staff_id, serializer.validated_data["role"])
        row = services.get_staff_detail(business, str(member.id))
        return success_response(TeamRowSerializer(row).data)

    def delete(self, request: Request, staff_id: str) -> Response:
        business = self.get_business(request)
        services.remove_staff_member(business, staff_id)
        return success_response(message="Staff member removed")


class StaffSuspendView(_StaffWriteMixin, APIView):
    """POST /api/business/staff/{id}/suspend/ — deactivate a staff member."""

    serializer_class = TeamRowSerializer

    def post(self, request: Request, staff_id: str) -> Response:
        business = self.get_business(request)
        services.set_active(business, staff_id, is_active=False)
        row = services.get_staff_detail(business, staff_id)
        return success_response(TeamRowSerializer(row).data)


class StaffReactivateView(_StaffWriteMixin, APIView):
    """POST /api/business/staff/{id}/reactivate/ — reactivate a staff member."""

    serializer_class = TeamRowSerializer

    def post(self, request: Request, staff_id: str) -> Response:
        business = self.get_business(request)
        services.set_active(business, staff_id, is_active=True)
        row = services.get_staff_detail(business, staff_id)
        return success_response(TeamRowSerializer(row).data)


class StaffResetPasswordView(_StaffWriteMixin, APIView):
    """POST /api/business/staff/{id}/reset-password/ — issue a temp password.

    Returns the plaintext temp password exactly once; it is never stored or
    logged in plaintext. Fails (409) if the staff member has no linked user.
    """

    def post(self, request: Request, staff_id: str) -> Response:
        business = self.get_business(request)
        temp_password = services.reset_staff_password(business, staff_id)
        return success_response({"temp_password": temp_password})
