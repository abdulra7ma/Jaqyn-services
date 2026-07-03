from django.db import models

from core.fields import TimeStampedModel, UUIDModel


class NotificationPreference(TimeStampedModel):
    user = models.OneToOneField(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    sms_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=False)
    telegram_enabled = models.BooleanField(default=False)
    whatsapp_enabled = models.BooleanField(default=False)
    reward_updates = models.BooleanField(default=True)
    group_reminders = models.BooleanField(default=True)
    business_reports = models.BooleanField(default=True)
    campaign_updates = models.BooleanField(default=True)


class NotificationLog(UUIDModel):
    class Status(models.TextChoices):
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    recipient = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        related_name="notification_logs",
        blank=True,
        null=True,
    )
    channel = models.CharField(max_length=32)
    event = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices)
    payload = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class CampaignNotice(UUIDModel):
    """A persistent in-app notice for a relevant newly-created campaign."""

    recipient = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="campaign_notices"
    )
    campaign = models.ForeignKey(
        "campaigns.Campaign",
        on_delete=models.CASCADE,
        related_name="customer_notices",
    )
    seen_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "campaign"],
                name="unique_customer_campaign_notice",
            )
        ]
        indexes = [models.Index(fields=["recipient", "seen_at", "-created_at"])]
