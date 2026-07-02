from decimal import Decimal

from rest_framework import serializers

from apps.staff.models import StaffMember
from apps.staff.services import ACTIVITY_KINDS


class StaffScanSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


class StaffTodayStatsSerializer(serializers.Serializer):
    """Serializes :class:`apps.staff.services.StaffTodayStats`."""

    scans_today = serializers.IntegerField()
    redemptions_today = serializers.IntegerField()


class ActivityEventSerializer(serializers.Serializer):
    """Serializes one :class:`apps.staff.services.ActivityEvent` feed row."""

    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=ACTIVITY_KINDS)
    customer = serializers.CharField(allow_blank=True)
    label = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()


class ActivityQuerySerializer(serializers.Serializer):
    """Input for the ``?kind=`` feed filter — enum membership at the edge."""

    kind = serializers.ChoiceField(choices=ACTIVITY_KINDS, required=False)


class StaffCollectSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=Decimal("0"))
    program_id = serializers.UUIDField(required=False, allow_null=True)


# --- Manage Staff (owner) -------------------------------------------------
# Output serializers describe the structured service dataclasses so the API
# surface is documented (drf-spectacular) and never a bare dict. Input
# serializers do shape/format validation only; business rules (enum membership
# beyond the choices, scoping) live in the service layer.


class StaffStatsSerializer(serializers.Serializer):
    """Serializes :class:`apps.staff.services.StaffStats`."""

    scans = serializers.IntegerField()
    redemptions = serializers.IntegerField()
    signups = serializers.IntegerField()


class TeamRowSerializer(serializers.Serializer):
    """Serializes one merged team row (:class:`apps.staff.services.TeamRow`)."""

    id = serializers.CharField()
    kind = serializers.CharField()
    name = serializers.CharField()
    role = serializers.CharField()
    access_label = serializers.CharField()
    email = serializers.CharField(allow_null=True)
    phone = serializers.CharField(allow_null=True)
    status = serializers.CharField()
    last_active = serializers.DateTimeField(allow_null=True)
    joined = serializers.DateTimeField(allow_null=True)
    avatar_url = serializers.CharField(allow_null=True)
    initials = serializers.CharField()
    stats = StaffStatsSerializer()


class TeamCountsSerializer(serializers.Serializer):
    """Serializes :class:`apps.staff.services.TeamCounts`."""

    total = serializers.IntegerField()
    active = serializers.IntegerField()
    invited = serializers.IntegerField()
    suspended = serializers.IntegerField()


class TeamListSerializer(serializers.Serializer):
    """Serializes the full team payload (counts + merged rows)."""

    counts = TeamCountsSerializer()
    members = TeamRowSerializer(many=True)


class StaffRoleUpdateSerializer(serializers.Serializer):
    """Input for PATCH role change — enforces enum membership at the edge."""

    role = serializers.ChoiceField(choices=StaffMember.Role.choices)


class StaffCreateSerializer(serializers.Serializer):
    """Input for owner-created staff: phone + role (name optional)."""

    phone = serializers.CharField(max_length=32)
    role = serializers.ChoiceField(choices=StaffMember.Role.choices)
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)


class StaffCreateResultSerializer(serializers.Serializer):
    """Response for POST /api/business/staff/ — member row + one-time password."""

    member = TeamRowSerializer()
    temp_password = serializers.CharField()
