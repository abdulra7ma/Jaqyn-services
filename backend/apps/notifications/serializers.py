from rest_framework import serializers

from apps.notifications.models import (
    CampaignNotice,
    NotificationLog,
    NotificationPreference,
)


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
            "campaign_updates",
        )


class NotificationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationLog
        fields = (
            "id",
            "recipient",
            "channel",
            "event",
            "status",
            "payload",
            "error",
            "created_at",
        )
        read_only_fields = fields


class CampaignNoticeSerializer(serializers.ModelSerializer):
    campaign_id = serializers.UUIDField(source="campaign.id", read_only=True)
    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    reward_title = serializers.CharField(source="campaign.reward.title", read_only=True)
    business_name = serializers.CharField(
        source="campaign.business.name", read_only=True
    )
    business_logo_url = serializers.SerializerMethodField()

    class Meta:
        model = CampaignNotice
        fields = (
            "id",
            "campaign_id",
            "campaign_name",
            "reward_title",
            "business_name",
            "business_logo_url",
            "created_at",
        )

    def get_business_logo_url(self, obj: CampaignNotice) -> str | None:
        return obj.campaign.business.logo.url if obj.campaign.business.logo else None


class MarkCampaignNoticesSeenSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=20
    )
