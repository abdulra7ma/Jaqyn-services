import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from apps.notifications.models import NotificationLog
from apps.notifications.services import notifier

logger = logging.getLogger(__name__)


@shared_task
def send_otp(phone, code):
    logger.info("dev_otp phone=%s code=%s", phone, code)
    return str(notifier.send(None, "sms", "otp", {"phone": phone, "code": code}).id)


@shared_task(max_retries=3, default_retry_delay=5, time_limit=30)
def send_email_otp_task(email: str, code: str) -> None:
    """Send a 6-digit OTP to the given email address via Django's email backend."""
    expiry_minutes = getattr(settings, "OTP_TTL_SECONDS", 300) // 60
    send_mail(
        subject="Your Jaqyn verification code",
        message=(
            f"Your verification code is: {code}\n\n"
            f"This code expires in {expiry_minutes} minutes.\n"
            f"If you did not request this, you can ignore this email."
        ),
        html_message=(
            f"<p>Your Jaqyn verification code is:</p>"
            f"<p style='font-size:32px;letter-spacing:6px;font-weight:bold'>{code}</p>"
            f"<p>This code expires in {expiry_minutes} minutes.</p>"
            f"<p>If you did not request this, you can ignore this email.</p>"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )
