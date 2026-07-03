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
    """A persistent in-app notice for a relevant newly-created campaign or system event.

    Extended additively (spec §C) with nullable ``kind`` and ``target_url`` so
    loyalty / one-away / group-fill notices can use this model without breaking
    the existing campaign-notice contract. The original ``campaign`` FK is now
    nullable too — notices that are not campaign-specific (one-away loyalty,
    group-fill) set ``campaign=None`` and carry their deep-link in ``target_url``.

    Migration note: the original ``campaign`` FK was non-nullable. The additive
    migration (0002_campaignnotice_extend) makes it nullable with SET_NULL; a
    separate optional ``kind`` field distinguishes the new subtypes from the
    original "new campaign" notice.
    """

    class Kind(models.TextChoices):
        # The original notice type: a new campaign from a business the customer knows.
        NEW_CAMPAIGN = "new_campaign", "New campaign"
        # one_away: loyalty or campaign progress is one action from a reward.
        ONE_AWAY = "one_away", "One away"
        # group_seat_filled: a member joined the customer's group session.
        GROUP_SEAT_FILLED = "group_seat_filled", "Group seat filled"

    recipient = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="campaign_notices"
    )
    # Nullable to support non-campaign notices (one-away loyalty, group-fill).
    # SET_NULL so deleting a campaign does not cascade-delete the notice.
    # Source: spec §C "add nullable kind + target_url — additive, no breaking change".
    campaign = models.ForeignKey(
        "campaigns.Campaign",
        on_delete=models.SET_NULL,
        related_name="customer_notices",
        blank=True,
        null=True,
    )
    # Notice subtype. New rows from the existing code path write None (treated as
    # NEW_CAMPAIGN by the serializer). Source: spec §C additive extension.
    kind = models.CharField(
        max_length=32, choices=Kind.choices, blank=True, null=True
    )
    # Deep-link URL for routing the customer to the relevant screen. Null for
    # legacy new-campaign notices (the frontend derives the URL from campaign.id).
    target_url = models.CharField(max_length=512, blank=True, null=True)
    seen_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "campaign"],
                name="unique_customer_campaign_notice",
                condition=models.Q(campaign__isnull=False),
            )
        ]
        indexes = [models.Index(fields=["recipient", "seen_at", "-created_at"])]
