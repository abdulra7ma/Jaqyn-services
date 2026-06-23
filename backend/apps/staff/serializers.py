from decimal import Decimal

from rest_framework import serializers

from apps.staff.models import StaffMember


class StaffScanSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


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
