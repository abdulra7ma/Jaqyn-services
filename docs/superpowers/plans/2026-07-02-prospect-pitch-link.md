# Prospect Pitch Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. This plan is written for a **Sonnet** executor — follow steps exactly; the code is provided, do not improvise APIs.

**Goal:** A tokenized, personalized pitch page a founder generates from Django admin and DMs to a prospect; the prospect sees their pre-created business on a branded loyalty card, plays with it, then claims it via email + 6-digit code and lands in the business area.

**Architecture:** New `PitchInvite` model + `pitch_services.py` in `apps/businesses` (mirrors the existing `BusinessOwnerInvite`/`generate_owner_invite` pattern). Three public throttled endpoints (resolve / request-code / verify-claim). Admin gains a generate-link button + status column. Frontend adds a `pitch` resource to `@jaqyn/api` and a `/pitch/[token]` page reusing the wallet-card visuals and email-OTP two-step pattern.

**Tech Stack:** Django 5 + DRF + SimpleJWT, Redis cache for OTP, pytest. Next.js 14 App Router + TanStack Query 5 + Tailwind + framer-motion (already a dep) + Vitest.

**Design reference:** `docs/superpowers/specs/2026-07-02-prospect-pitch-link-design.md` and the approved screens (hero card w/ tap-to-stamp + reward editor, 6 feature blocks, claim sheet B/C/D, dead-link). Pixel details live there — this plan builds the behavior.

## Global Constraints

- Branch off `main`: `git checkout main && git pull && git checkout -b feat/pitch-link`. (Analytics work is on a separate unmerged branch — do NOT depend on `core.analytics`; use `emit_event` from `core.logging`, the pattern already used in `onboarding_services.py`.)
- Backend rules (`.claude/rules/backend.md`): full type hints + explicit return types; structured returns are `@dataclass`, never bare dict/tuple for domain data; docstring on every service function stating the rules it enforces; magic literals get a comment naming their origin; services raise domain exceptions (never return sentinels); views hold zero business logic; paginate/throttle; `select_for_update` on read-modify-write; `transaction.on_commit` for post-write side effects; list endpoints assert query counts.
- Frontend rules (`.claude/rules/frontend.md`): Server Components by default, `'use client'` only where needed; server state in TanStack Query with the typed key factory; no `any`; validate external data at the edge; all copy through `@jaqyn/i18n` (no hardcoded strings); Tailwind tokens from the preset (class, not hex); import shared primitives from `@jaqyn/ui`.
- Token security: store only `sha256(raw)`; return raw once; never persist raw. Reuse `hash_token` from `apps/businesses/onboarding_services.py`.
- No PII in event properties — ids/enums only.
- Conventional Commits. No `print`/`console.log`/commented-out code. Match surrounding style.

## Verified facts (from recon — trust these)

- `apps/businesses/onboarding_services.py`: `hash_token(raw) -> str` (sha256 hex); `generate_owner_invite(business, email=None, phone=None, ttl_days=OWNER_INVITE_TTL_DAYS) -> (invite, raw)` mints `secrets.token_urlsafe(32)`, stores `token_hash`, `expires_at`.
- `core.exceptions.JaqynAPIException(code=None, message=None, status_code=None, details=None)` — **positional** `(code, message, status_code)`. There are NO NotFound/Conflict subclasses; signal errors with a string code + message + `status` constant, exactly like `validate_owner_token` does (`"INVITE_NOT_FOUND"`, `status.HTTP_404_NOT_FOUND`).
- `core.logging.emit_event(event_name, **kwargs)` — structured log; used across services.
- `core.frontend.frontend_base_url() -> str` (no args) returns `settings.FRONTEND_URL` (already `rstrip('/')`).
- `core.ratelimit.hit_limit(key, limit, window_seconds) -> bool` (True = over limit); `clear_limit(key)`.
- Email OTP infra in `apps/accounts/services.py`: cache via `django.core.cache.cache`; `send_email_otp_task.delay(email, code)` from `apps/accounts/tasks.py` sends the code email; settings `OTP_TTL_SECONDS` (300), `OTP_RATE_LIMIT_PER_PHONE` (5), `OTP_RATE_LIMIT_PER_IP` (20).
- `Business`: `owner = OneToOneField(..., null=True, blank=True)`; `logo = ImageField`; `Category` TextChoices (`cafe/restaurant/barber/beauty/retail/bakery/other`); `Status` (`pending/approved/...`); `OnboardingStatus` (`not_started/in_progress/...`); `CardAccent` enum exists (client derives accent by hash, so no backend accent field needed).
- `BusinessNote.Kind` includes `STATUS_CHANGE`; `add_business_note(business, *, body, kind=..., author=None) -> BusinessNote`.
- Base models in `core/fields.py`: `UUIDModel`, `TimeStampedModel` (uuid pk + created_at/updated_at).
- Latest migration: `apps/businesses/migrations/0010_...`. New one will be `0011`.
- URLs: `config/urls.py` includes app url modules under `api/` (`path("api/", include(("apps.businesses.public_urls", "public")))`). Public pitch endpoints go in a new `apps/businesses/pitch_urls.py` included under `api/pitch/`.
- DRF throttles: scoped rates live in `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]` in `config/settings/base.py`. Add a `pitch` scope; use `ScopedRateThrottle`.
- Frontend `@jaqyn/api`: per-resource dir (`api.ts`/`hooks.ts`/`types.ts`), `qk` key factory in `customer/hooks.ts`, `api` client (`api.get/post`) in `client.ts` returning unwrapped `data`; re-exports from `src/index.ts`. `postAuthRoute(result)` routes `business_owner → /business/dashboard`.
- Frontend templates: `app/q/[token]/page.tsx` (public tokenized page), `app/signup/email/page.tsx` (email→code two-step w/ 60s resend), `app/loyalty/_lib/wallet.ts` (`cardAccent(businessId)`, `ACCENT_BG`, `CARD_ACCENTS`).
- i18n: flat keys in `packages/i18n/src/locales.ts` under `messages.ru`/`messages.en`; `useT()` from `@jaqyn/i18n`; keys namespaced (`common.*`, `auth.*`, `qr.*`, `cmp.*`).
- Vitest configured for `apps/web` (`app/**/*.test.tsx`, jsdom, mock `@jaqyn/api` at the boundary).

---

## Task 1 — `PitchInvite` model + migration

**Files:**
- Modify: `backend/apps/businesses/models.py` (append after `BusinessOwnerInvite`)
- Create: `backend/apps/businesses/migrations/0011_pitchinvite.py` (generated)

**Interfaces — Produces:**
`PitchInvite(TimeStampedModel)` with `business` FK (`related_name="pitch_invites"`), `token_hash` (unique), `status` (`PENDING/OPENED/CLAIMED/EXPIRED`), `expires_at`, `opened_at?`, `claimed_at?`, `claimed_email?`, `chosen_goal?` (int), `chosen_reward_text?` (str). Consumed by all later backend tasks.

- [ ] **Step 1: Add the model**

Append to `backend/apps/businesses/models.py` (uses the same imports already present — `models`, `TimeStampedModel`):

```python
class PitchInvite(TimeStampedModel):
    """Single-use, tokenized sales-pitch link for a pre-created prospect business.

    Mirrors BusinessOwnerInvite's token security: only sha256(raw) is stored; the
    raw token is shown once in admin and embedded in the pitch URL. Lifecycle:
    PENDING (created) -> OPENED (first resolve) -> CLAIMED (email verified). EXPIRED
    is set lazily on resolve when past expires_at. A claimed or expired invite can
    never be resolved or claimed again. `chosen_goal`/`chosen_reward_text` capture
    what the prospect configured on the card so onboarding can prefill later.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        OPENED = "opened", "Opened"
        CLAIMED = "claimed", "Claimed"
        EXPIRED = "expired", "Expired"

    business = models.ForeignKey(
        Business, on_delete=models.CASCADE, related_name="pitch_invites"
    )
    token_hash = models.CharField(max_length=128, unique=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    expires_at = models.DateTimeField()
    opened_at = models.DateTimeField(blank=True, null=True)
    claimed_at = models.DateTimeField(blank=True, null=True)
    claimed_email = models.EmailField(blank=True, null=True)
    # What the prospect set on the interactive card before claiming — carried into
    # onboarding. Nullable: they may claim without touching the editor.
    chosen_goal = models.PositiveIntegerField(blank=True, null=True)
    chosen_reward_text = models.CharField(max_length=120, blank=True, null=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"PitchInvite {self.business_id} ({self.status})"
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && python manage.py makemigrations businesses`
Expected: creates `0011_pitchinvite.py` adding one model (no changes to existing tables → non-locking).

- [ ] **Step 3: Verify it applies**

Run: `cd backend && python manage.py migrate businesses`
Expected: `Applying businesses.0011_pitchinvite... OK`.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/businesses/models.py backend/apps/businesses/migrations/0011_pitchinvite.py
git commit -m "feat(pitch): add PitchInvite model"
```

---

## Task 2 — `pitch_services.py` (generate, resolve, request-code, claim)

**Files:**
- Create: `backend/apps/businesses/pitch_services.py`
- Create: `backend/apps/businesses/tests/test_pitch_services.py`

**Interfaces — Produces (consumed by Tasks 3 & 4):**
- `PITCH_INVITE_TTL_DAYS = 30`
- `@dataclass PitchView`: `business_id: str`, `business_name: str`, `logo_path: str | None`, `category: str`, `default_goal: int`, `default_reward: str`, `published_count: int`
- `@dataclass ClaimResult`: `user`, `business`, `access: str`, `refresh: str`
- `generate_pitch_invite(business: Business, ttl_days: int = PITCH_INVITE_TTL_DAYS) -> tuple[PitchInvite, str]`
- `resolve_pitch(raw_token: str) -> tuple[PitchInvite, PitchView]`
- `request_pitch_code(raw_token: str, email: str, ip_address: str | None) -> None`
- `claim_pitch(raw_token, email, code, goal, reward_text) -> ClaimResult`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/businesses/tests/test_pitch_services.py`:

```python
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
    with pytest.raises(JaqynAPIException):
        ps.claim_pitch(raw, "o@b.kg", code, goal=5, reward_text="кофе")


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest apps/businesses/tests/test_pitch_services.py -v`
Expected: import error / failures (`pitch_services` not defined).

- [ ] **Step 3: Implement `pitch_services.py`**

