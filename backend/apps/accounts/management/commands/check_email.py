"""Verify SMTP connectivity using the current EMAIL_* settings.

Opens a connection, optionally sends a test message, then closes cleanly.

Usage:
    python manage.py check_email
    python manage.py check_email --send-to you@example.com
"""

from __future__ import annotations

from django.conf import settings
from django.core.mail import get_connection, send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Probe the configured SMTP backend and optionally send a test email."""

    help = "Check that the configured email backend can connect and send."

    def add_arguments(self, parser: object) -> None:
        parser.add_argument(
            "--send-to",
            dest="send_to",
            default="",
            help="If provided, send a test message to this address.",
        )

    def handle(self, *args: object, **options: object) -> None:
        backend = settings.EMAIL_BACKEND
        host = getattr(settings, "EMAIL_HOST", "—")
        port = getattr(settings, "EMAIL_PORT", "—")
        user = getattr(settings, "EMAIL_HOST_USER", "") or "(none)"
        use_tls = getattr(settings, "EMAIL_USE_TLS", False)

        self.stdout.write(f"Backend  : {backend}")
        self.stdout.write(f"Host     : {host}:{port}")
        self.stdout.write(f"TLS      : {use_tls}")
        self.stdout.write(f"User     : {user}")
        self.stdout.write("")

        if "console" in backend or "dummy" in backend or "memory" in backend:
            self.stdout.write(
                self.style.WARNING(
                    f"Backend is {backend!r} — no real connection is made."
                )
            )
            return

        try:
            conn = get_connection()
            conn.open()
            conn.close()
        except Exception as exc:
            raise CommandError(f"Connection failed: {exc}") from exc

        self.stdout.write(self.style.SUCCESS("Connection OK."))

        send_to: str = options["send_to"]
        if send_to:
            try:
                send_mail(
                    subject="[Jaqyn] SMTP test",
                    message="This is an automated connectivity test from manage.py check_email.",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[send_to],
                    fail_silently=False,
                )
            except Exception as exc:
                raise CommandError(f"Send failed: {exc}") from exc

            self.stdout.write(self.style.SUCCESS(f"Test email sent to {send_to}."))
