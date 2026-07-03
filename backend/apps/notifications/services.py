import logging
from datetime import datetime
from uuid import UUID

from django.db.models import QuerySet
from django.utils import timezone

from apps.accounts.models import User
from apps.campaigns.models import CampaignParticipant
from apps.campaigns.services import CampaignService
from apps.loyalty.models import LoyaltyMembership
from apps.notifications.models import (
    CampaignNotice,
    NotificationLog,
    NotificationPreference,
)

logger = logging.getLogger(__name__)

# Campaign notification events routed through `notify_campaign_event`. Each maps a
# campaign lifecycle/progress moment to its NotificationLog `event` string and the
# channel it goes out on. Source: plan §1.4 (notify_* tasks: visit counted, reward
# unlocked, expiring soon, campaign ending). Customer-facing nudges go over SMS to
# match the existing reward/group notifications; all are gated by the
# `campaign_updates` preference category.
CAMPAIGN_EVENTS = {
    "campaign_visit_counted": "sms",
    "campaign_reward_unlocked": "sms",
    "campaign_voucher_expiring": "sms",
    "campaign_ending": "sms",
}


class Notifier:
    provider = "dev-log"

    def send(self, recipient=None, channel="sms", event="notification", payload=None):
        payload = payload or {}
        preferences = None
        if recipient is not None:
            preferences, _ = NotificationPreference.objects.get_or_create(
                user=recipient
            )
            if channel == "sms" and not preferences.sms_enabled:
                return NotificationLog.objects.create(
                    recipient=recipient,
                    channel=channel,
                    event=event,
                    status=NotificationLog.Status.SKIPPED,
                    payload=payload,
                )
            if channel == "email" and not preferences.email_enabled:
                return NotificationLog.objects.create(
                    recipient=recipient,
                    channel=channel,
                    event=event,
                    status=NotificationLog.Status.SKIPPED,
                    payload=payload,
                )
        logger.info(
            "notification provider=%s channel=%s event=%s payload=%s",
            self.provider,
            channel,
            event,
            payload,
        )
        return NotificationLog.objects.create(
            recipient=recipient,
            channel=channel,
            event=event,
            status=NotificationLog.Status.SENT,
            payload=payload,
        )

    def notify_campaign_event(self, recipient, event, payload=None):
        """Send a campaign notification, honouring the `campaign_updates` category.

        Mirrors `send` but adds the campaign category gate: a recipient who has
        turned `campaign_updates` off gets a SKIPPED log and no message, before the
        per-channel toggle is even consulted. `event` must be a key of
        `CAMPAIGN_EVENTS`, which decides the channel. Returns the NotificationLog
        row (SENT or SKIPPED). Source: plan §1.4 — the campaign notify_* tasks
        delegate here so preference handling lives in one place.
        """
        payload = payload or {}
        channel = CAMPAIGN_EVENTS[event]
        if recipient is not None:
            preferences, _ = NotificationPreference.objects.get_or_create(
                user=recipient
            )
            if not preferences.campaign_updates:
                return NotificationLog.objects.create(
                    recipient=recipient,
                    channel=channel,
                    event=event,
                    status=NotificationLog.Status.SKIPPED,
                    payload=payload,
                )
        return self.send(
            recipient=recipient, channel=channel, event=event, payload=payload
        )


notifier = Notifier()


# Home shows one notice at a time, while keeping a few queued behind it.
CAMPAIGN_NOTICE_LIMIT = 3


class CampaignNoticeService:
    """Build and acknowledge in-app notices for relevant new campaigns."""

    @staticmethod
    def unread_for_customer(customer: User) -> QuerySet[CampaignNotice]:
        """Return unseen campaigns from businesses the customer already knows.

        A business qualifies when the customer has previously joined one of its
        campaigns or has a loyalty membership there. A campaign is new only when
        it was created after that first relationship, and campaigns the customer
        already joined are excluded. Missing notice rows are created idempotently
        before the three newest unseen rows are returned.
        """

        relationship_started: dict[UUID, datetime] = {}
        campaign_relationships = CampaignParticipant.objects.filter(
            customer=customer
        ).values("campaign__business_id", "joined_at", "created_at")
        for row in campaign_relationships:
            business_id = row["campaign__business_id"]
            started = row["joined_at"] or row["created_at"]
            previous = relationship_started.get(business_id)
            if previous is None or started < previous:
                relationship_started[business_id] = started

        loyalty_relationships = LoyaltyMembership.objects.filter(
            customer=customer
        ).values("program__business_id", "joined_at")
        for row in loyalty_relationships:
            business_id = row["program__business_id"]
            started = row["joined_at"]
            previous = relationship_started.get(business_id)
            if previous is None or started < previous:
                relationship_started[business_id] = started

        if relationship_started:
            joined_campaign_ids = CampaignParticipant.objects.filter(
                customer=customer
            ).values("campaign_id")
            candidates = (
                CampaignService.discover_for_customer(customer)
                .filter(business_id__in=relationship_started)
                .exclude(id__in=joined_campaign_ids)
            )
            missing = [
                CampaignNotice(recipient=customer, campaign=campaign)
                for campaign in candidates
                if campaign.created_at > relationship_started[campaign.business_id]
            ]
            CampaignNotice.objects.bulk_create(missing, ignore_conflicts=True)

        return (
            CampaignNotice.objects.filter(recipient=customer, seen_at__isnull=True)
            .select_related("campaign__business", "campaign__reward")
            .order_by("-created_at")[:CAMPAIGN_NOTICE_LIMIT]
        )

    @staticmethod
    def mark_seen(customer: User, notice_ids: list[UUID]) -> int:
        """Mark only the requesting customer's selected notices as seen."""

        return CampaignNotice.objects.filter(
            recipient=customer,
            id__in=notice_ids,
            seen_at__isnull=True,
        ).update(seen_at=timezone.now())
