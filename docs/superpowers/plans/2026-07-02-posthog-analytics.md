# PostHog Product Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire PostHog product analytics — backend domain events via a thin `core/analytics.py` wrapper, frontend autocapture + user identify — so funnels (first-scan → signup → first-stamp → redeem) and staff/business adoption are measurable.

**Architecture:** Backend gets one cross-cutting module `backend/core/analytics.py` exposing `track(distinct_id, event, **properties)`; services call it at 8 domain-event sites (money events fire server-side — source of truth). Frontend gets `posthog-js` initialized in one client provider with autocapture + SPA pageviews, plus `identify()` driven by the existing `useMe()` query. Everything no-ops when the env key is absent (dev/test/CI stay silent).

**Tech Stack:** `posthog` (Python, >=3.5), `posthog-js` (+ `posthog-js/react`), Django 5.1 / DRF, Next.js 14 App Router, TanStack Query 5.

## Global Constraints

- Backend rules (`.claude/rules/backend.md`) apply: full type hints, explicit return types, docstrings on every service function, magic values commented with origin.
- **Never send PII** (phone, email, names) in event properties — ids only. KG personal-data filings apply.
- Analytics must be **fire-and-forget**: a PostHog failure may never break or slow a request. Wrapper swallows + logs exceptions.
- Inside `transaction.atomic`, delivery defers via `transaction.on_commit` (same rule as Celery side effects) — no phantom events from rolled-back transactions.
- `POSTHOG_API_KEY` unset ⇒ every call is a no-op. Dev/test/CI need no config.
- EU cloud host default: `https://eu.i.posthog.com` (data-residency choice).
- Frontend: no user-facing copy is added (nothing to i18n). Only `NEXT_PUBLIC_*` vars reach the client.
- Conventional Commits. No `print`/`console.log`. Match surrounding style.

## ⚠️ Working-tree caveat (read first)

`backend/apps/loyalty/scan.py`, `backend/apps/loyalty/services/redemption.py`, and `backend/apps/campaigns/services/rewards.py` are mid-refactor on branch `feat/staff-app-handoff` (uncommitted in the main checkout). **Your worktree contains the last committed state — signatures below were read from the newer working tree and may differ slightly.** For Task 3: open the file in YOUR checkout first, find the equivalent function (redemption/redeem, reward redeem, unified scan resolve), and place the `track()` call at the analogous point. Function *intent* is stable; names/params may drift. Model field names (`customer_id`, `business_id`, …) must be verified against the models in your checkout — adapt property extraction accordingly. This is expected, not an error.

---

### Task 1: Backend analytics core (`core/analytics.py` + settings + dependency)

**Files:**
- Create: `backend/core/analytics.py`
- Create: `backend/core/tests/test_analytics.py` (create `backend/core/tests/__init__.py` if missing; if `core` tests live elsewhere — check for existing `backend/core/tests/` or top-level `backend/tests/` — follow the existing location)
- Modify: `backend/config/settings/base.py` (append near other third-party config, e.g. after the Celery block)
- Modify: dependency declaration — **no `requirements.txt`/`pyproject.toml` was found in `backend/`**; deps live in the Docker image / `.venv`. Find where the Docker build installs Python deps (`Dockerfile` / `docker-compose.yml` / any `requirements*.txt` at repo root) and add `posthog>=3.5` there. Also `pip install "posthog>=3.5"` into the active venv so tests run.

**Interfaces:**
- Produces: `core.analytics.track(distinct_id: str, event: str, **properties: object) -> None` and event-name constants `CUSTOMER_SIGNED_UP`, `BUSINESS_REGISTERED`, `BUSINESS_ONBOARDING_SUBMITTED`, `CAMPAIGN_CREATED`, `CAMPAIGN_PUBLISHED`, `STAFF_SCAN_RESOLVED`, `REWARD_REDEEMED`, `CAMPAIGN_REWARD_REDEEMED`. Tasks 2–3 import these.

- [ ] **Step 1: Add settings**

Append to `backend/config/settings/base.py`:

```python
# --- Product analytics (PostHog) ---
# Project API key from PostHog project settings. Empty string = analytics
# disabled entirely (the dev/test/CI default) — core.analytics.track() no-ops.
POSTHOG_API_KEY = os.getenv("POSTHOG_API_KEY", "")
# EU cloud endpoint, chosen for data residency; override only if self-hosting.
POSTHOG_HOST = os.getenv("POSTHOG_HOST", "https://eu.i.posthog.com")
```

