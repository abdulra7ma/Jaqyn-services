import pytest
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta

from apps.accounts.models import User
from apps.businesses.models import Business, PitchInvite
from apps.businesses import pitch_services as ps
from core.exceptions import JaqynAPIException

pytestmark = pytest.mark.django_db


def draft(name="Bublik", category="cafe"):
    return Business.objects.create(
        name=name, category=category,
        onboarding_status=Business.OnboardingStatus.NOT_STARTED,
    )


def test_generate_returns_raw_and_stores_only_hash():
    b = draft()
    invite, raw = ps.generate_pitch_invite(b)
    assert raw and invite.token_hash != raw
    assert invite.status == PitchInvite.Status.PENDING
    assert invite.expires_at > timezone.now()


def test_resolve_flips_pending_to_opened_and_builds_view():
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    invite, view = ps.resolve_pitch(raw)
    assert invite.status == PitchInvite.Status.OPENED
    assert invite.opened_at is not None
    assert view.business_name == "Bublik"
    assert view.default_goal > 0 and view.default_reward  # cafe default


def test_resolve_expired_raises_gone_and_marks_expired():
    b = draft()
    invite, raw = ps.generate_pitch_invite(b)
    invite.expires_at = timezone.now() - timedelta(days=1)
    invite.save(update_fields=["expires_at"])
    with pytest.raises(JaqynAPIException) as exc:
        ps.resolve_pitch(raw)
    assert exc.value.status_code == 410
    invite.refresh_from_db()
    assert invite.status == PitchInvite.Status.EXPIRED


def test_resolve_claimed_raises_gone():
    b = draft()
    invite, raw = ps.generate_pitch_invite(b)
    invite.status = PitchInvite.Status.CLAIMED
    invite.save(update_fields=["status"])
    with pytest.raises(JaqynAPIException):
        ps.resolve_pitch(raw)


def test_request_code_caches_and_claim_succeeds():
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    ps.resolve_pitch(raw)
    ps.request_pitch_code(raw, "owner@bublik.kg", ip_address="1.1.1.1")
    code = cache.get(ps._pitch_otp_key(raw))["code"]
    result = ps.claim_pitch(raw, "owner@bublik.kg", code, goal=8, reward_text="кофе")
    assert result.access and result.refresh
    b.refresh_from_db()
    assert b.owner is not None
    assert b.owner.role == User.Role.BUSINESS_OWNER
    assert b.onboarding_status == Business.OnboardingStatus.IN_PROGRESS
    inv = PitchInvite.objects.get(business=b)
    assert inv.status == PitchInvite.Status.CLAIMED
    assert inv.chosen_goal == 8 and inv.chosen_reward_text == "кофе"


def test_claim_wrong_code_raises():
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    ps.request_pitch_code(raw, "o@b.kg", None)
    with pytest.raises(JaqynAPIException) as exc:
        ps.claim_pitch(raw, "o@b.kg", "000000", goal=5, reward_text="кофе")
    assert exc.value.status_code == 400


def test_double_claim_rejected():
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    ps.request_pitch_code(raw, "o@b.kg", None)
    code = cache.get(ps._pitch_otp_key(raw))["code"]
    ps.claim_pitch(raw, "o@b.kg", code, goal=5, reward_text="кофе")
    with pytest.raises(JaqynAPIException) as exc:
        ps.claim_pitch(raw, "o@b.kg", code, goal=5, reward_text="кофе")
    # Second claim hits the CLAIMED guard before the OTP check → 410 Gone.
    assert exc.value.status_code == 410


def test_claim_email_already_owns_business_conflicts():
    other = draft("Other")
    owner = User.objects.create(phone="+996700000009", email="taken@b.kg",
                                role=User.Role.BUSINESS_OWNER)
    other.owner = owner
    other.save(update_fields=["owner"])
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    ps.request_pitch_code(raw, "taken@b.kg", None)
    code = cache.get(ps._pitch_otp_key(raw))["code"]
    with pytest.raises(JaqynAPIException) as exc:
        ps.claim_pitch(raw, "taken@b.kg", code, goal=5, reward_text="кофе")
    assert exc.value.status_code == 409