```python
"""Prospect pitch-link services.

A founder pre-creates a PENDING business in admin, generates a single-use pitch
link, and DMs it to the owner. The owner resolves the link (sees their branded
card), requests a 6-digit email code, and claims the business — which attaches
them as owner, starts onboarding, and returns JWTs. Token security and email-OTP
mechanics reuse the existing owner-invite and account-OTP infrastructure.
"""
from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.tasks import send_email_otp_task
from apps.businesses.models import Business, BusinessNote, PitchInvite
from apps.businesses.onboarding_services import hash_token
from apps.businesses.services import add_business_note
from core.exceptions import JaqynAPIException
from core.logging import emit_event
from core.ratelimit import hit_limit

# A pitch link lives for a full sales cycle, not a security window — 30 days.
PITCH_INVITE_TTL_DAYS = 30
# Max wrong code entries before the code is burned (mirrors email-OTP's limit).
PITCH_OTP_MAX_ATTEMPTS = 5

# Category -> (default stamp goal, reward noun). The founder pre-picks a sensible
# program so the card is never empty; the prospect can edit it on the page.
# Sourced from the sales playbook's per-vertical defaults.
_CATEGORY_DEFAULTS: dict[str, tuple[int, str]] = {
    Business.Category.CAFE: (5, "кофе"),
    Business.Category.RESTAURANT: (6, "блюдо"),
    Business.Category.BARBER: (5, "стрижка"),
    Business.Category.BEAUTY: (5, "услуга"),
    Business.Category.BAKERY: (6, "выпечка"),
    Business.Category.RETAIL: (6, "покупка"),
    Business.Category.OTHER: (6, "награда"),
}
_DEFAULT_PROGRAM = (6, "награда")


@dataclass
class PitchView:
    business_id: str
    business_name: str
    logo_path: str | None  # storage path; the view builds the absolute URL
    category: str
    default_goal: int
    default_reward: str
    published_count: int


@dataclass
class ClaimResult:
    user: User
    business: Business
    access: str
    refresh: str


def _pitch_otp_key(raw: str) -> str:
    # Keyed by token hash (not email) so one link owns one code, isolated from
    # the signup email-OTP namespace (`email_otp:`).
    return f"pitch_otp:{hash_token(raw)}"


def _pitch_otp_attempt_key(raw: str) -> str:
    return f"pitch_otp_attempts:{hash_token(raw)}"


def generate_pitch_invite(
    business: Business, ttl_days: int = PITCH_INVITE_TTL_DAYS
) -> tuple[PitchInvite, str]:
    """Mint a single-use pitch invite for `business`. Returns (invite, raw_token).

    Only sha256(raw) is stored; the raw token is returned once for the URL and
    never persisted. Any existing unexpired-unclaimed invite for the business
    should be expired by the caller first (admin enforces one active link).
    """
    raw = secrets.token_urlsafe(32)
    invite = PitchInvite.objects.create(
        business=business,
        token_hash=hash_token(raw),
        expires_at=timezone.now() + timedelta(days=ttl_days),
    )
    emit_event("pitch_created", business_id=str(business.id), invite_id=str(invite.id))
    return invite, raw


def _load_claimable(raw: str) -> PitchInvite:
    """Fetch an invite by raw token and assert it can still be used.

    Raises PITCH_NOT_FOUND (404) if unknown, PITCH_GONE (410) if claimed or
    expired. Marks a past-due PENDING/OPENED invite EXPIRED on the way through.
    """
    invite = (
        PitchInvite.objects.filter(token_hash=hash_token(raw))
        .select_related("business")
        .first()
    )
    if invite is None:
        raise JaqynAPIException("PITCH_NOT_FOUND", "Ссылка не найдена", status.HTTP_404_NOT_FOUND)
    if invite.status == PitchInvite.Status.CLAIMED:
        raise JaqynAPIException("PITCH_GONE", "Ссылка больше не активна", status.HTTP_410_GONE)
    if invite.expires_at < timezone.now():
        if invite.status != PitchInvite.Status.EXPIRED:
            invite.status = PitchInvite.Status.EXPIRED
            invite.save(update_fields=["status", "updated_at"])
        raise JaqynAPIException("PITCH_GONE", "Ссылка больше не активна", status.HTTP_410_GONE)
    return invite


def resolve_pitch(raw_token: str) -> tuple[PitchInvite, PitchView]:
    """Resolve a pitch link into its display view; flip PENDING->OPENED once.

    Idempotent for repeat opens (stays OPENED, no duplicate event). Raises for
    unknown/claimed/expired links (see _load_claimable).
    """
    invite = _load_claimable(raw_token)
    business = invite.business
    if invite.status == PitchInvite.Status.PENDING:
        invite.status = PitchInvite.Status.OPENED
        invite.opened_at = timezone.now()
        invite.save(update_fields=["status", "opened_at", "updated_at"])
        emit_event("pitch_opened", business_id=str(business.id), invite_id=str(invite.id))
    goal, reward = _CATEGORY_DEFAULTS.get(business.category, _DEFAULT_PROGRAM)
    # Social proof: how many businesses are live. APPROVED is the launched set.
    published_count = Business.objects.filter(status=Business.Status.APPROVED).count()
    view = PitchView(
        business_id=str(business.id),
        business_name=business.name,
        logo_path=business.logo.name if business.logo else None,
        category=business.category,
        default_goal=goal,
        default_reward=reward,
        published_count=published_count,
    )
    return invite, view


def request_pitch_code(raw_token: str, email: str, ip_address: str | None) -> None:
    """Issue a 6-digit code for claiming this pitch link, emailed to `email`.

    Validates the link is still claimable, rate-limits per link and per IP
    (reusing the account OTP limits), caches the code under the link's namespace,
    and dispatches the email on commit. Raises RATE_LIMITED (429) when over limit.
    """
    _load_claimable(raw_token)
    email = email.lower()
    if hit_limit(f"pitch-otp:{hash_token(raw_token)}", settings.OTP_RATE_LIMIT_PER_PHONE, 3600):
        raise JaqynAPIException("RATE_LIMITED", "Слишком много попыток", status.HTTP_429_TOO_MANY_REQUESTS)
    if ip_address and hit_limit(f"pitch-otp-ip:{ip_address}", settings.OTP_RATE_LIMIT_PER_IP, 3600):
        raise JaqynAPIException("RATE_LIMITED", "Слишком много попыток", status.HTTP_429_TOO_MANY_REQUESTS)
    code = f"{secrets.randbelow(1000000):06d}"  # 6-digit, zero-padded
    cache.set(_pitch_otp_key(raw_token), {"code": code, "email": email}, settings.OTP_TTL_SECONDS)
    cache.delete(_pitch_otp_attempt_key(raw_token))
    transaction.on_commit(lambda: send_email_otp_task.delay(email, code))
    emit_event("pitch_code_requested", token_hash=hash_token(raw_token))


def claim_pitch(
    raw_token: str, email: str, code: str, goal: int, reward_text: str
) -> ClaimResult:
    """Verify the code and claim the business for the prospect.

    Under a row lock on the invite: validate the code (expiry + attempt limit),
    get-or-create the user as BUSINESS_OWNER (unusable password — set later),
    attach them as owner, move onboarding to IN_PROGRESS, record the chosen
    program + a STATUS_CHANGE note, and mark the invite CLAIMED. Returns JWTs.
    Raises OTP_EXPIRED/INVALID_OTP/RATE_LIMITED (400/429), PITCH_GONE (410) on a
    re-claim, and PITCH_OWNER_EXISTS (409) if the email already owns a business.
    """
    email = email.lower()
    with transaction.atomic():
        invite = (
            PitchInvite.objects.select_for_update()
            .select_related("business")
            .filter(token_hash=hash_token(raw_token))
            .first()
        )
        if invite is None:
            raise JaqynAPIException("PITCH_NOT_FOUND", "Ссылка не найдена", status.HTTP_404_NOT_FOUND)
        if invite.status == PitchInvite.Status.CLAIMED:
            raise JaqynAPIException("PITCH_GONE", "Ссылка больше не активна", status.HTTP_410_GONE)
        if invite.expires_at < timezone.now():
            invite.status = PitchInvite.Status.EXPIRED
            invite.save(update_fields=["status", "updated_at"])
            raise JaqynAPIException("PITCH_GONE", "Ссылка больше не активна", status.HTTP_410_GONE)

        payload = cache.get(_pitch_otp_key(raw_token))
        if not payload:
            raise JaqynAPIException("OTP_EXPIRED", "Код истёк", status.HTTP_400_BAD_REQUEST)
        attempts = cache.get(_pitch_otp_attempt_key(raw_token), 0) + 1
        cache.set(_pitch_otp_attempt_key(raw_token), attempts, settings.OTP_TTL_SECONDS)
        if attempts > PITCH_OTP_MAX_ATTEMPTS:
            raise JaqynAPIException("RATE_LIMITED", "Слишком много попыток", status.HTTP_429_TOO_MANY_REQUESTS)
        if payload["code"] != code:
            raise JaqynAPIException("INVALID_OTP", "Неверный код", status.HTTP_400_BAD_REQUEST)

        business = invite.business
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            # phone is the unique USERNAME_FIELD; synthesize a placeholder for an
            # email-only owner (same trick as activate_owner). No usable password
            # until they set one during onboarding.
            user = User(
                phone=f"owner-{uuid.uuid4().hex[:12]}",
                email=email,
                role=User.Role.BUSINESS_OWNER,
            )
            user.set_unusable_password()
            user.is_email_verified = True
            user.save()
        elif getattr(user, "owned_business", None) is not None:
            raise JaqynAPIException(
                "PITCH_OWNER_EXISTS", "Этот email уже владеет бизнесом", status.HTTP_409_CONFLICT
            )
        else:
            user.role = User.Role.BUSINESS_OWNER
            user.is_email_verified = True
            user.save(update_fields=["role", "is_email_verified", "updated_at"])

        business.owner = user
        if business.onboarding_status == Business.OnboardingStatus.NOT_STARTED:
            business.onboarding_status = Business.OnboardingStatus.IN_PROGRESS
        business.save(update_fields=["owner", "onboarding_status", "updated_at"])

        # Begin the trial exactly as admin approval does (idempotent).
        from apps.businesses.trial_services import start_trial

        start_trial(business)

        invite.status = PitchInvite.Status.CLAIMED
        invite.claimed_at = timezone.now()
        invite.claimed_email = email
        invite.chosen_goal = goal
        invite.chosen_reward_text = reward_text
        invite.save(update_fields=[
            "status", "claimed_at", "claimed_email",
            "chosen_goal", "chosen_reward_text", "updated_at",
        ])
        add_business_note(
            business,
            body=f"Бизнес забран через pitch-ссылку ({email})",
            kind=BusinessNote.Kind.STATUS_CHANGE,
        )

    cache.delete(_pitch_otp_key(raw_token))
    cache.delete(_pitch_otp_attempt_key(raw_token))
    emit_event("pitch_claimed", business_id=str(business.id), user_id=str(user.id))
    refresh = RefreshToken.for_user(user)
    return ClaimResult(user=user, business=business, access=str(refresh.access_token), refresh=str(refresh))
```

