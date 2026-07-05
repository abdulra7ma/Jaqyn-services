"""Tests for per-recipient email language resolution.

Covers: issue_email_otp / issue_password_reset_otp resolve the language passed
to their Celery tasks — an existing account's saved CustomerProfile.language
wins over the client-supplied language, an unsupported/missing language falls
back to ru, and the OTP tasks actually render the subject in that language.
"""
import pytest
from unittest.mock import patch
from django.core import mail

from apps.accounts.models import CustomerProfile, User
from apps.accounts.services import issue_email_otp, issue_password_reset_otp
from apps.accounts.tasks import send_email_otp_task

pytestmark = pytest.mark.django_db


def test_issue_email_otp_uses_requested_language_for_new_signup():
    with patch("apps.accounts.tasks.send_email_otp_task.delay") as delay:
        issue_email_otp("new@example.com", "1.2.3.4", "en")

    delay.assert_called_once()
    args = delay.call_args[0]
    assert args[0] == "new@example.com"
    assert args[2] == "en"


def test_issue_email_otp_prefers_existing_users_saved_language():
    user = User.objects.create(email="existing@example.com", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user, language=CustomerProfile.Language.KY)

    with patch("apps.accounts.tasks.send_email_otp_task.delay") as delay:
        # Client is currently displaying "en", but the saved profile (ky) wins.
        issue_email_otp("existing@example.com", "1.2.3.4", "en")

    args = delay.call_args[0]
    assert args[2] == "ky"


def test_issue_email_otp_falls_back_to_ru_for_unsupported_language():
    with patch("apps.accounts.tasks.send_email_otp_task.delay") as delay:
        issue_email_otp("new2@example.com", "1.2.3.4", "fr")

    args = delay.call_args[0]
    assert args[2] == "ru"


def test_issue_password_reset_otp_prefers_existing_users_saved_language():
    user = User.objects.create(email="pwreset@example.com", role=User.Role.CUSTOMER)
    user.set_password("oldpassword")
    user.save()
    CustomerProfile.objects.create(user=user, language=CustomerProfile.Language.EN)

    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay") as delay:
        issue_password_reset_otp("pwreset@example.com", "1.2.3.4", "ru")

    args = delay.call_args[0]
    assert args[2] == "en"


def test_send_email_otp_task_renders_subject_in_requested_language(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

    send_email_otp_task("user@example.com", "123456", "ky")

    assert len(mail.outbox) == 1
    assert mail.outbox[0].subject == "Jaqyn текшерүү коду"
    assert "123456" in mail.outbox[0].body
