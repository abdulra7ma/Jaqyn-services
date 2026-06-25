"""Tests for the business lead submission, approve-email flow, and invite task.

Covers spec §9:
- register-lead endpoint: happy path (201, PENDING, owner-less, pending_owner_*),
  bad payload (400), throttle class present.
- approve_business: pending email + no owner → exactly one PENDING invite +
  send_owner_invite_email enqueued; re-approve → no second invite; owner-already-set
  → no invite.
- Task: activation URL contains the token; email sent to invite.email.
"""
import pytest
from django.core import mail
from unittest.mock import patch

from apps.businesses.models import Business, BusinessOwnerInvite
from apps.businesses.onboarding_services import generate_owner_invite
from apps.businesses.services import approve_business
from apps.businesses.tasks import send_owner_invite_email
from apps.businesses.views import BusinessLeadCreateView
from rest_framework.throttling import ScopedRateThrottle

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def lead_payload(**overrides):
    base = {
        "name": "Manas Coffee",
        "owner_name": "Nurlan Asanov",
        "email": "nurlan@manas.kg",
        "phone": "+996700123456",
        "category": "cafe",
        "area": "Bishkek Centre",
        "instagram_url": "@manas_coffee",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# register-lead endpoint
# ---------------------------------------------------------------------------


class TestBusinessLeadCreateView:
    def test_anon_happy_path_creates_pending_ownerless_business(self, api_client):
        """POST /api/businesses/register-lead/ → 201 + PENDING Business with no owner."""
        res = api_client.post(
            "/api/businesses/register-lead/",
            lead_payload(),
            format="json",
        )

        assert res.status_code == 201
        business_id = res.data["data"]["id"]
        business = Business.objects.get(id=business_id)

        assert business.status == Business.Status.PENDING
        assert business.owner_id is None
        assert business.pending_owner_name == "Nurlan Asanov"
        assert business.pending_owner_email == "nurlan@manas.kg"
        assert business.name == "Manas Coffee"
        assert business.category == "cafe"
        assert business.phone == "+996700123456"
        assert business.area == "Bishkek Centre"

    def test_unknown_category_falls_back_to_other(self, api_client):
        """Categories not in Business.Category choices map to OTHER."""
        res = api_client.post(
            "/api/businesses/register-lead/",
            lead_payload(category="spaceship"),
            format="json",
        )

        assert res.status_code == 201
        business = Business.objects.get(id=res.data["data"]["id"])
        assert business.category == Business.Category.OTHER

    def test_landing_category_labels_map_to_choices(self, api_client):
        """The landing select's human labels (any casing) map to Business.Category.

        Landing offers labels that aren't 1:1 with our choices — "Salon"→beauty,
        "Barbershop"→barber, "Boutique"→retail, "Gym"→other — and they arrive
        capitalised. Each must land on the right choice, not silently fall to OTHER.
        """
        cases = {
            "Cafe": Business.Category.CAFE,
            "Restaurant": Business.Category.RESTAURANT,
            "Salon": Business.Category.BEAUTY,
            "Barbershop": Business.Category.BARBER,
            "Bakery": Business.Category.BAKERY,
            "Boutique": Business.Category.RETAIL,
            "Gym": Business.Category.OTHER,
        }
        for label, expected in cases.items():
            res = api_client.post(
                "/api/businesses/register-lead/",
                lead_payload(category=label, name=f"Biz {label}"),
                format="json",
            )
            assert res.status_code == 201, label
            business = Business.objects.get(id=res.data["data"]["id"])
            assert business.category == expected, f"{label} -> {business.category}, want {expected}"

    def test_missing_required_fields_returns_400(self, api_client):
        """Omitting required fields → 400 validation error."""
        res = api_client.post(
            "/api/businesses/register-lead/",
            {"name": "Only Name"},
            format="json",
        )
        assert res.status_code == 400

    def test_invalid_email_returns_400(self, api_client):
        """Malformed email → 400 validation error."""
        res = api_client.post(
            "/api/businesses/register-lead/",
            lead_payload(email="not-an-email"),
            format="json",
        )
        assert res.status_code == 400

    def test_view_uses_scoped_rate_throttle(self):
        """BusinessLeadCreateView uses ScopedRateThrottle with scope business_lead."""
        view = BusinessLeadCreateView()
        throttles = view.get_throttles()
        assert any(isinstance(t, ScopedRateThrottle) for t in throttles)
        assert view.throttle_scope == "business_lead"

    def test_optional_fields_can_be_omitted(self, api_client):
        """category, area, instagram_url are optional; submission still succeeds."""
        payload = {
            "name": "Bare Minimum",
            "owner_name": "Test Owner",
            "email": "test@min.kg",
            "phone": "+996700000001",
        }
        res = api_client.post("/api/businesses/register-lead/", payload, format="json")
        assert res.status_code == 201

    def test_malformed_phone_rejected(self, api_client):
        """Phone numbers that don't match E.164-ish format are rejected at the API boundary.

        Compound values like '+996+996...' or alphabetic garbage must be rejected
        by the RegexValidator on BusinessLeadSerializer.phone before any DB write.
        """
        bad_phones = [
            "+996+996700123456",  # compound: double prefix
            "abc1234567",         # alphabetic characters
            "123",                # too short (< 7 digits)
            "+1234567890123456",  # too long (> 15 digits)
        ]
        for bad in bad_phones:
            res = api_client.post(
                "/api/businesses/register-lead/",
                lead_payload(phone=bad),
                format="json",
            )
            assert res.status_code == 400, f"Expected 400 for phone={bad!r}, got {res.status_code}"


# ---------------------------------------------------------------------------
# approve_business — invite creation
# ---------------------------------------------------------------------------


class TestApproveBusinessInvite:
    def _pending_lead_business(self):
        return Business.objects.create(
            name="Manas Coffee",
            category="cafe",
            pending_owner_name="Nurlan",
            pending_owner_email="nurlan@manas.kg",
            status=Business.Status.PENDING,
        )

    def test_approve_with_pending_email_creates_one_invite_and_enqueues_task(self):
        """approve_business: pending email + no owner → 1 PENDING invite + task scheduled.

        transaction.on_commit does not fire inside a test's savepoint, so we
        patch it to call the callback immediately — this keeps the assertion
        inside the test scope while still proving the on_commit wiring exists.
        """
        business = self._pending_lead_business()

        with patch("apps.businesses.tasks.send_owner_invite_email.delay") as mock_delay, \
             patch("django.db.transaction.on_commit", side_effect=lambda fn: fn()):
            approve_business(business)

        invites = BusinessOwnerInvite.objects.filter(
            business=business,
            status=BusinessOwnerInvite.Status.PENDING,
        )
        assert invites.count() == 1
        invite = invites.first()
        assert invite.email == "nurlan@manas.kg"
        mock_delay.assert_called_once()
        call_args = mock_delay.call_args[0]
        assert call_args[0] == str(invite.id)  # first arg is invite_id
        # raw token is the second arg — don't assert its value, just that it's present
        assert call_args[1]

    def test_re_approve_does_not_create_second_invite(self):
        """Calling approve_business twice creates exactly one PENDING invite (idempotent)."""
        business = self._pending_lead_business()

        with patch("apps.businesses.tasks.send_owner_invite_email.delay"):
            approve_business(business)
            approve_business(business)

        assert BusinessOwnerInvite.objects.filter(business=business).count() == 1

    def test_approve_with_existing_owner_creates_no_invite(self):
        """approve_business: business already has an owner → no invite created."""
        from apps.accounts.models import User

        owner = User.objects.create_user(phone="+996700111001", role=User.Role.BUSINESS_OWNER)
        business = Business.objects.create(
            name="Owner Already Set",
            category="cafe",
            owner=owner,
            pending_owner_email="also@here.kg",
            status=Business.Status.PENDING,
        )

        with patch("apps.businesses.tasks.send_owner_invite_email.delay") as mock_delay:
            approve_business(business)

        assert BusinessOwnerInvite.objects.filter(business=business).count() == 0
        mock_delay.assert_not_called()

    def test_approve_without_pending_email_creates_no_invite(self):
        """approve_business: no pending_owner_email → no invite created (in-app registration)."""
        business = Business.objects.create(
            name="No Email Business",
            category="cafe",
            status=Business.Status.PENDING,
        )

        with patch("apps.businesses.tasks.send_owner_invite_email.delay") as mock_delay:
            approve_business(business)

        assert BusinessOwnerInvite.objects.filter(business=business).count() == 0
        mock_delay.assert_not_called()


# ---------------------------------------------------------------------------
# send_owner_invite_email task
# ---------------------------------------------------------------------------


class TestSendOwnerInviteEmailTask:
    def _setup_invite(self):
        business = Business.objects.create(
            name="Task Test Cafe",
            category="cafe",
            pending_owner_name="Aizat",
            pending_owner_email="aizat@cafe.kg",
        )
        invite, raw = generate_owner_invite(business, email="aizat@cafe.kg")
        return invite, raw, business

    def test_task_sends_email_to_invite_address(self, settings):
        """send_owner_invite_email sends one email to invite.email."""
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        settings.FRONTEND_URL = "http://localhost:3000"
        invite, raw, business = self._setup_invite()

        send_owner_invite_email(invite_id=str(invite.id), raw_token=raw)

        assert len(mail.outbox) == 1
        sent = mail.outbox[0]
        assert sent.to == ["aizat@cafe.kg"]

    def test_task_activation_url_contains_token(self, settings):
        """send_owner_invite_email builds activation URL with the raw token."""
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        settings.FRONTEND_URL = "http://localhost:3000"
        invite, raw, business = self._setup_invite()

        send_owner_invite_email(invite_id=str(invite.id), raw_token=raw)

        sent = mail.outbox[0]
        expected_url = f"http://localhost:3000/business/activate?token={raw}"
        # Check both text and html bodies
        assert expected_url in sent.body
        html_body = sent.alternatives[0][0]
        assert expected_url in html_body

    def test_task_is_noop_for_accepted_invite(self, settings):
        """send_owner_invite_email does nothing if the invite is no longer PENDING."""
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        settings.FRONTEND_URL = "http://localhost:3000"
        invite, raw, _ = self._setup_invite()
        invite.status = BusinessOwnerInvite.Status.ACCEPTED
        invite.save(update_fields=["status", "updated_at"])

        send_owner_invite_email(invite_id=str(invite.id), raw_token=raw)

        assert len(mail.outbox) == 0

    def test_task_subject_contains_business_name(self, settings):
        """Email subject includes the business name."""
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        settings.FRONTEND_URL = "http://localhost:3000"
        invite, raw, business = self._setup_invite()

        send_owner_invite_email(invite_id=str(invite.id), raw_token=raw)

        assert business.name in mail.outbox[0].subject
