"""Security-hardening regression tests (auth surface).

Covers:
- the SMS OTP code is never written to logs (and the DEBUG breadcrumb masks the phone);
- ``mask_identifier`` output shapes;
- signup events carry masked identifiers, never raw PII;
- the 60s per-identifier resend cooldown on all three OTP issue paths;
- scoped DRF throttles (auth_otp_request, auth_login) return 429 over the limit.
"""

import logging
from unittest.mock import patch

import pytest
from django.core.cache import cache

from apps.accounts.services import (
    issue_email_otp,
    issue_otp,
    issue_password_reset_otp,
    mask_identifier,
    otp_key,
    verify_otp,
)
from core.exceptions import JaqynAPIException


# --- A1: OTP code never logged -------------------------------------------------


@pytest.mark.django_db
def test_sms_otp_code_is_never_logged(caplog, api_client):
    phone = "+996700555001"
    with caplog.at_level(logging.DEBUG):
        res = api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    assert res.status_code == 200
    code = cache.get(otp_key(phone))["code"]
    assert code not in caplog.text


@pytest.mark.django_db
def test_sms_otp_debug_log_masks_phone_and_omits_code(caplog, api_client, settings):
    settings.DEBUG = True
    phone = "+996700555002"
    with caplog.at_level(logging.DEBUG):
        res = api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    assert res.status_code == 200
    code = cache.get(otp_key(phone))["code"]
    assert code not in caplog.text
    assert phone not in caplog.text


# --- A4: identifier masking ----------------------------------------------------


def test_mask_identifier_phone_keeps_prefix_and_last_four():
    assert mask_identifier("+996700123456") == "+996***3456"


def test_mask_identifier_short_phone_keeps_only_last_four():
    assert mask_identifier("12345678") == "***5678"


def test_mask_identifier_email_masks_local_part_keeps_domain():
    assert mask_identifier("dawoud@gmail.com") == "***woud@gmail.com"


def test_mask_identifier_short_email_local_part_keeps_one_char():
    assert mask_identifier("ab@x.com") == "***b@x.com"


@pytest.mark.django_db
def test_signup_event_carries_masked_phone():
    phone = "+996700555003"
    request_id = issue_otp(phone, "9.9.9.9")
    assert request_id
    code = cache.get(otp_key(phone))["code"]
    with patch("apps.accounts.services.emit_event") as emit:
        verify_otp(phone, code)
    assert emit.call_count == 1
    assert emit.call_args.kwargs["phone"] == "+996***5003"
    assert phone not in str(emit.call_args)


# --- B-extra: resend cooldown --------------------------------------------------


@pytest.mark.django_db
def test_phone_otp_second_request_within_cooldown_is_rate_limited():
    phone = "+996700555004"
    issue_otp(phone, "9.9.9.9")
    with pytest.raises(JaqynAPIException) as exc:
        issue_otp(phone, "9.9.9.9")
    assert exc.value.code == "RATE_LIMITED"
    assert exc.value.status_code == 429


@pytest.mark.django_db
def test_email_otp_second_request_within_cooldown_is_rate_limited():
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        issue_email_otp("cooldown@example.com", "1.1.1.1")
        with pytest.raises(JaqynAPIException) as exc:
            issue_email_otp("cooldown@example.com", "1.1.1.1")
    assert exc.value.code == "RATE_LIMITED"


@pytest.mark.django_db
def test_password_reset_cooldown_applies_identically_for_unknown_emails():
    # The cooldown fires before the account lookup, so a prober can't tell an
    # existing address from a ghost one by cooldown behavior.
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay"):
        issue_password_reset_otp("ghost-cooldown@example.com", "1.1.1.1")
        with pytest.raises(JaqynAPIException) as exc:
            issue_password_reset_otp("ghost-cooldown@example.com", "1.1.1.1")
    assert exc.value.code == "RATE_LIMITED"


@pytest.mark.django_db
def test_request_otp_endpoint_second_request_within_cooldown_returns_429(api_client):
    phone = "+996700555005"
    first = api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    assert first.status_code == 200
    second = api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    assert second.status_code == 429
    assert second.data["error"]["code"] == "RATE_LIMITED"


# --- Phase B: scoped throttles -------------------------------------------------


@pytest.mark.django_db
def test_auth_otp_request_throttle_429_over_limit(api_client):
    # auth_otp_request is 5/min. Distinct phones sidestep the per-phone service
    # limits and resend cooldown, so the 6th rejection can only come from the
    # scoped throttle. Cache (throttle history included) is cleared per test by
    # the global cache_isolation fixture.
    for i in range(5):
        res = api_client.post(
            "/api/auth/request-otp/", {"phone": f"+99670055510{i}"}, format="json"
        )
        assert res.status_code == 200
    res = api_client.post(
        "/api/auth/request-otp/", {"phone": "+996700555109"}, format="json"
    )
    assert res.status_code == 429
    assert res.data["error"]["code"] == "RATE_LIMITED"


@pytest.mark.django_db
def test_auth_login_throttle_429_over_limit(api_client):
    # auth_login is 10/min; failed attempts (401) count toward the throttle,
    # which is the point — credential stuffing is all failed attempts.
    payload = {"identifier": "+996700555200", "password": "wrongpass123"}
    for _ in range(10):
        res = api_client.post("/api/auth/login-password/", payload, format="json")
        assert res.status_code == 401
    res = api_client.post("/api/auth/login-password/", payload, format="json")
    assert res.status_code == 429
    assert res.data["error"]["code"] == "RATE_LIMITED"
