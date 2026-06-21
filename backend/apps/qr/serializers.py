from rest_framework import serializers


class ApprovalCodeInputSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=4, max_length=12)
