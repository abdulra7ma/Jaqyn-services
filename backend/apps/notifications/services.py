import logging

from apps.notifications.models import NotificationLog, NotificationPreference

logger = logging.getLogger(__name__)


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


notifier = Notifier()
