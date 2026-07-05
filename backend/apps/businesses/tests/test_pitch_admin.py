import pytest
from django.contrib.admin.sites import site

from apps.businesses.models import Business, PitchInvite

pytestmark = pytest.mark.django_db


def test_pitch_status_column_reflects_latest_invite():
    b = Business.objects.create(name="Bublik", category="cafe")
    admin_instance = site._registry[Business]
    # No invite -> shows "not sent" marker
    result = admin_instance.pitch_status(b)
    assert "—" in result or "not" in result.lower()
    PitchInvite.objects.create(
        business=b,
        token_hash="h1",
        expires_at=__import__("django.utils.timezone", fromlist=["now"]).now(),
        status=PitchInvite.Status.OPENED,
    )
    assert admin_instance.pitch_status(b)  # renders something for opened


def test_create_pitch_link_button_uses_frontend_url(settings, rf):
    """The admin generate-link button must point at the customer frontend.

    The admin request originates from the backend/admin host, so the link must
    use settings.FRONTEND_URL — never the request origin, which would send the
    prospect to the backend (no /pitch/ route). Regression for that bug.
    """
    from django.contrib.messages.storage.fallback import FallbackStorage

    settings.FRONTEND_URL = "https://app.jaqyn.example"
    b = Business.objects.create(name="Bublik", category="cafe")
    admin_instance = site._registry[Business]

    # Request as the Django admin sees it: origin/referer are the ADMIN host.
    request = rf.get(
        "/admin/",
        HTTP_ORIGIN="https://admin.jaqyn.example",
        HTTP_REFERER="https://admin.jaqyn.example/businesses/",
    )
    setattr(request, "session", {})
    setattr(request, "_messages", FallbackStorage(request))

    admin_instance.create_pitch_link_button(request, str(b.id))

    flashed = " ".join(str(m.message) for m in request._messages)
    assert "https://app.jaqyn.example/pitch/" in flashed
    assert "admin.jaqyn.example/pitch/" not in flashed
    assert b.pitch_invites.filter(status=PitchInvite.Status.PENDING).exists()
