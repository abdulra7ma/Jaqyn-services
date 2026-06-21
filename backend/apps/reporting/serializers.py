from rest_framework import serializers


class ManualAdjustmentSerializer(serializers.Serializer):
    customer = serializers.UUIDField()
    program = serializers.UUIDField()
    amount_count = serializers.IntegerField()
    reason = serializers.CharField(max_length=500)


class AdminReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
