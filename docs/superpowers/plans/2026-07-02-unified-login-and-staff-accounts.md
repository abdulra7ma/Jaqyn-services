# Unified Login + Password Staff Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners create staff accounts with an auto-generated one-time password (no invite), let staff finish their own profile on first login, and collapse login into one "phone or email" field where the backend decides OTP vs password.

**Architecture:** Backend adds a `login/resolve` endpoint + phone-or-email password auth, a create-staff endpoint returning a one-time password, a staff-profile-complete endpoint, and a `StaffMember.profile_completed` flag surfaced in the auth/me payloads. Frontend replaces the login tabs with a single identifier field, adds a create-staff flow (wizard step 4 + staff page) that reveals the one-time password, and adds a gated `/staff/onboarding` first-login screen.

**Tech Stack:** Django 5 + DRF + SimpleJWT + pytest (backend); Next.js 14 App Router + React 18 + TanStack Query 5 + Vitest + `@jaqyn/api` + `@jaqyn/i18n` (frontend).

## Global Constraints

- Backend: every function/method type-hinted with explicit return types; services raise domain exceptions (`JaqynAPIException`), never sentinels; docstrings on service functions; `transaction.atomic` for multi-write/credential mutations; schema and data migrations in separate files; no secrets/plaintext-password logging.
- Frontend: `strict: true`, no `any`; server/remote state in TanStack Query only; query keys from the existing factories (`qk` in `customer`, `bqk` in `business`); all user-facing copy via `@jaqyn/i18n` (add keys to `packages/i18n/src/locales.ts` for both `ru` and `en`); design tokens/primitives from `@jaqyn/config` + `@jaqyn/ui`; `next/link` over `<a>`.
- Roles use `StaffMember.Role` = `manager | cashier` (verbatim).
- One-time passwords: generated with `secrets.token_urlsafe(_TEMP_PASSWORD_LENGTH)` (`_TEMP_PASSWORD_LENGTH = 16`), returned once, only the hash persisted.
- Branch: `feat/unified-login-staff-accounts`. Conventional Commits.
- Dev login OTP is `DEV_LOGIN_OTP` (e.g. `000000`); must stay empty in prod.

---

## File structure

**Backend (`backend/apps/`)**
- `staff/models.py` — add `StaffMember.profile_completed` (+ 2 migrations).
- `staff/services/management.py` — `create_staff_account`, `complete_staff_profile`.
- `staff/management_views.py` — `POST` create on `StaffTeamListView`.
- `staff/serializers.py` — `StaffCreateSerializer`, `StaffCreateResultSerializer`.
- `staff/views.py` + `staff/urls.py` — `StaffProfileCompleteView` at `/api/staff/profile/complete/`.
- `staff/services/management.py` `_build_invite_row`/`list_team` unchanged (invites left in place).
- `accounts/services.py` — `resolve_login_method`, generalize `authenticate_password` → `authenticate_identifier`; staff-aware profile flag.
- `accounts/serializers.py` — `LoginResolveSerializer`; `PasswordLoginSerializer.identifier`.
- `accounts/views.py` — `LoginResolveView`; `PasswordLoginView` uses identifier; `_auth_payload`/`MeView` surface staff `profile_completed`.
- `accounts/urls.py` — `login/resolve/` route.

**Frontend**
- `packages/api/src/customer/api.ts` + `hooks.ts` + `postAuthRoute.ts` + types — resolve hook, identifier password login, staff `profile_completed` in `Me`/`StaffMembership`.
- `packages/api/src/business/api.ts` + `hooks.ts` + `types.ts` — `useCreateStaffAccount`.
- `packages/api/src/staff/api.ts` (or customer) — `completeStaffProfile`.
- `apps/web/app/login/page.tsx` — unified identifier field.
- `apps/web/app/business/staff/page.tsx` — create-account modal + one-time-password reveal.
- `apps/web/app/business/onboarding/OnboardingFlow.tsx` — step 4 switches to create-account.
- `apps/web/app/staff/onboarding/page.tsx` (new) + `staff/_components/StaffShell.tsx` gate.
- `packages/i18n/src/locales.ts` — new keys.

---

## Task 1: `StaffMember.profile_completed` field + migrations

**Files:**
- Modify: `backend/apps/staff/models.py`
- Create: `backend/apps/staff/migrations/0002_staffmember_profile_completed.py` (schema)
- Create: `backend/apps/staff/migrations/0003_backfill_staff_profile_completed.py` (data)
- Test: `backend/apps/staff/tests/test_staff_accounts.py`

**Interfaces:**
- Produces: `StaffMember.profile_completed: bool` (default `False`).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/staff/tests/test_staff_accounts.py
import pytest
from apps.staff.models import StaffMember

pytestmark = pytest.mark.django_db


def test_staff_member_defaults_profile_incomplete(business_factory):
    member = StaffMember.objects.create(business=business_factory(), name="A", role=StaffMember.Role.CASHIER)
    assert member.profile_completed is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest apps/staff/tests/test_staff_accounts.py::test_staff_member_defaults_profile_incomplete -v`
Expected: FAIL — `AttributeError`/`TypeError` (field absent). (If `business_factory` fixture differs, use the project's existing business factory — check `conftest.py`.)

- [ ] **Step 3: Add the field**

```python
# backend/apps/staff/models.py — inside StaffMember, after is_active
    # First-login profile setup done (name + own password chosen). Owner-created
    # accounts start False and must complete on first login; owner-seeded rows
    # (ensure_owner_staff) and pre-existing rows are backfilled True.
    profile_completed = models.BooleanField(default=False)
