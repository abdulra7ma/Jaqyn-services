import pytest
from django.core.cache import cache

from apps.businesses.models import Business
from apps.businesses import pitch_services as ps

pytestmark = pytest.mark.django_db


def draft():
    return Business.objects.create(
        name="Bublik", category="cafe",
        onboarding_status=Business.OnboardingStatus.NOT_STARTED,
    )


def test_resolve_returns_business_and_defaults(api_client):
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    res = api_client.get(f"/api/pitch/{raw}/")
    assert res.status_code == 200
    data = res.data["data"]
    assert data["business_name"] == "Bublik"
    assert data["default_goal"] > 0
    assert "published_count" in data


def test_resolve_unknown_token_404(api_client):
    res = api_client.get("/api/pitch/nope/")
    assert res.status_code == 404


def test_claim_flow_end_to_end(api_client):
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    r1 = api_client.post(f"/api/pitch/{raw}/claim/", {"email": "o@bublik.kg"}, format="json")
    assert r1.status_code == 200
    code = cache.get(ps._pitch_otp_key(raw))["code"]
    r2 = api_client.post(
        f"/api/pitch/{raw}/verify/",
        {"email": "o@bublik.kg", "code": code, "goal": 8, "reward_text": "кофе"},
        format="json",
    )
    assert r2.status_code == 200
    assert r2.data["data"]["access"]
    b.refresh_from_db()
    assert b.owner is not None


def test_verify_wrong_code_400(api_client):
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    api_client.post(f"/api/pitch/{raw}/claim/", {"email": "o@b.kg"}, format="json")
    res = api_client.post(
        f"/api/pitch/{raw}/verify/",
        {"email": "o@b.kg", "code": "000000", "goal": 5, "reward_text": "кофе"},
        format="json",
    )
    assert res.status_code == 400


def test_verify_missing_fields_400(api_client):
    b = draft()
    _, raw = ps.generate_pitch_invite(b)
    res = api_client.post(f"/api/pitch/{raw}/verify/", {"email": "o@b.kg"}, format="json")
    assert res.status_code == 400  # serializer rejects missing code/goal/reward_text
