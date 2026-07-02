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