```

- [ ] **Step 4: Create the schema migration**

```python
# backend/apps/staff/migrations/0002_staffmember_profile_completed.py
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("staff", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="staffmember",
            name="profile_completed",
            field=models.BooleanField(default=False),
        ),
    ]
```

- [ ] **Step 5: Create the data backfill migration (separate file)**

```python
# backend/apps/staff/migrations/0003_backfill_staff_profile_completed.py
from django.db import migrations


def backfill(apps, schema_editor):
    StaffMember = apps.get_model("staff", "StaffMember")
    # Existing staff are already working — mark them complete so the gate only
    # catches accounts created after this change.
    StaffMember.objects.update(profile_completed=True)


class Migration(migrations.Migration):
    dependencies = [("staff", "0002_staffmember_profile_completed")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
```

- [ ] **Step 6: Update `ensure_owner_staff` to seed completed**

```python
# backend/apps/staff/services/management.py — in ensure_owner_staff defaults dict
        defaults={
            "name": business.owner.name or "Owner",
            "role": StaffMember.Role.MANAGER,  # owner has full staff powers
            "is_active": active,
            "profile_completed": True,  # owner set up their profile during business onboarding
        },
```

- [ ] **Step 7: Run migrations + test**

Run: `cd backend && python manage.py makemigrations --check --dry-run && pytest apps/staff/tests/test_staff_accounts.py -v`
Expected: no new migrations needed (already written); test PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/staff/models.py backend/apps/staff/migrations/0002_staffmember_profile_completed.py backend/apps/staff/migrations/0003_backfill_staff_profile_completed.py backend/apps/staff/services/management.py backend/apps/staff/tests/test_staff_accounts.py
git commit -m "feat(staff): add profile_completed flag with backfill"
```

---

## Task 2: `create_staff_account` service

**Files:**
- Modify: `backend/apps/staff/services/management.py`
- Test: `backend/apps/staff/tests/test_staff_accounts.py`

**Interfaces:**
- Consumes: `StaffMember`, `_TEMP_PASSWORD_LENGTH`, `get_staff_detail(business, staff_id) -> TeamRow`.
- Produces: `create_staff_account(business: Business, phone: str, role: str, name: str = "") -> tuple[StaffMember, str]` — returns member + plaintext one-time password. Raises `JaqynAPIException("CONFLICT", ...)` if the user already has an active membership in this business.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/staff/tests/test_staff_accounts.py — append
from apps.accounts.models import User
from apps.staff.services import management


def test_create_staff_account_creates_user_and_member(business_factory):
    business = business_factory()
    member, password = management.create_staff_account(business, "+996700111222", StaffMember.Role.CASHIER)
    assert member.profile_completed is False
    assert member.is_active is True
    assert member.user is not None
    assert member.user.role == User.Role.STAFF
    assert member.user.check_password(password)  # returned plaintext matches the hash
    assert len(password) >= 16


def test_create_staff_account_conflict_on_existing_membership(business_factory):
    business = business_factory()
    management.create_staff_account(business, "+996700111222", StaffMember.Role.CASHIER)
    with pytest.raises(Exception) as exc:
        management.create_staff_account(business, "+996700111222", StaffMember.Role.MANAGER)
    assert "CONFLICT" in str(exc.value)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest apps/staff/tests/test_staff_accounts.py -k create_staff_account -v`
Expected: FAIL — `AttributeError: module ... has no attribute 'create_staff_account'`.

- [ ] **Step 3: Implement the service**

```python
# backend/apps/staff/services/management.py — add near reset_staff_password
from django.contrib.auth.hashers import make_password  # already imported at top; keep single import
from apps.accounts.models import User


def create_staff_account(
    business: Business, phone: str, role: str, name: str = ""
) -> tuple[StaffMember, str]:
    """Create a staff login for ``business`` and return (member, one-time password).

    Owner-driven, invite-free staff creation. Creates (or reuses) the ``User``
    keyed on ``phone`` with role STAFF, sets an auto-generated password, and
    creates an active ``StaffMember`` with ``profile_completed=False`` so the
    staffer completes their own profile on first login. The plaintext password is
    returned exactly once for the owner to relay; only its hash is persisted.

    Raises ``CONFLICT`` (409) if the user already has an active membership in this
    business. Wrapped in a transaction because it creates an account + credential.
    """
    temp_password = secrets.token_urlsafe(_TEMP_PASSWORD_LENGTH)
    with transaction.atomic():
        user, _created = User.objects.get_or_create(
            phone=phone, defaults={"role": User.Role.STAFF}
        )
        if user.staff_memberships.filter(business=business, is_active=True).exists():
            raise JaqynAPIException(
                "CONFLICT", "This person is already on your team", status_code=409
            )
        user.role = User.Role.STAFF
        user.password = make_password(temp_password)
        user.save(update_fields=["role", "password", "updated_at"])
        member = StaffMember.objects.create(
            business=business,
            user=user,
            name=name or (user.name or ""),
            role=role,
            is_active=True,
            profile_completed=False,
        )
    return member, temp_password
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest apps/staff/tests/test_staff_accounts.py -k create_staff_account -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/staff/services/management.py backend/apps/staff/tests/test_staff_accounts.py
git commit -m "feat(staff): create_staff_account service"
```

---

## Task 3: Create-staff endpoint (`POST /api/business/staff/`)

**Files:**
- Modify: `backend/apps/staff/serializers.py`, `backend/apps/staff/management_views.py`
- Test: `backend/apps/staff/tests/test_staff_accounts.py`

**Interfaces:**
- Consumes: `create_staff_account`, `get_staff_detail`, `TeamRowSerializer`, `_StaffWriteMixin`.
- Produces: `POST /api/business/staff/` body `{phone, role, name?}` → `{ member: <TeamRow>, temp_password: str }`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/staff/tests/test_staff_accounts.py — append
from rest_framework.test import APIClient


def test_create_staff_endpoint_owner_only_and_returns_password(business_factory, owner_client):
    # owner_client: APIClient authed as the business owner (see conftest patterns)
    business, client = owner_client
    resp = client.post("/api/business/staff/", {"phone": "+996700333444", "role": "cashier"}, format="json")
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["temp_password"]
    assert body["member"]["role"] == "cashier"
    assert body["member"]["status"] == "invited"  # not joined until profile completed


def test_create_staff_endpoint_rejects_anonymous():
    resp = APIClient().post("/api/business/staff/", {"phone": "+996700333444", "role": "cashier"}, format="json")
    assert resp.status_code in (401, 403)
```

(If no `owner_client` fixture exists, build the owner + `APIClient().force_authenticate(user=owner)` inline as other staff-management tests do.)

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest apps/staff/tests/test_staff_accounts.py -k create_staff_endpoint -v`
Expected: FAIL — 405 Method Not Allowed (no POST handler) / assertion error.

- [ ] **Step 3: Add serializers**

```python
# backend/apps/staff/serializers.py — append
class StaffCreateSerializer(serializers.Serializer):
    """Input for owner-created staff: phone + role (name optional)."""

    phone = serializers.CharField(max_length=32)
    role = serializers.ChoiceField(choices=StaffMember.Role.choices)
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)


