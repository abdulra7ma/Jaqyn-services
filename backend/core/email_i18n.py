"""Per-language copy for transactional emails.

Mirrors the flat-dict pattern in frontend/packages/i18n/src/locales.ts rather
than Django's gettext machinery — there is no .po/.mo pipeline in this repo,
and these are the only three translated surfaces on the backend. Supported
codes match apps.accounts.models.CustomerProfile.Language (ru/en/ky); ru is
the platform default (CustomerProfile.Language.RU, frontend DEFAULT_LOCALE).
"""

from typing import TypedDict

DEFAULT_LANGUAGE = "ru"
SUPPORTED_LANGUAGES = ("ru", "en", "ky")


def resolve_language(language: str | None) -> str:
    """Fall back to DEFAULT_LANGUAGE for anything not in SUPPORTED_LANGUAGES."""
    if language in SUPPORTED_LANGUAGES:
        return language
    return DEFAULT_LANGUAGE


class FooterStrings(TypedDict):
    questions: str


FOOTER_STRINGS: dict[str, FooterStrings] = {
    "en": {"questions": "Questions? Write to us:"},
    "ru": {"questions": "Есть вопросы? Напишите нам:"},
    "ky": {"questions": "Суроолор барбы? Бизге жазыңыз:"},
}


class OTPEmailStrings(TypedDict):
    subject: str
    intro: str
    expiry: str
    ignore: str


OTP_EMAIL_STRINGS: dict[str, OTPEmailStrings] = {
    "en": {
        "subject": "Your Jaqyn verification code",
        "intro": "Your Jaqyn verification code is:",
        "expiry": "This code expires in {minutes} minutes.",
        "ignore": "If you did not request this, you can ignore this email.",
    },
    "ru": {
        "subject": "Ваш код подтверждения Jaqyn",
        "intro": "Ваш код подтверждения Jaqyn:",
        "expiry": "Код действителен {minutes} мин.",
        "ignore": "Если вы не запрашивали код, просто проигнорируйте это письмо.",
    },
    "ky": {
        "subject": "Jaqyn текшерүү коду",
        "intro": "Сиздин Jaqyn текшерүү кодуңуз:",
        "expiry": "Код {minutes} мүнөттөн кийин жарактан чыгат.",
        "ignore": "Эгер бул кодду сураган жок болсоңуз, бул катты этибарга албай коюңуз.",
    },
}


class PasswordResetEmailStrings(TypedDict):
    subject: str
    intro: str
    expiry: str
    ignore: str


PASSWORD_RESET_EMAIL_STRINGS: dict[str, PasswordResetEmailStrings] = {
    "en": {
        "subject": "Your Jaqyn password reset code",
        "intro": "Your Jaqyn password reset code is:",
        "expiry": "This code expires in {minutes} minutes.",
        "ignore": "If you did not request this, you can ignore this email.",
    },
    "ru": {
        "subject": "Код сброса пароля Jaqyn",
        "intro": "Ваш код для сброса пароля Jaqyn:",
        "expiry": "Код действителен {minutes} мин.",
        "ignore": "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.",
    },
    "ky": {
        "subject": "Jaqyn сырсөздү калыбына келтирүү коду",
        "intro": "Сырсөздү калыбына келтирүү кодуңуз:",
        "expiry": "Код {minutes} мүнөттөн кийин жарактан чыгат.",
        "ignore": "Эгер сырсөздү калыбына келтирүүнү сураган жок болсоңуз, бул катты этибарга албай коюңуз.",
    },
}


class OwnerInviteEmailStrings(TypedDict):
    subject: str
    greeting: str
    body1: str
    body2: str
    button: str
    expiry: str
    footer_fallback: str
    greeting_txt: str
    body1_txt: str
    cta_txt: str
    expiry_txt: str
    sign_off: str


