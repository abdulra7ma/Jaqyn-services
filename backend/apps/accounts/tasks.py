import logging

from celery import shared_task

from apps.notifications.models import NotificationLog
from apps.notifications.services import notifier

logger = logging.getLogger(__name__)


@shared_task
def send_otp(phone, code):
    logger.info("dev_otp phone=%s code=%s", phone, code)
    return str(notifier.send(None, "sms", "otp", {"phone": phone, "code": code}).id)