Note for the executor: verify `start_trial` lives at `apps.businesses.trial_services` (recon saw `approve_business` import it there). If the import path differs, match `approve_business`'s import exactly. Verify `User.Role.BUSINESS_OWNER`, `set_unusable_password`, and the `owned_business` reverse accessor exist (recon confirmed the OneToOne `related_name="owned_business"`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest apps/businesses/tests/test_pitch_services.py -v`
Expected: all PASS. Fix real mismatches (import paths, field names) if any surface; do not weaken assertions.

- [ ] **Step 5: Lint + type-check**

Run: `cd backend && ruff check apps/businesses/pitch_services.py && mypy apps/businesses/pitch_services.py`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/businesses/pitch_services.py backend/apps/businesses/tests/test_pitch_services.py
git commit -m "feat(pitch): pitch invite services (generate, resolve, claim)"
```

---

## Task 3 — Public endpoints (resolve / request-code / verify-claim)

**Files:**
- Create: `backend/apps/businesses/pitch_views.py`
- Create: `backend/apps/businesses/pitch_urls.py`
- Modify: `backend/config/urls.py` (add `path("api/pitch/", include(...))`)
- Modify: `backend/config/settings/base.py` (add `"pitch": "20/min"` to `DEFAULT_THROTTLE_RATES`)
- Create: `backend/apps/businesses/tests/test_pitch_api.py`

**Interfaces — Consumes:** Task 2 services. **Produces:** `GET /api/pitch/<token>/`, `POST /api/pitch/<token>/claim/`, `POST /api/pitch/<token>/verify/` (frontend Task 6 consumes these).

- [ ] **Step 1: Write the failing API tests**

Create `backend/apps/businesses/tests/test_pitch_api.py`:

```python
import pytest
from django.core.cache import cache