OWNER_INVITE_EMAIL_STRINGS: dict[str, OwnerInviteEmailStrings] = {
    "en": {
        "subject": "You're invited to set up {business_name} on Jaqyn",
        "greeting": "Welcome, {owner_name}!",
        "body1": (
            "You've been invited to set up <strong>{business_name}</strong> on Jaqyn — "
            "a loyalty platform that helps your customers keep coming back."
        ),
        "body2": "Click the button below to create your account and complete your business profile:",
        "button": "Activate my account",
        "expiry": (
            "This invitation expires in <strong>{expires_days} days</strong>. "
            "If you did not expect this email, you can safely ignore it."
        ),
        "footer_fallback": "If the button above doesn't work, copy and paste this link into your browser:",
        "greeting_txt": "Hi {owner_name},",
        "body1_txt": (
            "You've been invited to set up {business_name} on Jaqyn — a loyalty "
            "platform that helps your customers keep coming back."
        ),
        "cta_txt": "Click the link below to create your account and complete onboarding:",
        "expiry_txt": (
            "This link expires in {expires_days} days. If you did not expect this "
            "invitation, you can ignore this email."
        ),
        "sign_off": "— The Jaqyn Team",
    },
    "ru": {
        "subject": "Вас пригласили настроить {business_name} в Jaqyn",
        "greeting": "Добро пожаловать, {owner_name}!",
        "body1": (
            "Вас пригласили настроить <strong>{business_name}</strong> в Jaqyn — "
            "платформе лояльности, которая помогает вашим клиентам возвращаться снова."
        ),
        "body2": "Нажмите кнопку ниже, чтобы создать аккаунт и заполнить профиль бизнеса:",
        "button": "Активировать аккаунт",
        "expiry": (
            "Приглашение действует <strong>{expires_days} дней</strong>. "
            "Если вы не ожидали это письмо, просто проигнорируйте его."
        ),
        "footer_fallback": "Если кнопка не работает, скопируйте и вставьте эту ссылку в браузер:",
        "greeting_txt": "Здравствуйте, {owner_name},",
        "body1_txt": (
            "Вас пригласили настроить {business_name} в Jaqyn — платформе лояльности, "
            "которая помогает вашим клиентам возвращаться снова."
        ),
        "cta_txt": "Перейдите по ссылке ниже, чтобы создать аккаунт и завершить настройку:",
        "expiry_txt": (
            "Ссылка действует {expires_days} дней. Если вы не ожидали это приглашение, "
            "просто проигнорируйте это письмо."
        ),
        "sign_off": "— Команда Jaqyn",
    },
    "ky": {
        "subject": "Сизди {business_name} бизнесин Jaqyn'да тууралоого чакырышты",
        "greeting": "Кош келиңиз, {owner_name}!",
        "body1": (
            "Сиз <strong>{business_name}</strong> бизнесин Jaqyn'да тууралоого чакырылдыңыз — "
            "бул кардарларыңызды кайра-кайра келтирүүгө жардам берген лоялдуулук платформасы."
        ),
        "body2": "Аккаунтуңузду түзүп, бизнес профилиңизди толтуруу үчүн төмөнкү баскычты басыңыз:",
        "button": "Аккаунтту активдештирүү",
        "expiry": (
            "Бул чакыруу <strong>{expires_days} күн</strong> ичинде жарактуу. "
            "Эгер бул катты күтпөсөңүз, аны этибарга албай коюңуз."
        ),
        "footer_fallback": "Эгер баскыч иштебесе, бул шилтемени көчүрүп, серепчиге чаптаңыз:",
        "greeting_txt": "Салам, {owner_name},",
        "body1_txt": (
            "Сиз {business_name} бизнесин Jaqyn'да тууралоого чакырылдыңыз — бул кардарларыңызды "
            "кайра-кайра келтирүүгө жардам берген лоялдуулук платформасы."
        ),
        "cta_txt": "Аккаунтуңузду түзүп, катталууну аяктоо үчүн төмөнкү шилтемени басыңыз:",
        "expiry_txt": (
            "Бул шилтеме {expires_days} күн ичинде жарактуу. Эгер бул чакырууну "
            "күтпөсөңүз, бул катты этибарга албай коюңуз."
        ),
        "sign_off": "— Jaqyn командасы",
    },
}