class StaffCreateResultSerializer(serializers.Serializer):
    """Create response: the new team row + the one-time password (shown once)."""

    member = TeamRowSerializer()
    temp_password = serializers.CharField()
```

- [ ] **Step 4: Add the POST handler**

```python
# backend/apps/staff/management_views.py — import serializers at top
from apps.staff.serializers import (
    StaffCreateSerializer,
    StaffCreateResultSerializer,
    # ... existing imports
)

# Replace StaffTeamListView with list + create; keep _OwnerStaffMixin for GET,
# throttle the write like other staff mutations.
class StaffTeamListView(_StaffWriteMixin, APIView):
    """GET list; POST create a staff account (returns a one-time password)."""

    serializer_class = TeamListSerializer

    def get(self, request: Request) -> Response:
        business = self.get_business(request)
        team = services.list_team(business)
        return success_response(TeamListSerializer(team).data)

    def post(self, request: Request) -> Response:
        business = self.get_business(request)
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member, temp_password = services.create_staff_account(
            business,
            serializer.validated_data["phone"],
            serializer.validated_data["role"],
            serializer.validated_data.get("name", ""),
        )
        row = services.get_staff_detail(business, str(member.id))
        return success_response(
            StaffCreateResultSerializer({"member": row, "temp_password": temp_password}).data
        )
```

- [ ] **Step 5: Run tests**

Run: `cd backend && pytest apps/staff/tests/test_staff_accounts.py -k create_staff_endpoint -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/staff/serializers.py backend/apps/staff/management_views.py backend/apps/staff/tests/test_staff_accounts.py
git commit -m "feat(staff): POST /api/business/staff/ create account endpoint"
```

---

## Task 4: Staff profile-complete service + endpoint

**Files:**
- Modify: `backend/apps/staff/services/management.py`, `backend/apps/staff/serializers.py`, `backend/apps/staff/views.py`, `backend/apps/staff/urls.py`
- Test: `backend/apps/staff/tests/test_staff_accounts.py`

**Interfaces:**
- Consumes: `get_staff_for_user(user) -> StaffMember`.
- Produces: `complete_staff_profile(user, name: str, new_password: str) -> StaffMember`; `POST /api/staff/profile/complete/` body `{name, new_password}` (avatar handled separately by the existing `POST /api/auth/avatar/`).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/staff/tests/test_staff_accounts.py — append
def test_complete_staff_profile_sets_name_password_and_flag(business_factory):
    business = business_factory()
    member, temp_password = management.create_staff_account(business, "+996700555666", StaffMember.Role.CASHIER)
    updated = management.complete_staff_profile(member.user, name="Aibek", new_password="newpass12")
    updated.refresh_from_db()
    updated.user.refresh_from_db()
    assert updated.profile_completed is True
    assert updated.name == "Aibek"
    assert updated.user.name == "Aibek"
    assert updated.user.check_password("newpass12")
    assert not updated.user.check_password(temp_password)  # temp password no longer valid
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest apps/staff/tests/test_staff_accounts.py -k complete_staff_profile -v`
Expected: FAIL — no attribute `complete_staff_profile`.

- [ ] **Step 3: Implement the service**

```python
# backend/apps/staff/services/management.py — append
def complete_staff_profile(user, name: str, new_password: str) -> StaffMember:
    """Finish a staff member's first-login setup: name + their own password.

    Sets ``User.name`` and ``StaffMember.name`` to ``name``, replaces the
    auto-generated password with ``new_password``, and flips
    ``profile_completed=True``. Resolves the caller's active membership via
    ``get_staff_for_user`` (raises PERMISSION_DENIED if none). Credential
    mutation → wrapped in a transaction. Avatar is uploaded separately via the
    existing account avatar endpoint.
    """
    member = get_staff_for_user(user)
    with transaction.atomic():
        user.name = name
        user.set_password(new_password)
        user.save(update_fields=["name", "password", "updated_at"])
        member.name = name
        member.profile_completed = True
        member.save(update_fields=["name", "profile_completed", "updated_at"])
    return member
```