from apps.accounts.models import User
from apps.businesses.models import Business, PitchInvite
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest apps/businesses/tests/test_pitch_api.py -v`
Expected: 404s / URL-not-found failures.

- [ ] **Step 3: Add the throttle rate**

In `backend/config/settings/base.py`, add to `DEFAULT_THROTTLE_RATES`:

```python
        # Public pitch-link endpoints — anonymous prospects; generous but capped.
        "pitch": "20/min",
```

- [ ] **Step 4: Implement views**

Create `backend/apps/businesses/pitch_views.py`:

```python
"""Public (unauthenticated) endpoints for the prospect pitch link.

Views parse input via serializers and delegate all logic to pitch_services;
they hold no business rules (see backend.md). AllowAny is deliberate — a prospect
has no account yet. Every endpoint is scoped-throttled ("pitch").
"""
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.businesses import pitch_services as ps
from core.frontend import frontend_base_url  # noqa: F401  (available if a link needs building)


def _client_ip(request: Request) -> str | None:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _ok(data: object) -> Response:
    # Match the project envelope ({"success": true, "data": ...}); the client
    # unwraps `data`. If a shared success_response helper exists in core, use it.
    return Response({"success": True, "data": data})


class ClaimSerializer(serializers.Serializer):
    email = serializers.EmailField()


class VerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    goal = serializers.IntegerField(min_value=1, max_value=99)
    reward_text = serializers.CharField(max_length=120)


class PitchResolveView(APIView):
    permission_classes = [AllowAny]  # prospect has no account yet
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pitch"

    def get(self, request: Request, token: str) -> Response:
        _, view = ps.resolve_pitch(token)
        logo_url = (
            request.build_absolute_uri(f"/media/{view.logo_path}")
            if view.logo_path
            else None
        )
        return _ok({
            "business_id": view.business_id,
            "business_name": view.business_name,
            "logo_url": logo_url,
            "category": view.category,
            "default_goal": view.default_goal,
            "default_reward": view.default_reward,
            "published_count": view.published_count,
        })


class PitchClaimView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pitch"

    def post(self, request: Request, token: str) -> Response:
        s = ClaimSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ps.request_pitch_code(token, s.validated_data["email"], _client_ip(request))
        return _ok({"sent": True})


class PitchVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pitch"

    def post(self, request: Request, token: str) -> Response:
        s = VerifySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        result = ps.claim_pitch(
            token,
            s.validated_data["email"],
            s.validated_data["code"],
            s.validated_data["goal"],
            s.validated_data["reward_text"],
        )
        return _ok({
            "access": result.access,
            "refresh": result.refresh,
            "user": {"id": str(result.user.id), "role": result.user.role},
        })
```

Executor note: use the project's real logo URL construction. Recon shows `Business.logo` is an ImageField; prefer `view`-level `business.logo.url` over hardcoding `/media/`. Simplest correct form: in `resolve_pitch` keep returning `logo_path=business.logo.url if business.logo else None` (relative), then wrap with `request.build_absolute_uri(view.logo_path)`. Adjust `PitchView.logo_path` + the service accordingly (change `.name` to `.url`). Also confirm whether a shared `success_response`/envelope helper exists (recon referenced `success_response` in qr views) and use it instead of `_ok` for consistency.

- [ ] **Step 5: Wire URLs**

Create `backend/apps/businesses/pitch_urls.py`:

```python
from django.urls import path

from apps.businesses.pitch_views import PitchClaimView, PitchResolveView, PitchVerifyView

app_name = "pitch"

urlpatterns = [
    path("<str:token>/", PitchResolveView.as_view(), name="resolve"),
    path("<str:token>/claim/", PitchClaimView.as_view(), name="claim"),
    path("<str:token>/verify/", PitchVerifyView.as_view(), name="verify"),
]
```

In `backend/config/urls.py`, add alongside the other `api/` includes:

```python
    path("api/pitch/", include(("apps.businesses.pitch_urls", "pitch"))),
```

(Match the exact `include(...)` style already used in the file — the recon shows the 2-tuple `(module, namespace)` form.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest apps/businesses/tests/test_pitch_api.py -v`
Expected: all PASS. If the envelope key differs (`data` vs top-level), align `_ok`/assertions with the project's actual response shape.

- [ ] **Step 7: Lint + schema**

Run: `cd backend && ruff check apps/businesses/pitch_views.py apps/businesses/pitch_urls.py`
If the project checks the OpenAPI schema in CI (drf-spectacular), run its schema-generation command and fix any warnings for the new endpoints.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/businesses/pitch_views.py backend/apps/businesses/pitch_urls.py backend/config/urls.py backend/config/settings/base.py backend/apps/businesses/tests/test_pitch_api.py
git commit -m "feat(pitch): public resolve/claim/verify endpoints"
```

---

## Task 4 — Django admin (generate button, status column, invite inline)

**Files:**
- Modify: `backend/apps/businesses/admin.py`
- Modify: `backend/apps/businesses/tests/` (add `test_pitch_admin.py`)

**Interfaces — Consumes:** `generate_pitch_invite`, `PitchInvite`, `frontend_base_url`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/businesses/tests/test_pitch_admin.py`:

```python
import pytest
from django.contrib.admin.sites import site

from apps.businesses.models import Business, PitchInvite

pytestmark = pytest.mark.django_db


def test_pitch_status_column_reflects_latest_invite():
    b = Business.objects.create(name="Bublik", category="cafe")
    admin = site._registry[Business]
    # No invite -> "not sent"
    assert "—" in admin.pitch_status(b) or "not" in admin.pitch_status(b).lower()
    PitchInvite.objects.create(business=b, token_hash="h1",
                               expires_at=__import__("django.utils.timezone", fromlist=["now"]).now(),
                               status=PitchInvite.Status.OPENED)
    assert admin.pitch_status(b)  # renders something for opened
```

