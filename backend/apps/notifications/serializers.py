from rest_framework import serializers

from apps.notifications.models import NotificationLog, NotificationPreference


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = (
            "sms_enabled",
            "email_enabled",
            "telegram_enabled",
            "whatsapp_enabled",
            "reward_updates",
            "group_reminders",
            "business_reports",
        )


class NotificationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationLog
        fields = ("id", "recipient", "channel", "event", "status", "payload", "error", "created_at")
        read_only_fields = fields