- [ ] **Step 2: Install dependency**

Run: `pip install "posthog>=3.5"` (in the backend venv). Add the same pin wherever the Docker image declares Python deps (search: `grep -rn "pip install\|requirements" backend/Dockerfile* Dockerfile* docker-compose*.yml 2>/dev/null`). If a `requirements.txt` exists anywhere for the backend image, add `posthog>=3.5` line there.

- [ ] **Step 3: Write the failing tests**

`backend/core/tests/test_analytics.py`:

```python
"""Tests for core.analytics — the invariants that matter:
no-op without key, immediate send outside atomic, deferred send inside atomic."""
from unittest.mock import patch

import pytest
from django.db import transaction
from django.test import override_settings

from core import analytics


@override_settings(POSTHOG_API_KEY="")
def test_track_is_noop_without_key() -> None:
    with patch.object(analytics, "_get_client") as get_client:
        analytics.track("user-1", "test_event", foo="bar")
    get_client.assert_not_called()


@override_settings(POSTHOG_API_KEY="test-key")
def test_track_sends_immediately_outside_atomic() -> None:
    with patch.object(analytics, "_get_client") as get_client:
        analytics.track("user-1", "test_event", business_id="b-1")
    get_client.return_value.capture.assert_called_once()
    kwargs = get_client.return_value.capture.call_args.kwargs
    assert kwargs["distinct_id"] == "user-1"
    assert kwargs["event"] == "test_event"
    assert kwargs["properties"] == {"business_id": "b-1"}


@pytest.mark.django_db(transaction=True)
@override_settings(POSTHOG_API_KEY="test-key")
def test_track_defers_until_commit_inside_atomic() -> None:
    with patch.object(analytics, "_get_client") as get_client:
        with transaction.atomic():
            analytics.track("user-1", "test_event")
            get_client.return_value.capture.assert_not_called()
        get_client.return_value.capture.assert_called_once()


@override_settings(POSTHOG_API_KEY="test-key")
def test_track_swallows_client_errors() -> None:
    with patch.object(analytics, "_get_client") as get_client:
        get_client.return_value.capture.side_effect = RuntimeError("posthog down")
        analytics.track("user-1", "test_event")  # must not raise
```

