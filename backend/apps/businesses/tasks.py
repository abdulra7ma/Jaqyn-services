"""Celery tasks for the businesses app."""
from celery import shared_task
from django.conf import settings
from django.utils.html import escape

from apps.businesses.models import BusinessOwnerInvite
from core.email import send_branded_email
from core.email_i18n import OWNER_INVITE_EMAIL_STRINGS, resolve_language

# Invite expiry in days — must match OWNER_INVITE_TTL_DAYS in onboarding_services.py.
# Passed to the email template so the copy stays consistent with the token TTL.
_INVITE_EXPIRES_DAYS = 5


@shared_task(bind=True, max_retries=3, retry_backoff=True, time_limit=30)
def send_owner_invite_email(self, invite_id: str, raw_token: str) -> None:
    """Render and send the owner-activation email for a PENDING invite (idempotent).

    Loads the invite by id, builds the activation URL
    {FRONTEND_URL}/business/activate?token=<raw_token>, renders the html+txt
    templates in business.default_language (falling back to the platform
    default, ru, for anything unsupported), and sends to invite.email. raw_token
    is passed in (the hash is all that's stored) — it transits the broker
    because the link cannot otherwise be reconstructed; tokens are single-use
    and short-lived (5 days).

    Idempotent: re-running for a non-PENDING invite (already ACCEPTED, EXPIRED, or
    CANCELLED) is a no-op, so duplicate task execution is harmless.
    Never logs the token value.
    """
    try:
        invite = (
            BusinessOwnerInvite.objects.select_related("business")
            .get(id=invite_id)
        )
    except BusinessOwnerInvite.DoesNotExist:
        # Invite was deleted; nothing to do.
        return

    if invite.status != BusinessOwnerInvite.Status.PENDING:
        # Already accepted/expired/cancelled — do not re-send.
        return

    recipient = invite.email
    if not recipient:
        # No email address on the invite; cannot send.
        return

    business = invite.business
    activation_url = (
        f"{settings.FRONTEND_URL}/business/activate?token={raw_token}"
    )
    owner_name = business.pending_owner_name or ""

    lang = resolve_language(business.default_language)
    strings = OWNER_INVITE_EMAIL_STRINGS[lang]
    # business_name is admin/owner-authored input; escape before embedding it in
    # strings marked |safe in the template (body1 carries a literal <strong> tag).
    safe_business_name = escape(business.name)

    context = {
        "subject": strings["subject"].format(business_name=business.name),
        "greeting": strings["greeting"].format(owner_name=owner_name),
        "body1": strings["body1"].format(business_name=safe_business_name),
        "body2": strings["body2"],
        "button": strings["button"],
        "expiry": strings["expiry"].format(expires_days=_INVITE_EXPIRES_DAYS),
        "footer_fallback": strings["footer_fallback"],
        "greeting_txt": strings["greeting_txt"].format(owner_name=owner_name),
        "body1_txt": strings["body1_txt"].format(business_name=business.name),
        "cta_txt": strings["cta_txt"],
        "expiry_txt": strings["expiry_txt"].format(expires_days=_INVITE_EXPIRES_DAYS),
        "sign_off": strings["sign_off"],
        "activation_url": activation_url,
    }

    try:
        send_branded_email(
            subject=context["subject"],
            to=recipient,
            template_base="businesses/owner_invite_email",
            language=lang,
            context=context,
        )
    except Exception as exc:
        raise self.retry(exc=exc)
