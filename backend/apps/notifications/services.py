import logging

from apps.notifications.models import NotificationLog, NotificationPreference

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
            preferences, _ = NotificationPreference.objects.get_or_create(user=recipient)
            if channel == "sms" and not preferences.sms_enabled:
                return NotificationLog.objects.create(recipient=recipient, channel=channel, event=event, status=NotificationLog.Status.SKIPPED, payload=payload)
            if channel == "email" and not preferences.email_enabled:
                return NotificationLog.objects.create(recipient=recipient, channel=channel, event=event, status=NotificationLog.Status.SKIPPED, payload=payload)
        logger.info("notification provider=%s channel=%s event=%s payload=%s", self.provider, channel, event, payload)
        return NotificationLog.objects.create(recipient=recipient, channel=channel, event=event, status=NotificationLog.Status.SENT, payload=payload)

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
            preferences, _ = NotificationPreference.objects.get_or_create(user=recipient)
            if not preferences.campaign_updates:
                return NotificationLog.objects.create(recipient=recipient, channel=channel, event=event, status=NotificationLog.Status.SKIPPED, payload=payload)
        return self.send(recipient=recipient, channel=channel, event=event, payload=payload)


notifier = Notifier()
