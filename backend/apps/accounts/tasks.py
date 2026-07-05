import logging

from celery import shared_task

from apps.notifications.services import notifier
from core.email import send_branded_email
from core.email_i18n import OTP_EMAIL_STRINGS, PASSWORD_RESET_EMAIL_STRINGS, resolve_language

logger = logging.getLogger(__name__)


@shared_task
def send_otp(phone, code):
    logger.info("dev_otp phone=%s code=%s", phone, code)
    return str(notifier.send(None, "sms", "otp", {"phone": phone, "code": code}).id)


@shared_task(max_retries=3, default_retry_delay=5, time_limit=30)
def send_email_otp_task(email: str, code: str, language: str = "ru") -> None:
    """Send a 6-digit OTP to the given email, in the caller's resolved language.

    `language` is the customer's chosen language — CustomerProfile.language for an
    existing account, otherwise whatever the client is currently displaying (see
    apps.accounts.services.issue_email_otp) — and falls back to the platform
    default (ru) for anything unsupported.
    """
    from django.conf import settings

    lang = resolve_language(language)
    strings = OTP_EMAIL_STRINGS[lang]
    expiry_minutes = getattr(settings, "OTP_TTL_SECONDS", 300) // 60

    send_branded_email(
        subject=strings["subject"],
        to=email,
        template_base="emails/email_otp",
        language=lang,
        context={
            "subject": strings["subject"],
            "code": code,
            "intro": strings["intro"],
            "expiry": strings["expiry"].format(minutes=expiry_minutes),
            "ignore": strings["ignore"],
        },
    )


@shared_task(max_retries=3, default_retry_delay=5, time_limit=30)
def send_password_reset_otp_task(email: str, code: str, language: str = "ru") -> None:
    """Send a 6-digit password-reset code to the given email, in the caller's resolved language.

    See send_email_otp_task for how `language` is resolved upstream.
    """
    from django.conf import settings

    lang = resolve_language(language)
    strings = PASSWORD_RESET_EMAIL_STRINGS[lang]
    expiry_minutes = getattr(settings, "OTP_TTL_SECONDS", 300) // 60

    send_branded_email(
        subject=strings["subject"],
        to=email,
        template_base="emails/password_reset_otp",
        language=lang,
        context={
            "subject": strings["subject"],
            "code": code,
            "intro": strings["intro"],
            "expiry": strings["expiry"].format(minutes=expiry_minutes),
            "ignore": strings["ignore"],
        },
    )
