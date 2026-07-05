from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from core.email_i18n import FOOTER_STRINGS, resolve_language


def branding_context(language: str) -> dict[str, str]:
    """Site-wide branding vars for the shared email layout (templates/emails/_base.*).

    Reads the admin-editable SystemConfiguration singleton (System → System
    configuration) so support contact / social links can change without a
    deploy, and adds the footer copy in the caller's resolved language.
    """
    from apps.system.models import SystemConfiguration

    config = SystemConfiguration.load()
    lang = resolve_language(language)
    return {
        "email_language": lang,
        "support_email": config.support_email,
        "instagram_url": config.instagram_url,
        "telegram_url": config.telegram_url,
        "footer_questions": FOOTER_STRINGS[lang]["questions"],
    }


def send_branded_email(*, subject: str, to: str, template_base: str, language: str, context: dict) -> None:
    """Render `{template_base}.txt`/`.html` with branding_context() merged in and send.

    `template_base` templates are expected to extend templates/emails/_base.txt
    and _base.html so every outgoing email shares the same layout, colors, and
    footer (site branding + support email + socials from SystemConfiguration).
    """
    ctx = {**branding_context(language), **context}
    text_body = render_to_string(f"{template_base}.txt", ctx)
    html_body = render_to_string(f"{template_base}.html", ctx)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send()