Note: if the `capture()` kwargs of the installed posthog version differ (v3 accepts `capture(distinct_id, event, properties)` positionally; newer versions prefer kwargs), adapt BOTH the implementation and these assertions to the installed version — check `python -c "import posthog, inspect; print(inspect.signature(posthog.Posthog.capture))"`.

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && pytest core/tests/test_analytics.py -v`
Expected: FAIL / ERROR with `ModuleNotFoundError: No module named 'core.analytics'` (or import error).

- [ ] **Step 5: Implement `backend/core/analytics.py`**

```python
"""Product analytics (PostHog) — thin fire-and-forget wrapper.

``track()`` is the single entry point services call to record a product event.
Rules enforced here (backed by tests in core/tests/test_analytics.py):

- No-op when ``settings.POSTHOG_API_KEY`` is empty (the dev/test default) —
  callers never branch on configuration.
- Inside an atomic block, delivery defers via ``transaction.on_commit`` so a
  rolled-back transaction never emits a phantom event (same rule as Celery
  side effects).
- Any PostHog client error is swallowed and logged — analytics may never
  break or slow a request.
- Properties must be ids/enums only, never PII (phone, email, names) —
  KG personal-data regulations apply.
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)

# Event names — single source of truth so names never drift between services
# and the PostHog dashboard. Add new events here, not inline.
CUSTOMER_SIGNED_UP = "customer_signed_up"
BUSINESS_REGISTERED = "business_registered"
BUSINESS_ONBOARDING_SUBMITTED = "business_onboarding_submitted"
CAMPAIGN_CREATED = "campaign_created"
CAMPAIGN_PUBLISHED = "campaign_published"
STAFF_SCAN_RESOLVED = "staff_scan_resolved"
REWARD_REDEEMED = "reward_redeemed"
CAMPAIGN_REWARD_REDEEMED = "campaign_reward_redeemed"

_client: Any = None


def _get_client() -> Any:
    """Lazily construct the module-level PostHog client (import deferred so
    the dependency is only required when analytics is actually enabled)."""
    global _client
    if _client is None:
        from posthog import Posthog

        _client = Posthog(
            project_api_key=settings.POSTHOG_API_KEY,
            host=settings.POSTHOG_HOST,
        )
    return _client


def track(distinct_id: str, event: str, **properties: Any) -> None:
    """Record a product event for ``distinct_id`` (a User UUID as str).

    Fire-and-forget: no-ops without an API key, defers to after commit when
    called inside ``transaction.atomic``, and never raises on client errors.
    """
    if not settings.POSTHOG_API_KEY:
        return

    def _send() -> None:
        try:
            _get_client().capture(
                distinct_id=distinct_id,
                event=event,
                properties=properties or None,
            )
        except Exception:  # analytics must never break the request path
            logger.warning("posthog capture failed for %s", event, exc_info=True)

    if transaction.get_connection().in_atomic_block:
        transaction.on_commit(_send)
    else:
        _send()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest core/tests/test_analytics.py -v`
Expected: 4 PASS.

- [ ] **Step 7: Ruff + mypy on touched files**

Run: `cd backend && ruff check core/analytics.py core/tests/test_analytics.py && mypy core/analytics.py`
Expected: clean (match existing mypy invocation style if the repo uses a config/target list).

- [ ] **Step 8: Commit**

```bash
git add backend/core/analytics.py backend/core/tests/ backend/config/settings/base.py <dependency-file-if-any>
git commit -m "feat(analytics): add PostHog core wrapper with on-commit delivery"
```

---

### Task 2: Hook signup + business lifecycle events

**Files:**
- Modify: `backend/apps/accounts/services.py` — `verify_otp` (~line 67, next to the existing `emit_event("customer_signed_up", ...)`) and `verify_email_otp` (~line 177, same pattern)
- Modify: `backend/apps/businesses/services.py` — `register_business` (next to existing `emit_event("business_registered", ...)`)
- Modify: `backend/apps/businesses/onboarding_services.py` — `submit_onboarding`
- Test: extend the existing test files for these services (e.g. `backend/apps/accounts/tests/test_email_otp_service.py` and the businesses tests — locate with `ls backend/apps/businesses/tests/`)

**Interfaces:**
- Consumes: `core.analytics.track`, constants `CUSTOMER_SIGNED_UP`, `BUSINESS_REGISTERED`, `BUSINESS_ONBOARDING_SUBMITTED` (Task 1).
- Produces: nothing new — additive one-line calls.

- [ ] **Step 1: Write failing tests**

Add to the accounts test module (adapt the existing `_issue` helper usage already present in `test_email_otp_service.py`):

```python
from unittest.mock import patch


@pytest.mark.django_db
def test_verify_email_otp_tracks_signup_for_new_user():
    _issue(email="new2@example.com", name="Bob", password="pass123", phone="+996700000001")
    payload = cache.get("email_otp:new2@example.com")
    with patch("apps.accounts.services.analytics") as mock_analytics:
        user, is_new, _, _ = verify_email_otp("new2@example.com", payload["code"])
    assert is_new is True
    mock_analytics.track.assert_called_once_with(
        str(user.id), mock_analytics.CUSTOMER_SIGNED_UP, method="email"
    )


@pytest.mark.django_db
def test_verify_email_otp_does_not_track_existing_user():
    # sign up once, then verify again for the same email
    _issue(email="dup@example.com", name="Bob", password="pass123", phone="+996700000002")
    payload = cache.get("email_otp:dup@example.com")
    verify_email_otp("dup@example.com", payload["code"])
    _issue(email="dup@example.com", name="Bob", password="pass123", phone="+996700000002")
    payload = cache.get("email_otp:dup@example.com")
    with patch("apps.accounts.services.analytics") as mock_analytics:
        _, is_new, _, _ = verify_email_otp("dup@example.com", payload["code"])
    assert is_new is False
    mock_analytics.track.assert_not_called()
```

(Note: patching the module object `apps.accounts.services.analytics` keeps the constant lookup on the mock — assert via `mock_analytics.CUSTOMER_SIGNED_UP` as shown. If the existing `_issue` helper for the second signup rejects duplicate emails, follow whatever the existing "existing user re-login" test does to obtain a fresh OTP and reuse that path.)

Add analogous tests for `verify_otp` (phone, `method="phone"`), `register_business` (`BUSINESS_REGISTERED`, distinct_id = str(owner.id), property `business_id`), and `submit_onboarding` (`BUSINESS_ONBOARDING_SUBMITTED`) in their respective test modules — same patch-the-module pattern, one happy-path assert each. Copy the setup style of the nearest existing test in the same file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest apps/accounts/tests/ apps/businesses/tests/ -v -k "track"`
Expected: FAIL — `AttributeError` / assertion failure (no `analytics` import in services yet).

- [ ] **Step 3: Implement the hooks**

In `backend/apps/accounts/services.py` add import `from core import analytics`, then inside `verify_otp` where `created` is true (next to the existing `emit_event`):

```python
analytics.track(str(user.id), analytics.CUSTOMER_SIGNED_UP, method="phone")
```

Inside `verify_email_otp` where `is_new` is true:

```python
analytics.track(str(user.id), analytics.CUSTOMER_SIGNED_UP, method="email")
```

In `backend/apps/businesses/services.py`, inside `register_business` (it is `@transaction.atomic` — the wrapper defers to on_commit automatically):

```python
analytics.track(
    str(owner.id), analytics.BUSINESS_REGISTERED, business_id=str(business.id)
)
```

In `backend/apps/businesses/onboarding_services.py`, at the success end of `submit_onboarding`:

```python
analytics.track(
    str(business.owner_id),
    analytics.BUSINESS_ONBOARDING_SUBMITTED,
    business_id=str(business.id),
)
```

Update each touched function's docstring with one line, e.g. `Emits the customer_signed_up analytics event for new users.` (docstring/code no-drift rule). **Do not** put phone/email in properties.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest apps/accounts/tests/ apps/businesses/tests/ -v`
Expected: all PASS (new + pre-existing).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/services.py backend/apps/businesses/ backend/apps/accounts/tests/
git commit -m "feat(analytics): track signup and business lifecycle events"
```

---

### Task 3: Hook campaign, scan, and redemption events

> Re-read the working-tree caveat at the top before this task. Verify every signature/field in YOUR checkout first.

**Files:**
- Modify: `backend/apps/campaigns/services/campaign.py` — `CampaignService.create_campaign(business, created_by, data) -> Campaign` and `publish_campaign(campaign, business) -> Campaign`
- Modify: `backend/apps/loyalty/services/redemption.py` — `LoyaltyRedemptionService.redeem_voucher(...) -> LoyaltyVoucher` (name may differ in your checkout — find the voucher-redeem entry point)
- Modify: `backend/apps/campaigns/services/rewards.py` — `CampaignRewardService.redeem_reward_voucher(...) -> CampaignRewardVoucher` (same caveat)
- Modify: `backend/apps/loyalty/scan.py` — `UnifiedStaffScanService.resolve(staff, qr_token) -> UnifiedStaffScan` (same caveat)
- Test: extend the matching existing test modules (`backend/apps/campaigns/tests/`, `backend/apps/loyalty/tests/test_services.py`)

**Interfaces:**
- Consumes: `core.analytics.track`, constants `CAMPAIGN_CREATED`, `CAMPAIGN_PUBLISHED`, `STAFF_SCAN_RESOLVED`, `REWARD_REDEEMED`, `CAMPAIGN_REWARD_REDEEMED` (Task 1).

- [ ] **Step 1: Write failing tests**

Same patch-the-module pattern as Task 2, one test per hook, placed in the existing test module for each service. Template (adapt object setup by copying the nearest existing test's fixtures/setup in the same file — do NOT invent factories, this repo uses direct ORM writes):

```python
from unittest.mock import patch


@pytest.mark.django_db
def test_create_campaign_tracks_event(<reuse existing fixtures>):
    with patch("apps.campaigns.services.campaign.analytics") as mock_analytics:
        campaign = CampaignService.create_campaign(business, owner_user, valid_data)
    mock_analytics.track.assert_called_once()
    args = mock_analytics.track.call_args
    assert args.args[1] == mock_analytics.CAMPAIGN_CREATED
    assert args.kwargs["business_id"] == str(business.id)
```

Hooks to cover (5 tests total, one each): campaign created, campaign published, loyalty voucher redeemed, campaign reward voucher redeemed, staff scan resolved.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest apps/campaigns/tests/ apps/loyalty/tests/ -v -k "track"`
Expected: FAIL (no analytics import yet).

- [ ] **Step 3: Implement the hooks**

Import `from core import analytics` in each module, then at each success point (after the domain write, still inside the function; atomic blocks are handled by the wrapper):

`campaign.py` — end of `create_campaign`:

```python
analytics.track(
    str(created_by.id),
    analytics.CAMPAIGN_CREATED,
    business_id=str(business.id),
    campaign_id=str(campaign.id),
    campaign_type=str(getattr(campaign, "type", "")),  # verify field name (type/kind) in the model
)
```

`campaign.py` — end of `publish_campaign` (no acting user param — use the owner as distinct id):

```python
analytics.track(
    str(business.owner_id),
    analytics.CAMPAIGN_PUBLISHED,
    business_id=str(business.id),
    campaign_id=str(campaign.id),
)
```

`redemption.py` — end of the voucher-redeem function, after status flips to REDEEMED (verify `customer` FK field name on the voucher model):

```python
analytics.track(
    str(voucher.customer_id),
    analytics.REWARD_REDEEMED,
    business_id=str(staff.business_id),
    voucher_id=str(voucher.id),
    staff_user_id=str(staff.user_id),
)
```

`rewards.py` — end of `redeem_reward_voucher`, same shape with `analytics.CAMPAIGN_REWARD_REDEEMED` and `campaign_id` if reachable from the voucher.

`scan.py` — end of `UnifiedStaffScanService.resolve`, after the scan result is assembled (distinct id = the staff *user*; verify how customer id is reachable from the resolved result):

```python
analytics.track(
    str(staff.user_id),
    analytics.STAFF_SCAN_RESOLVED,
    business_id=str(staff.business_id),
    customer_id=str(customer.id),
)
```

Update each touched docstring with one line naming the emitted event. If a hook point genuinely doesn't exist in your checkout (pre-refactor code), place the call at the closest committed equivalent and note it in the commit body.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest apps/campaigns/tests/ apps/loyalty/tests/ -v`
Expected: all PASS (new + pre-existing).

- [ ] **Step 5: Full backend suite + lint**

Run: `cd backend && pytest && ruff check apps/ core/`
Expected: PASS / clean. Report any pre-existing failures verbatim — do not fix unrelated ones.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/campaigns/ backend/apps/loyalty/
git commit -m "feat(analytics): track campaign, scan, and redemption events"
```

---

### Task 4: Frontend — posthog-js provider + identify

**Files:**
- Create: `frontend/apps/web/app/_components/AnalyticsProvider.tsx`
- Modify: `frontend/apps/web/app/providers.tsx`
- Modify: `frontend/apps/web/package.json` (via `pnpm add`)
- Test: `frontend/apps/web/app/_components/AnalyticsProvider.test.tsx` — **only if** Vitest is already configured for `apps/web` (check for `vitest.config.*` / a `test` script in package.json). If there is no test runner configured, skip the test file, do NOT install a test framework, and state plainly in the commit body + final report that the frontend test was skipped for that reason.

**Interfaces:**
- Consumes: `useMe()` from `@jaqyn/api` (verify it is exported from the package root — `frontend/packages/api/src/index.ts` or the package `exports`; it lives in `src/customer/hooks.ts`. If not re-exported, add it to the package's public surface rather than deep-importing) and `tokenStore` from `@jaqyn/api` (lives in `src/tokens.ts`, same export check).
- Produces: `<AnalyticsProvider>{children}</AnalyticsProvider>` wrapping the app inside `ApiProvider` (it needs the QueryClient for `useMe`).

- [ ] **Step 1: Install dependency**

Run: `cd frontend && corepack pnpm --filter web add posthog-js`
(Verify the filter name matches the package name in `apps/web/package.json` — could be `web` or `@jaqyn/web`.)

- [ ] **Step 2: Create `AnalyticsProvider.tsx`**

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { tokenStore, useMe } from "@jaqyn/api";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// EU cloud endpoint for data residency — must match backend POSTHOG_HOST default.
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

if (typeof window !== "undefined" && KEY) {
  posthog.init(KEY, {
    api_host: HOST,
    // App Router is a SPA — capture client-side route changes as pageviews.
    capture_pageview: "history_change",
    autocapture: true,
    persistence: "localStorage+cookie",
  });
}

/** Ties the PostHog anonymous id to the logged-in user once /me resolves. */
function Identify() {
  // Only fetch /me when a token exists — logged-out visitors stay anonymous.
  const hasToken = typeof window !== "undefined" && !!tokenStore.getAccess();
  const { data: me } = useMe(hasToken);
  useEffect(() => {
    if (KEY && me?.user.id) {
      posthog.identify(me.user.id, { role: me.user.role });
    }
  }, [me?.user.id, me?.user.role]);
  return null;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  // No key (local dev) → analytics fully absent, zero overhead.
  if (!KEY) return <>{children}</>;
  return (
    <PostHogProvider client={posthog}>
      <Identify />
      {children}
    </PostHogProvider>
  );
}
```

Adjust the `me?.user.role` property access to the actual `User` type in `frontend/packages/api/src/customer/types.ts`. If `posthog-js/react`'s `PostHogProvider` prop name differs in the installed version (`client` vs `apiKey`), follow the installed version's types — `tsc` will tell you.

`// ponytail: no posthog.reset() on logout yet — logout flow untouched; add reset when logout analytics matters.`

- [ ] **Step 3: Wire into `providers.tsx`**

Modify `frontend/apps/web/app/providers.tsx` — wrap inside `ApiProvider` (Identify needs the QueryClient):

```tsx
return (
  <ApiProvider>
    <AnalyticsProvider>
      <I18nProvider>{children}</I18nProvider>
    </AnalyticsProvider>
  </ApiProvider>
);
```

Keep the existing service-worker `useEffect` untouched.

- [ ] **Step 4: Export check**

If `useMe`/`tokenStore` are not on `@jaqyn/api`'s public surface, add re-exports to the package entry file (`frontend/packages/api/src/index.ts` or per its `package.json` `exports`) — never deep-import across package roots.

- [ ] **Step 5: Typecheck + lint + build**

Run: `cd frontend && corepack pnpm turbo typecheck lint --filter=web` (adapt task names to what `turbo.json`/package.json actually define; fall back to `corepack pnpm --filter web exec tsc --noEmit`).
Expected: clean.

- [ ] **Step 6: Test (conditional — see Files note)**

If Vitest is configured: mock `posthog-js` and `@jaqyn/api`'s `useMe`, render `<AnalyticsProvider>`, assert `posthog.identify` is called with the user id when `useMe` returns a user and NOT called when it returns null. Otherwise skip and report.

- [ ] **Step 7: Commit**

```bash
git add frontend/apps/web/ frontend/packages/api/ frontend/pnpm-lock.yaml
git commit -m "feat(analytics): add PostHog provider with autocapture and identify"
```

---

### Task 5: Env documentation

**Files:**
- Modify: whichever env documentation exists — search for `.env.example`, `DEPLOY.md` env-var tables, `backend/docs/` config docs: `grep -rln "NEXT_PUBLIC_API_URL\|REDIS_URL" --include="*.example" --include="*.md" . | head`

**Interfaces:** none — docs only.

- [ ] **Step 1: Document the four vars**

Add to every place env vars are documented (match each file's existing format):

```
# Backend
POSTHOG_API_KEY=            # PostHog project API key; empty = analytics off
POSTHOG_HOST=https://eu.i.posthog.com

# Frontend (apps/web)
NEXT_PUBLIC_POSTHOG_KEY=    # same project key; empty = analytics off
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

- [ ] **Step 2: Commit**

```bash
git add <touched docs/env files>
git commit -m "docs(analytics): document PostHog env vars"
```

---

## Final verification (after all tasks)

- [ ] `cd backend && pytest` — full suite green (report pre-existing failures separately, verbatim).
- [ ] `cd frontend && corepack pnpm turbo typecheck lint --filter=web` — clean.
- [ ] `git log --oneline main..HEAD` — 5 conventional commits.
- [ ] Report: hooks placed (with any signature adaptations made due to the working-tree caveat), tests added/passing, anything skipped and why. Do NOT push.