(Keep this light — the column rendering is the one bit of admin logic worth a test. The generate button is exercised manually; a full admin-request test is optional.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest apps/businesses/tests/test_pitch_admin.py -v`
Expected: `AttributeError: pitch_status`.

- [ ] **Step 3: Implement admin changes**

In `backend/apps/businesses/admin.py`, mirror the existing `create_demo_business_button` action pattern (recon: django-unfold `@action`, `messages.success`, `format_html`, `redirect`). Add to `BusinessAdmin`:

```python
    # add "pitch_status" to list_display, e.g.:
    #   list_display = (..., "pitch_status")

    @admin.display(description="Pitch")
    def pitch_status(self, obj):
        """Render the latest pitch-invite status as a badge for the changelist.

        None -> "— Не отправлено"; else the invite's status label. Reads
        obj.pitch_invites (prefetched via get_queryset to avoid N+1).
        """
        invite = next(iter(obj.pitch_invites.all()), None)
        if invite is None:
            return "— Не отправлено"
        labels = {
            PitchInvite.Status.PENDING: "Создано",
            PitchInvite.Status.OPENED: "Открыто",
            PitchInvite.Status.CLAIMED: "Забрано",
            PitchInvite.Status.EXPIRED: "Истекло",
        }
        return labels.get(invite.status, invite.status)

    def get_queryset(self, request):
        # Prefetch invites (newest first via model Meta.ordering) so pitch_status
        # never issues a per-row query.
        return super().get_queryset(request).prefetch_related("pitch_invites")
```

Add the object-level generate action (change-form button). Follow the file's existing action-button convention exactly; conceptually:

```python
    @action(description="Создать pitch-ссылку", icon="link")
    def create_pitch_link_button(self, request, object_id):
        """Mint a fresh pitch link for this business and show the URL once.

        Expires any existing active (pending/opened) invite first so there is a
        single live link per business. The raw token is surfaced only in this
        message and never stored.
        """
        from apps.businesses.pitch_services import generate_pitch_invite
        from core.frontend import frontend_base_url

        business = self.get_object(request, object_id)
        business.pitch_invites.filter(
            status__in=[PitchInvite.Status.PENDING, PitchInvite.Status.OPENED]
        ).update(status=PitchInvite.Status.EXPIRED)
        _, raw = generate_pitch_invite(business)
        url = f"{frontend_base_url()}/pitch/{raw}"
        messages.success(
            request,
            format_html("Pitch-ссылка (активна 30 дней, показана один раз): <code>{}</code>", url),
        )
        return redirect(request.META.get("HTTP_REFERER", "."))
```

Wire it into the change-form actions the way `BusinessAdmin` already registers object actions in unfold (e.g. `actions_detail = [...]` or the file's existing mechanism — copy the demo button's registration approach; if the demo button is a changelist action, add this as a detail/object action so it has `object_id`). Register a read-only `PitchInvite` inline (mirror `BusinessNoteInline`):

```python
class PitchInviteInline(TabularInline):
    model = PitchInvite
    extra = 0
    can_delete = False
    fields = ("status", "created_at", "opened_at", "claimed_at", "claimed_email")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False
    def has_change_permission(self, request, obj=None):
        return False
```

Add `PitchInviteInline` to `BusinessAdmin.inlines` (alongside `BusinessNoteInline`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest apps/businesses/tests/test_pitch_admin.py -v`
Expected: PASS.

- [ ] **Step 5: Sanity-check admin loads**

Run: `cd backend && python manage.py check`
Expected: `System check identified no issues`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/businesses/admin.py backend/apps/businesses/tests/test_pitch_admin.py
git commit -m "feat(pitch): admin generate-link button, status column, invite inline"
```

---

## Task 5 — Full backend suite gate

- [ ] **Step 1:** Run `cd backend && pytest` — report pass/fail counts. A pre-existing failure `apps/reporting/tests/test_reporting.py::test_report_staff_and_spend` exists on main; list it separately, do not fix it here.
- [ ] **Step 2:** Run `cd backend && ruff check apps/businesses core && mypy apps/businesses/pitch_services.py apps/businesses/pitch_views.py`. Fix issues in the new files only.

---

## Task 6 — Frontend `@jaqyn/api` pitch resource

**Files:**
- Create: `frontend/packages/api/src/pitch/types.ts`
- Create: `frontend/packages/api/src/pitch/api.ts`
- Create: `frontend/packages/api/src/pitch/hooks.ts`
- Modify: `frontend/packages/api/src/index.ts` (re-export)
- Create: `frontend/packages/api/src/pitch/pitch.test.ts` (if the package has a test runner; else skip + note)

**Interfaces — Produces (consumed by Task 7):** `usePitchResolve(token)`, `useRequestPitchCode()`, `useVerifyPitch()`, types `PitchResolve`, `PitchClaimResult`.

- [ ] **Step 1: Types**

`frontend/packages/api/src/pitch/types.ts`:

```typescript
export type PitchResolve = {
  business_id: string;
  business_name: string;
  logo_url: string | null;
  category: string;
  default_goal: number;
  default_reward: string;
  published_count: number;
};

export type PitchClaimResult = {
  access: string;
  refresh: string;
  user: { id: string; role: string };
};

export type VerifyPitchInput = {
  token: string;
  email: string;
  code: string;
  goal: number;
  reward_text: string;
};
```

- [ ] **Step 2: API calls**

`frontend/packages/api/src/pitch/api.ts` (mirror `customer/api.ts` — uses the shared `api` client which returns unwrapped `data`; these are public, pass `{ auth: false }`):

```typescript
import { api } from "../client";
import type { PitchClaimResult, PitchResolve, VerifyPitchInput } from "./types";

export const pitchApi = {
  resolve: (token: string) =>
    api.get<PitchResolve>(`/api/pitch/${encodeURIComponent(token)}/`, { auth: false }),
  requestCode: (token: string, email: string) =>
    api.post<{ sent: boolean }>(`/api/pitch/${encodeURIComponent(token)}/claim/`, { email }, { auth: false }),
  verify: (input: VerifyPitchInput) =>
    api.post<PitchClaimResult>(
      `/api/pitch/${encodeURIComponent(input.token)}/verify/`,
      { email: input.email, code: input.code, goal: input.goal, reward_text: input.reward_text },
      { auth: false },
    ),
};
```

- [ ] **Step 3: Hooks + key**

`frontend/packages/api/src/pitch/hooks.ts` (mirror `customer/hooks.ts`):

```typescript
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { pitchApi } from "./api";
import type { VerifyPitchInput } from "./types";

export const pitchKeys = {
  resolve: (token: string) => ["pitch", token] as const,
};

export const usePitchResolve = (token: string) =>
  useQuery({
    queryKey: pitchKeys.resolve(token),
    queryFn: () => pitchApi.resolve(token),
    retry: false, // a dead link should surface immediately, not retry
  });

export const useRequestPitchCode = () =>
  useMutation({
    mutationFn: ({ token, email }: { token: string; email: string }) =>
      pitchApi.requestCode(token, email),
  });

export const useVerifyPitch = () =>
  useMutation({ mutationFn: (input: VerifyPitchInput) => pitchApi.verify(input) });
```

- [ ] **Step 4: Re-export**

In `frontend/packages/api/src/index.ts`, add (match the file's existing export style):

```typescript
export * from "./pitch/types";
export { pitchApi } from "./pitch/api";
export { usePitchResolve, useRequestPitchCode, useVerifyPitch, pitchKeys } from "./pitch/hooks";
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && corepack pnpm --filter @jaqyn/api exec tsc --noEmit` (adjust filter to the api package's real name in its `package.json`).
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/packages/api/src/pitch frontend/packages/api/src/index.ts
git commit -m "feat(pitch): @jaqyn/api pitch resource (resolve, claim, verify)"
```

---

## Task 7 — Pitch page `/pitch/[token]` (hero, features, interactivity, claim, dead-link)

**Files:**
- Create: `frontend/apps/web/app/pitch/[token]/page.tsx`
- Create: `frontend/apps/web/app/pitch/[token]/_components/PitchCard.tsx` (hero card + tap-to-stamp + reward editor)
- Create: `frontend/apps/web/app/pitch/[token]/_components/FeatureBlocks.tsx`
- Create: `frontend/apps/web/app/pitch/[token]/_components/ClaimSheet.tsx`
- Modify: `frontend/packages/i18n/src/locales.ts` (add `pitch.*` keys, RU + EN)
- Create: `frontend/apps/web/app/pitch/[token]/page.test.tsx`

**Interfaces — Consumes:** Task 6 hooks; `cardAccent`/`ACCENT_BG` from `app/loyalty/_lib/wallet.ts`; `useT`; `@jaqyn/ui` primitives; `postAuthRoute`; `tokenStore` (to store JWTs after claim — recon: `tokenStore.set(access)` / check for a refresh setter). Design details in the approved screens + spec.

- [ ] **Step 1: Add i18n keys**

In `frontend/packages/i18n/src/locales.ts`, add to both `messages.ru` and `messages.en` a `pitch.*` block. RU values (author EN as plain translations):

```
"pitch.hero.title": "{name} — ваша карта лояльности уже готова",
"pitch.hero.sub": "Мы её собрали. Осталось забрать.",
"pitch.hero.tapHint": "Нажмите на карту — поставьте печать",
"pitch.card.progress": "{filled} из {total} · ещё {left} до награды",
"pitch.card.rewardFree": "{n}-й {reward} бесплатно",
"pitch.editor.save": "Настроим по-вашему — сохраним при регистрации",
"pitch.cta": "Забрать бизнес — 3 месяца бесплатно",
"pitch.cta.sub": "Без карты и обязательств",
"pitch.social": "Заведения Бишкека уже переходят в Jaqyn",
"pitch.feat.retention.title": "Гости возвращаются",
"pitch.feat.retention.body": "{n}-й {reward} бесплатно — причина зайти снова, а не к соседу",
"pitch.feat.map.title": "Вас находят рядом",
"pitch.feat.map.body": "{name} видят клиенты Jaqyn поблизости",
"pitch.feat.group.title": "Приводите компании",
"pitch.feat.group.body": "1 гость привёл 3 друзей — печать всем",
"pitch.feat.analytics.title": "Видите, что работает",
"pitch.feat.analytics.body": "Кто возвращается, кто пропал, что приносит выручку",
"pitch.feat.vouchers.title": "Дарите поводы вернуться",
"pitch.feat.vouchers.body": "Приветственный и именинный подарок — автоматически",
"pitch.feat.noapp.title": "Ничего не устанавливать",
"pitch.feat.noapp.body": "Гость сканирует QR за 5 секунд. Касса не меняется",
"pitch.claim.emailTitle": "Заберите {name}",
"pitch.claim.emailSub": "Укажите почту — пришлём код подтверждения",
"pitch.claim.emailLabel": "Эл. почта",
"pitch.claim.getCode": "Получить код",
"pitch.claim.codeTitle": "Введите код",
"pitch.claim.codeSub": "Отправили код на {email}",
"pitch.claim.resend": "Отправить снова",
"pitch.claim.resendIn": "Отправить снова через {n} с",
"pitch.claim.wrongCode": "Неверный код",
"pitch.claim.successTitle": "{name} теперь ваш",
"pitch.claim.successSub": "Настроим за 2 минуты",
"pitch.dead.title": "Ссылка больше не активна",
"pitch.dead.sub": "Напишите нам — сделаем новую",
"pitch.dead.telegram": "Написать в Telegram",
```

Follow the file's interpolation convention (recon shows `t("auth.codesentTo", { email })` style — use the same `{param}` mechanism the `useT` provider supports).

- [ ] **Step 2: PitchCard — hero, tap-to-stamp, reward editor**

`_components/PitchCard.tsx` (`'use client'`). Props: `businessId`, `businessName`, `logoUrl`, `goal`, `reward`, `onChange(goal, reward)`. Behavior:
- Accent gradient via `cardAccent(businessId)` → `ACCENT_BG[accent]` (import from `../../../loyalty/_lib/wallet`).
- Render `goal` stamp cells + a final ★ cell. Tapping an empty stamp fills it (local `filled` state, framer-motion stagger/scale; last fill triggers a small burst). Progress line uses `pitch.card.progress`.
- Reward pill (`pitch.card.rewardFree`) is a button → opens a small inline editor: a `−/+` stepper bound to `goal` (clamp 1–20) and a text input bound to `reward`; both call `onChange`. Card preview updates live. Helper line `pitch.editor.save`.
- Use only preset Tailwind tokens (`bg-card`, `text-ink`, `rounded-*`, wallet gradients). No raw hex.

Keep this component focused; the stamp cell + editor can be small internal subcomponents in the same file.

- [ ] **Step 3: FeatureBlocks**

`_components/FeatureBlocks.tsx` — a data-driven list rendering the 6 blocks from Step-1 keys (icon tile + Bricolage heading + one body line). Define one `FeatureBlock` subcomponent and map an array of `{ icon, titleKey, bodyKey, params }`. Personalize map/retention with `{name}`, `{n}`, `{reward}`. Icons: use existing `@jaqyn/ui` icons if present, else inline SVGs on `bg-[--tile]`/preset tile class. The small visuals (mini stamp row, map w/ pins, avatars→reward, ring+bars, voucher pills, phone+QR) can be simple static SVG/markup — match the approved screens; do not over-build.

- [ ] **Step 4: ClaimSheet — states B/C/D**

`_components/ClaimSheet.tsx` (`'use client'`). Bottom sheet (reuse `@jaqyn/ui` `Sheet` if it exists — recon shows a `Sheet` with `role="dialog"`; else a fixed-bottom panel with the design's radius/handle). Local `step: "email" | "code" | "success"`. Mirror `signup/email/page.tsx`:
- Email step: email input + `useRequestPitchCode().mutateAsync({token,email})` → step "code" + start 60s countdown.
- Code step: 6-box code input, resend (60s cooldown), wrong-code error from mutation error → `useVerifyPitch().mutateAsync({token,email,code,goal,reward_text})`. On success: store tokens (`tokenStore`), step "success".
- Success step: sage ✓ pop, then `router.push(postAuthRoute(result-shaped object))`. `postAuthRoute` needs a result with `user.role` — build `{ user: { role: result.user.role, ... } }` to match its input, or route directly to `/business/dashboard` (recon: that's where `business_owner` goes). Prefer calling `postAuthRoute` for consistency; adapt the arg to its actual type.

Props: `token`, `businessName`, `goal`, `rewardText`, `open`, `onClose`.

- [ ] **Step 5: Page**

`app/pitch/[token]/page.tsx` (`'use client'`, mirror `q/[token]/page.tsx`):
- `const { token } = useParams()`; `const resolve = usePitchResolve(token)`.
- Loading → `<Loading/>`; error → **dead-link screen** (not `<ErrorState>`): the warm empty-state card with `pitch.dead.*` + a Telegram link button. (Any resolve error — 404/410 — renders the dead-link screen; that's the desired UX.)
- Success: render `PitchCard` (goal/reward seeded from `resolve.data.default_goal/default_reward`, held in page state so the editor and ClaimSheet share them), `FeatureBlocks`, social-proof line, a sticky bottom CTA that opens `ClaimSheet`. Sticky CTA stays visible over scroll.
- Pass the live `goal`/`rewardText` state into both `PitchCard` (as controlled value + `onChange`) and `ClaimSheet` (so the claim sends the edited program).

- [ ] **Step 6: Test**

`page.test.tsx` — mock `@jaqyn/api` (`usePitchResolve` returns a business; `useRequestPitchCode`/`useVerifyPitch` return mutation stubs) and `next/navigation`. Assert: (1) resolved page shows the business name and the CTA; (2) resolve error shows `pitch.dead.title`; (3) opening the sheet and submitting an email calls the request-code mutation. Follow the existing `campaign/[id]/voucher/page.test.tsx` mocking style.

- [ ] **Step 7: Typecheck + lint + test + build**

Run: `cd frontend && corepack pnpm turbo typecheck lint test --filter=web` (adjust task names to `turbo.json`).
Expected: clean; new test passes.

- [ ] **Step 8: Commit**

```bash
git add frontend/apps/web/app/pitch frontend/packages/i18n/src/locales.ts
git commit -m "feat(pitch): prospect pitch page with tap-to-stamp, reward editor, claim flow"
```

---

## Final verification

- [ ] `cd backend && pytest` — green except the known pre-existing reporting failure (list it verbatim).
- [ ] `cd frontend && corepack pnpm turbo typecheck lint test --filter=web` — clean.
- [ ] Manual smoke (if a dev stack is up): create a PENDING business in admin → «Создать pitch-ссылку» → open `/pitch/<token>` → tap stamps, edit reward → claim with email → code (dev email backend/console) → lands in `/business/dashboard`; business now has `owner`, `onboarding_status=in_progress`, invite `claimed`, and a `BusinessNote` recorded.
- [ ] `git log --oneline main..HEAD` — ~8 conventional commits. Do NOT push; report back.

## Report back

Commits list, backend pass/fail (pre-existing failures separate + verbatim), frontend typecheck/lint/test results, any signature adaptations made (esp. logo URL construction, the admin object-action registration mechanism, `start_trial` import path, the success-envelope helper, `postAuthRoute` arg shape, `tokenStore` refresh setter), and anything skipped with the reason.