- [ ] **Step 4: Add serializer + view + URL**

```python
# backend/apps/staff/serializers.py — append
class StaffProfileCompleteSerializer(serializers.Serializer):
    """Input for staff first-login profile completion."""

    name = serializers.CharField(max_length=255)
    new_password = serializers.CharField(min_length=8, max_length=128)  # min mirrors password reset
```

```python
# backend/apps/staff/views.py — append (imports: IsAuthenticated, success_response, services)
from rest_framework.permissions import IsAuthenticated
from apps.staff.serializers import StaffProfileCompleteSerializer
from apps.staff.services import management


class StaffProfileCompleteView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = StaffProfileCompleteSerializer

    def post(self, request):
        serializer = StaffProfileCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        management.complete_staff_profile(
            request.user,
            serializer.validated_data["name"],
            serializer.validated_data["new_password"],
        )
        return success_response({"profile_completed": True})
```

```python
# backend/apps/staff/urls.py — add import + route
from apps.staff.views import (  # add to existing import
    StaffProfileCompleteView,
)
# in urlpatterns:
    path("profile/complete/", StaffProfileCompleteView.as_view(), name="staff-profile-complete"),
```

- [ ] **Step 5: Run tests**

Run: `cd backend && pytest apps/staff/tests/test_staff_accounts.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/staff/services/management.py backend/apps/staff/serializers.py backend/apps/staff/views.py backend/apps/staff/urls.py backend/apps/staff/tests/test_staff_accounts.py
git commit -m "feat(staff): profile/complete endpoint for first-login setup"
```

---

## Task 5: `login/resolve` endpoint

**Files:**
- Modify: `backend/apps/accounts/services.py`, `backend/apps/accounts/serializers.py`, `backend/apps/accounts/views.py`, `backend/apps/accounts/urls.py`
- Test: `backend/apps/accounts/tests/test_login_resolve.py` (create)

**Interfaces:**
- Produces: `resolve_login_method(identifier: str, ip_address: str | None) -> dict[str, str]` returning `{"method": "otp"|"password", "request_id": str}` (request_id only for otp); `POST /api/auth/login/resolve/` body `{identifier}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/accounts/tests/test_login_resolve.py
import pytest
from apps.accounts.models import User

pytestmark = pytest.mark.django_db


def test_resolve_email_is_password():
    r = __import__("apps.accounts.services", fromlist=["resolve_login_method"]).resolve_login_method(
        "owner@test.local", None
    )
    assert r["method"] == "password"


def test_resolve_phone_with_password_is_password():
    User.objects.create_user(phone="+996700777888", password="pw12345678", role=User.Role.STAFF)
    from apps.accounts.services import resolve_login_method
    assert resolve_login_method("+996700777888", None)["method"] == "password"


def test_resolve_phone_without_password_sends_otp():
    from apps.accounts.services import resolve_login_method
    r = resolve_login_method("+996700999000", None)  # unknown phone → otp signup path
    assert r["method"] == "otp"
    assert r["request_id"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest apps/accounts/tests/test_login_resolve.py -v`
Expected: FAIL — `ImportError`/`AttributeError` (`resolve_login_method` absent).

- [ ] **Step 3: Implement the service**

```python
# backend/apps/accounts/services.py — append (issue_otp already defined above)
def resolve_login_method(identifier: str, ip_address: str | None) -> dict[str, str]:
    """Decide how ``identifier`` signs in: OTP or password.

    Email (contains ``@``) → password. Phone → password when the matched user
    has a usable password (staff/owner); otherwise OTP: the code is sent now and
    the ``request_id`` returned (unknown phones fall through to the OTP signup
    path, matching ``verify_otp``). Note this reveals whether an identifier is
    password-backed — an accepted, throttled enumeration tradeoff.
    """
    if "@" in identifier:
        return {"method": "password"}
    user = User.objects.filter(phone=identifier, is_active=True).first()
    if user is not None and user.has_usable_password():
        return {"method": "password"}
    request_id = issue_otp(identifier, ip_address)
    return {"method": "otp", "request_id": request_id}
```

- [ ] **Step 4: Add serializer, view, URL**

```python
# backend/apps/accounts/serializers.py — append
class LoginResolveSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=255)
```

```python
# backend/apps/accounts/views.py — import LoginResolveSerializer + resolve_login_method; add view
class LoginResolveView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = resolve_login_method(serializer.validated_data["identifier"], request_ip(request))
        return success_response(result)
```

```python
# backend/apps/accounts/urls.py — add import + route (before login-password)
from apps.accounts.views import LoginResolveView  # add to import block
    path("login/resolve/", LoginResolveView.as_view(), name="login-resolve"),
```

- [ ] **Step 5: Run tests**

Run: `cd backend && pytest apps/accounts/tests/test_login_resolve.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/services.py backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_login_resolve.py
git commit -m "feat(auth): login/resolve endpoint (otp vs password)"
```

---

## Task 6: Phone-or-email password login

**Files:**
- Modify: `backend/apps/accounts/services.py`, `backend/apps/accounts/serializers.py`, `backend/apps/accounts/views.py`
- Test: `backend/apps/accounts/tests/test_login_resolve.py`

