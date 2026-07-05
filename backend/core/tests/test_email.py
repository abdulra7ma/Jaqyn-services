"""Tests for the shared branded-email helper (core/email.py).

Covers: branding_context reads SystemConfiguration and resolves an unsupported
language to the platform default; send_branded_email renders both bodies and
sends via the standard from-address, with branding merged into the template
context (support email + socials show up in the rendered footer).
"""
import pytest
from django.core import mail

from apps.system.models import SystemConfiguration
from core.email import branding_context, send_branded_email

pytestmark = pytest.mark.django_db


def test_branding_context_reads_system_configuration():
    config = SystemConfiguration.load()
    config.support_email = "help@jaqyn.kg"
    config.instagram_url = "https://instagram.com/jaqyn.kg"
    config.telegram_url = "https://t.me/jaqyn_kg"
    config.save()

    ctx = branding_context("ru")

    assert ctx["support_email"] == "help@jaqyn.kg"
    assert ctx["instagram_url"] == "https://instagram.com/jaqyn.kg"
    assert ctx["telegram_url"] == "https://t.me/jaqyn_kg"


def test_branding_context_falls_back_to_default_language():
    ctx = branding_context("fr")  # unsupported — falls back to ru
    assert ctx["email_language"] == "ru"


def test_send_branded_email_renders_and_sends_with_footer_branding(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    config = SystemConfiguration.load()
    config.support_email = "help@jaqyn.kg"
    config.save()

    send_branded_email(
        subject="Test subject",
        to="user@example.com",
        template_base="emails/email_otp",
        language="en",
        context={
            "subject": "Test subject",
            "code": "424242",
            "intro": "Your code:",
            "expiry": "Expires in 5 minutes.",
            "ignore": "Ignore if unexpected.",
        },
    )

    assert len(mail.outbox) == 1
    sent = mail.outbox[0]
    assert sent.to == ["user@example.com"]
    assert sent.subject == "Test subject"
    assert "424242" in sent.body
    html_body = sent.alternatives[0][0]
    assert "424242" in html_body
    assert "help@jaqyn.kg" in html_body
