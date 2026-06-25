"""Celery tasks for the businesses app."""
from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from apps.businesses.models import BusinessOwnerInvite

# Invite expiry in days — must match OWNER_INVITE_TTL_DAYS in onboarding_services.py.
# Passed to the email template so the copy stays consistent with the token TTL.
_INVITE_EXPIRES_DAYS = 5


@shared_task(bind=True, max_retries=3, retry_backoff=True, time_limit=30)
def send_owner_invite_email(self, invite_id: str, raw_token: str) -> None:
    """Render and send the owner-activation email for a PENDING invite (idempotent).

    Loads the invite by id, builds the activation URL
    {FRONTEND_URL}/business/activate?token=<raw_token>, renders the html+txt
    templates, and sends to invite.email. raw_token is passed in (the hash is all
    that's stored) — it transits the broker because the link cannot otherwise be
    reconstructed; tokens are single-use and short-lived (5 days).

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

    context = {
        "business_name": business.name,
        "owner_name": business.pending_owner_name or "",
        "activation_url": activation_url,
        "expires_days": _INVITE_EXPIRES_DAYS,
    }

    text_body = render_to_string("businesses/owner_invite_email.txt", context)
    html_body = render_to_string("businesses/owner_invite_email.html", context)

    msg = EmailMultiAlternatives(
        subject=f"You're invited to set up {business.name} on Jaqyn",
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    msg.attach_alternative(html_body, "text/html")

    try:
        msg.send()
    except Exception as exc:
        raise self.retry(exc=exc)
