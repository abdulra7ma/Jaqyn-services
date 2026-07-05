"""Verify the current email setup (SMTP or Resend/Anymail) can send.

Prints backend + config, probes connectivity, optionally sends a real
test message.

Usage:
    python manage.py check_email
    python manage.py check_email --send-to you@example.com
"""

from __future__ import annotations

from django.conf import settings
from django.core.mail import get_connection, send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Probe the configured email backend (SMTP or Resend) and optionally send a test email."""

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
        from_email = settings.DEFAULT_FROM_EMAIL

        self.stdout.write(f"Backend    : {backend}")
        self.stdout.write(f"From       : {from_email}")

        is_anymail = "anymail" in backend
        if is_anymail:
            api_key = getattr(settings, "ANYMAIL", {}).get("RESEND_API_KEY", "")
            self.stdout.write(
                f"RESEND_API_KEY : {'set (' + str(len(api_key)) + ' chars)' if api_key else 'MISSING'}"
            )
        else:
            host = getattr(settings, "EMAIL_HOST", "—")
            port = getattr(settings, "EMAIL_PORT", "—")
            user = getattr(settings, "EMAIL_HOST_USER", "") or "(none)"
            use_tls = getattr(settings, "EMAIL_USE_TLS", False)
            self.stdout.write(f"Host       : {host}:{port}")
            self.stdout.write(f"TLS        : {use_tls}")
            self.stdout.write(f"User       : {user}")
        self.stdout.write("")

        if "console" in backend or "dummy" in backend or "memory" in backend:
            self.stdout.write(
                self.style.WARNING(
                    f"Backend is {backend!r} — no real connection is made."
                )
            )
            return

        if is_anymail and not getattr(settings, "ANYMAIL", {}).get(
            "RESEND_API_KEY", ""
        ):
            raise CommandError("RESEND_API_KEY is not set — sending will fail.")

        if is_anymail:
            # Anymail's API backends have no persistent connection to probe;
            # skip straight to a send attempt below.
            self.stdout.write(self.style.SUCCESS("Config OK — API key present."))
        else:
            try:
                conn = get_connection()
                conn.open()
                conn.close()
            except Exception as exc:
                raise CommandError(f"Connection failed: {exc}") from exc

            self.stdout.write(self.style.SUCCESS("Connection OK."))

        send_to: str = options["send_to"]
        if not send_to:
            self.stdout.write(
                self.style.WARNING(
                    "No --send-to given — skipped actually sending a message."
                )
            )
            return

        try:
            send_mail(
                subject="[Jaqyn] Email backend test",
                message="This is an automated test from manage.py check_email.",
                from_email=from_email,
                recipient_list=[send_to],
                fail_silently=False,
            )
        except Exception as exc:
            raise CommandError(f"Send failed: {exc}") from exc

        self.stdout.write(self.style.SUCCESS(f"Test email sent to {send_to}."))
