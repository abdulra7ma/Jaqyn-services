from decimal import Decimal

from rest_framework import serializers


class StaffScanSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


class StaffCollectSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=Decimal("0"))
    program_id = serializers.UUIDField(required=False, allow_null=True)