**Interfaces:**
- Produces: `authenticate_identifier(identifier: str, password: str) -> tuple[User, str, str]`; `PasswordLoginSerializer` field renamed `email` → `identifier`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/accounts/tests/test_login_resolve.py — append
def test_password_login_by_phone(client):
    from apps.accounts.models import User
    User.objects.create_user(phone="+996700222333", password="pw12345678", role=User.Role.STAFF)
    resp = client.post(
        "/api/auth/login-password/", {"identifier": "+996700222333", "password": "pw12345678"},
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["access"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest apps/accounts/tests/test_login_resolve.py -k password_login_by_phone -v`
Expected: FAIL — serializer rejects `identifier` (expects `email`).

- [ ] **Step 3: Generalize the service**

```python
# backend/apps/accounts/services.py — replace authenticate_password
def authenticate_identifier(identifier: str, password: str) -> tuple[User, str, str]:
    """Password login by phone OR email. Returns (user, access, refresh).

    Email (contains ``@``) matches on ``email__iexact``; otherwise on ``phone``.
    Same generic ``INVALID_CREDENTIALS`` on any failure (no user, unusable
    password, wrong password) so the reason isn't leaked.
    """
    if "@" in identifier:
        user = User.objects.filter(email__iexact=identifier, is_active=True).first()
    else:
        user = User.objects.filter(phone=identifier, is_active=True).first()
    if user is None or not user.has_usable_password() or not user.check_password(password):
        raise JaqynAPIException(
            "INVALID_CREDENTIALS", "Invalid credentials", status.HTTP_401_UNAUTHORIZED
        )
    refresh = RefreshToken.for_user(user)
    return user, str(refresh.access_token), str(refresh)


# Backward-compatible alias (any other callers keep working).
def authenticate_password(email, password):
    return authenticate_identifier(email, password)
```

- [ ] **Step 4: Update serializer + view**

```python
# backend/apps/accounts/serializers.py — PasswordLoginSerializer
class PasswordLoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=255)
    password = serializers.CharField(max_length=128)
```

```python
# backend/apps/accounts/views.py — PasswordLoginView.post + import authenticate_identifier
        user, access, refresh = authenticate_identifier(
            serializer.validated_data["identifier"], serializer.validated_data["password"]
        )
```

- [ ] **Step 5: Run tests**

Run: `cd backend && pytest apps/accounts/tests/test_login_resolve.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/services.py backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/tests/test_login_resolve.py
git commit -m "feat(auth): password login by phone or email (identifier)"
```

---

## Task 7: Surface staff `profile_completed` in auth/me payloads

**Files:**
- Modify: `backend/apps/accounts/views.py`
- Test: `backend/apps/accounts/tests/test_login_resolve.py`

**Interfaces:**
- Produces: `_auth_payload` returns `profile_completed` that reflects the landing area (staff → membership flag); `MeView` staff dict includes `profile_completed`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/accounts/tests/test_login_resolve.py — append
def test_me_includes_staff_profile_completed(client):
    from apps.staff.services import management
    from apps.businesses.tests... # use the project's business factory to make a business
    # Create staff via service, log in by password, read /api/auth/me/
    # Assert resp.json()["data"]["staff"]["profile_completed"] is False for a fresh account.
    ...
```

(Fill the factory calls to match project conventions; the assertion is
`data["staff"]["profile_completed"] is False` for a freshly created account and
that a password-login `_auth_payload` for a staff-landing user returns
`profile_completed=False`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest apps/accounts/tests/test_login_resolve.py -k staff_profile_completed -v`
Expected: FAIL — key absent.

- [ ] **Step 3: Make the auth payload staff-aware**

```python
# backend/apps/accounts/views.py — replace _profile_done
def _profile_done(user):
    # Landing area decides which "profile complete" flag matters.
    if resolve_area(user) == "staff":
        membership = user.staff_memberships.filter(is_active=True).first()
        return bool(membership and membership.profile_completed)
    profile = getattr(user, "customer_profile", None)
    return bool(profile and profile.profile_completed)
```

- [ ] **Step 4: Add flag to MeView staff dict**

```python
# backend/apps/accounts/views.py — MeView, staff dict
            data["staff"] = {
                "id": str(membership.id),
                "name": membership.name,
                "role": membership.role,
                "business_id": str(membership.business_id),
                "business_name": membership.business.name,
                "profile_completed": membership.profile_completed,
            }
```

- [ ] **Step 5: Run tests + full backend suite for touched apps**

Run: `cd backend && pytest apps/accounts apps/staff -v && ruff check apps/accounts apps/staff && mypy apps/accounts apps/staff`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/views.py backend/apps/accounts/tests/test_login_resolve.py
git commit -m "feat(auth): surface staff profile_completed in auth and me payloads"
```

---

## Task 8: Frontend api — resolve hook, identifier login, staff flag types

**Files:**
- Modify: `frontend/packages/api/src/customer/api.ts`, `customer/hooks.ts`, and the auth types file (where `AuthResult`/`Me`/`StaffMembership` live — likely `customer/types.ts`).
- Test: `frontend/packages/api/src/customer/*.test.ts` (if hook tests exist) — else covered by Task 9/10 tests.

**Interfaces:**
- Produces:
  - `customerApi.loginResolve(identifier: string): Promise<{ method: "otp" | "password"; request_id?: string }>`
  - `useLoginResolve()` mutation.
  - `customerApi.passwordLogin(identifier: string, password: string)` (renamed param; body `{ identifier, password }`).
  - Types: `StaffMembership.profile_completed: boolean`; `Me.staff?: StaffMembership`.

- [ ] **Step 1: Add api methods**

```typescript
// frontend/packages/api/src/customer/api.ts
export type LoginResolveResult = { method: "otp" | "password"; request_id?: string };

// inside customerApi object:
  loginResolve(identifier: string) {
    return api.post<LoginResolveResult>("/api/auth/login/resolve/", { identifier }, { auth: false });
  },
  passwordLogin(identifier: string, password: string) {
    return api.post<PasswordLoginResult>("/api/auth/login-password/", { identifier, password }, { auth: false });
  },
```

- [ ] **Step 2: Add the resolve hook**

```typescript
// frontend/packages/api/src/customer/hooks.ts
export const useLoginResolve = () =>
  useMutation({ mutationFn: (identifier: string) => customerApi.loginResolve(identifier) });
```

- [ ] **Step 3: Extend types**

```typescript
// wherever StaffMembership / Me are declared (customer/types.ts)
export type StaffMembership = {
  id: string;
  name: string;
  role: string;
  business_id: string;
  business_name: string;
  profile_completed: boolean;
};
```

- [ ] **Step 4: Export new symbols**

```typescript
// frontend/packages/api/src/index.ts (or customer/index barrel)
export { useLoginResolve } from "./customer/hooks";
export type { LoginResolveResult } from "./customer/api";
```

- [ ] **Step 5: Typecheck + build the package**

Run: `cd frontend && pnpm --filter @jaqyn/api build && pnpm --filter @jaqyn/api exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/packages/api/src/customer frontend/packages/api/src/index.ts
git commit -m "feat(api): login resolve hook + identifier password login + staff profile flag"
```

---

## Task 9: `postAuthRoute` staff-onboarding branch

**Files:**
- Modify: `frontend/packages/api/src/customer/postAuthRoute.ts`
- Test: `frontend/packages/api/src/customer/postAuthRoute.test.ts` (create if absent)

**Interfaces:**
- Consumes: `AuthResult { area; profile_completed; is_new; onboarding_completed }`.
- Produces: staff with `profile_completed === false` → `/staff/onboarding`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/packages/api/src/customer/postAuthRoute.test.ts
import { describe, expect, it } from "vitest";
import { postAuthRoute } from "./postAuthRoute";

describe("postAuthRoute", () => {
  it("routes incomplete staff to onboarding", () => {
    expect(postAuthRoute({ area: "staff", profile_completed: false } as never, "/")).toBe("/staff/onboarding");
  });
  it("routes complete staff to /staff", () => {
    expect(postAuthRoute({ area: "staff", profile_completed: true } as never, "/")).toBe("/staff");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && pnpm --filter @jaqyn/api exec vitest run src/customer/postAuthRoute.test.ts`
Expected: FAIL — returns `/staff` for the incomplete case.

- [ ] **Step 3: Add the branch**

```typescript
// frontend/packages/api/src/customer/postAuthRoute.ts — inside postAuthRoute, before areaPath
  if (r.area === "staff" && r.profile_completed === false) {
    return "/staff/onboarding";
  }
```

- [ ] **Step 4: Run test**

Run: `cd frontend && pnpm --filter @jaqyn/api exec vitest run src/customer/postAuthRoute.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/api/src/customer/postAuthRoute.ts frontend/packages/api/src/customer/postAuthRoute.test.ts
git commit -m "feat(api): route staff with incomplete profile to onboarding"
```

---

## Task 10: Unified login page

**Files:**
- Modify: `frontend/apps/web/app/login/page.tsx`
- Modify: `frontend/packages/i18n/src/locales.ts` (identifier field copy)

**Interfaces:**
- Consumes: `useLoginResolve`, `useRequestOtp`, `useVerifyOtp`, `usePasswordLogin`, `postAuthRoute`.

- [ ] **Step 1: Replace tab state with a single identifier + resolve flow**

Rework the component to: one `identifier` input + Continue → `useLoginResolve().mutate(identifier)`:
- `method === "otp"` → the response already sent the code (backend) → set `step = "code"`; on verify, call `useVerifyOtp().mutate({ phone: identifier, code })`.
- `method === "password"` → set `step = "password"` → password field → `usePasswordLogin().mutate({ identifier, password })`.
- All three success handlers call `go(r)` → `postAuthRoute(r, returnTo)`.

```typescript
// frontend/apps/web/app/login/page.tsx — key wiring (replace mode/tabs)
const resolve = useLoginResolve();
const requestOtp = useRequestOtp();
const verifyOtp = useVerifyOtp();
const passwordLogin = usePasswordLogin();
const [step, setStep] = useState<"identifier" | "code" | "password">("identifier");
const [identifier, setIdentifier] = useState("");
const [code, setCode] = useState("");
const [password, setPassword] = useState("");

function onContinue() {
  resolve.mutate(identifier, {
    onSuccess: (r) => setStep(r.method === "password" ? "password" : "code"),
  });
}
// code step: verifyOtp.mutate({ phone: identifier, code }, { onSuccess: (r) => go(r) })
// resend on code step: requestOtp.mutate(identifier)
// password step: passwordLogin.mutate({ identifier, password }, { onSuccess: (r) => go(r) })
```

Remove the phone/email segmented tabs. Keep "forgot password" (visible on the `password` step) and the social-soon block. Use `@jaqyn/ui` primitives; one label `t("auth.identifier")` + placeholder `t("auth.identifierPlaceholder")`.

- [ ] **Step 2: Add i18n keys**

```typescript
// frontend/packages/i18n/src/locales.ts — ru + en
// ru:
"auth.identifier": "Телефон или email",
"auth.identifierPlaceholder": "+996 700 123456 или you@email.com",
"auth.continue": "Продолжить",
// en:
"auth.identifier": "Phone or email",
"auth.identifierPlaceholder": "+996 700 123456 or you@email.com",
"auth.continue": "Continue",
```

- [ ] **Step 3: Typecheck + live smoke (manual verify happens in Task 15)**

Run: `cd frontend && pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/app/login/page.tsx frontend/packages/i18n/src/locales.ts
git commit -m "feat(login): unified identifier field with backend-decided otp/password"
```

---

## Task 11: Frontend api — create-staff hook

**Files:**
- Modify: `frontend/packages/api/src/business/api.ts`, `business/hooks.ts`, `business/types.ts`

**Interfaces:**
- Produces:
  - `businessApi.createStaffAccount(p: { phone: string; role: "manager" | "cashier"; name?: string }): Promise<{ member: TeamRow; temp_password: string }>`
  - `useCreateStaffAccount()` — invalidates `bqk.team`.

- [ ] **Step 1: Add types + api method**

```typescript
// frontend/packages/api/src/business/types.ts
export type CreateStaffPayload = { phone: string; role: "manager" | "cashier"; name?: string };
export type CreateStaffResult = { member: TeamRow; temp_password: string };
```

```typescript
// frontend/packages/api/src/business/api.ts — inside businessApi
  createStaffAccount(p: CreateStaffPayload) {
    return api.post<CreateStaffResult>("/api/business/staff/", p);
  },
```

- [ ] **Step 2: Add the hook**

```typescript
// frontend/packages/api/src/business/hooks.ts
export const useCreateStaffAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CreateStaffPayload) => businessApi.createStaffAccount(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.team }),
  });
};
```

- [ ] **Step 3: Export + typecheck**

```typescript
// business barrel / index.ts
export { useCreateStaffAccount } from "./business/hooks";
export type { CreateStaffPayload, CreateStaffResult } from "./business/types";
```

Run: `cd frontend && pnpm --filter @jaqyn/api build && pnpm --filter @jaqyn/api exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/api/src/business frontend/packages/api/src/index.ts
git commit -m "feat(api): useCreateStaffAccount hook"
```

---

## Task 12: Business staff page — create-account modal + one-time password

**Files:**
- Modify: `frontend/apps/web/app/business/staff/page.tsx`
- Modify: `frontend/packages/i18n/src/locales.ts`

**Interfaces:**
- Consumes: `useCreateStaffAccount`.

- [ ] **Step 1: Replace the invite modal with create-account**

Change the add-staff modal (currently `useAddStaffInvite` with `{full_name, contact, role}`) to collect **phone + role** and call `useCreateStaffAccount`. On success, switch the modal to a **one-time password panel** showing `result.temp_password` with a copy button and clear "share this — you won't see it again" copy. Keep role choices `manager | cashier`.

```typescript
const create = useCreateStaffAccount();
const [pwResult, setPwResult] = useState<string | null>(null);
// submit:
create.mutate(
  { phone: phone.trim(), role },
  { onSuccess: (r) => setPwResult(r.temp_password) },
);
// when pwResult set: render the reveal panel with a copy-to-clipboard button; Close resets pwResult + closes.
```

Remove `useAddStaffInvite`/`useRemoveStaffInvite` usage from this page.

- [ ] **Step 2: Add i18n keys**

```typescript
// locales.ts ru + en — e.g.
"staff.create.title" / "staff.create.phone" / "staff.create.role" / "staff.create.submit"
"staff.create.passwordTitle" / "staff.create.passwordHelp" / "staff.create.copy" / "staff.create.done"
```

(Provide ru + en strings for each; e.g. en `"staff.create.passwordHelp": "Share this password with the staffer. You won't see it again."`)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/app/business/staff/page.tsx frontend/packages/i18n/src/locales.ts
git commit -m "feat(staff-page): create account with one-time password"
```

---

## Task 13: Onboarding wizard step 4 → create-account

**Files:**
- Modify: `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx`
- Modify: `frontend/apps/web/app/business/onboarding/schema.ts` (roles → manager/cashier)
- Modify: `frontend/apps/web/app/business/onboarding/OnboardingFlow.test.tsx`

**Interfaces:**
- Consumes: `useCreateStaffAccount`, `useTeam` (to list created staff).

- [ ] **Step 1: Swap the invite hooks for create + team list**

In `OnboardingFlow.tsx`, replace the staff-invite imports/usage (`useStaffInvites`, `useAddStaffInvite`, `useRemoveStaffInvite`) with `useTeam` (list) + `useCreateStaffAccount` (create). `StageStaff` collects **phone + role**, calls create, and on success shows the one-time password inline (same reveal pattern as Task 12). The list shows created members with a "Not joined" badge until `profile_completed`.

- [ ] **Step 2: Update roles in `schema.ts`**

```typescript
// schema.ts — replace STAFF_ROLES + ROLE_HINT + StaffRole
export type StaffRole = "manager" | "cashier";
export const STAFF_ROLES: { v: StaffRole; label: string }[] = [
  { v: "manager", label: "Manager" },
  { v: "cashier", label: "Cashier" },
];
export const ROLE_HINT: Record<StaffRole, string> = {
  manager: "Manage profile, menu, staff, campaigns & reports",
  cashier: "Scan QR, validate visits & redeem rewards",
};
```

- [ ] **Step 3: Update the existing onboarding test mock**

The `OnboardingFlow.test.tsx` `@jaqyn/api` mock lists `useStaffInvites/useAddStaffInvite/useRemoveStaffInvite`. Replace those mock entries with `useTeam: () => ({ data: { members: [], counts: {...} }, isLoading: false })` and `useCreateStaffAccount: () => ({ mutate: vi.fn(), isPending: false })`. Keep the 4 existing tests green.

- [ ] **Step 4: Typecheck + run onboarding tests**

Run: `cd frontend && pnpm --filter web exec tsc --noEmit && pnpm --filter web exec vitest run app/business/onboarding`
Expected: PASS (all onboarding tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/business/onboarding
git commit -m "feat(onboarding): step 4 creates staff accounts (no invite)"
```

---

## Task 14: Staff first-login onboarding screen + gate

**Files:**
- Create: `frontend/apps/web/app/staff/onboarding/page.tsx`
- Modify: `frontend/apps/web/app/staff/_components/StaffShell.tsx`
- Modify: `frontend/packages/api/src/staff/api.ts` (+ hook), `frontend/packages/i18n/src/locales.ts`

**Interfaces:**
- Consumes: `useStaffAuth` (`staff.profile_completed`), existing avatar upload `POST /api/auth/avatar/`.
- Produces: `completeStaffProfile({ name, new_password })` → `POST /api/staff/profile/complete/`; `useCompleteStaffProfile()`.

- [ ] **Step 1: Add api method + hook**

```typescript
// frontend/packages/api/src/staff/api.ts — inside staffApi
  completeProfile(body: { name: string; new_password: string }) {
    return api.post<{ profile_completed: boolean }>("/api/staff/profile/complete/", body);
  },
```

```typescript
// staff hooks (co-located) — invalidate the me query so the gate re-reads
export const useCompleteStaffProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name: string; new_password: string }) => staffApi.completeProfile(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};
```

- [ ] **Step 2: Add the gate to StaffShell**

```typescript
// frontend/apps/web/app/staff/_components/StaffShell.tsx — after useStaffAuth()
const router = useRouter();
useEffect(() => {
  if (staff && staff.profile_completed === false) router.replace("/staff/onboarding");
}, [staff, router]);
```

The `/staff/onboarding` page must NOT render `StaffShell` (it renders its own minimal chrome) to avoid a redirect loop.

- [ ] **Step 3: Build the onboarding screen**

```typescript
// frontend/apps/web/app/staff/onboarding/page.tsx  ("use client")
// Fields: name (required), new password (required, min 8), avatar (optional).
// Avatar: upload via the existing /api/auth/avatar/ endpoint (reuse the account
// avatar hook if present; else a small multipart POST) BEFORE or independent of
// completeProfile. On completeProfile success → router.replace("/staff").
// Guard: read useStaffAuth(); if profile_completed already true → redirect /staff.
```

Use `@jaqyn/ui` inputs/button + `@jaqyn/i18n` copy. Password field `type="password"`, `minLength 8`.

- [ ] **Step 4: Add i18n keys**

```typescript
// locales.ts ru + en:
"staff.onboarding.title" / "staff.onboarding.name" / "staff.onboarding.password"
"staff.onboarding.avatar" / "staff.onboarding.submit"
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && pnpm --filter web exec tsc --noEmit && pnpm --filter @jaqyn/api build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/app/staff frontend/packages/api/src/staff frontend/packages/i18n/src/locales.ts
git commit -m "feat(staff): first-login onboarding screen + profile-completed gate"
```

---

## Task 15: Full verification (typecheck, lint, tests, live)

**Files:** none (verification only).

- [ ] **Step 1: Backend gates**

Run: `cd backend && pytest apps/accounts apps/staff apps/businesses -q && ruff check apps/accounts apps/staff && mypy apps/accounts apps/staff`
Expected: PASS / clean.

- [ ] **Step 2: Frontend gates**

Run: `cd frontend && pnpm --filter @jaqyn/api build && pnpm --filter web exec tsc --noEmit && pnpm --filter web exec eslint app/login app/staff app/business/staff app/business/onboarding && pnpm --filter web exec vitest run app/business/onboarding packages/api/src/customer/postAuthRoute.test.ts`
Expected: PASS.

- [ ] **Step 3: Live walk-through (preview + backend)**

Using the `web-preview` launch config (`:3100`, proxy → `127.0.0.1:8000`) and the owner test account (`+996700000900`, dev OTP `000000`):
1. Owner → `/business/staff` → create a staff account (phone `+996700123123`, role cashier) → confirm the one-time password panel appears; copy it.
2. Log out → `/login` → enter the **new staff phone** → Continue → confirm it routes to the **password** step (resolve returned `password`) → enter the one-time password → confirm redirect to **`/staff/onboarding`**.
3. Complete name + new password (+ avatar) → confirm redirect to `/staff` and that the gate no longer fires on reload.
4. Log out → log in again with the new phone + the **new** password → confirm success (temp no longer needed).
5. Owner login: enter owner phone → resolve → confirm the OTP-vs-password behaviour is correct for owner.
6. Confirm no console errors and the `POST /api/business/staff/`, `POST /api/auth/login/resolve/`, `POST /api/staff/profile/complete/` requests all return 200 (preview_network).

- [ ] **Step 4: Final commit (if any verification fixups)**

```bash
git add -A && git commit -m "test: verify unified login + staff accounts flow"
```

---

## Self-review notes

- Spec coverage: unified login (T5,T6,T8,T9,T10), create-staff no-invite (T2,T3,T11,T12,T13), staff self-onboarding name+password+avatar (T1,T4,T7,T9,T14), StaffInvite left in place (T13 stops using it; model untouched). All covered.
- Enumeration tradeoff (spec §Feature 1) implemented + commented in T5.
- Migrations split schema/data (T1) per the migration rule.
- Avatar reuses the existing `/api/auth/avatar/` endpoint (no new upload endpoint) — noted in T14.
</content>
</invoke>
