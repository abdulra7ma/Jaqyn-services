# Spec: Landing → Backend → Admin Approve → Email → Onboarding

Status: approved (decisions locked 2026-06-25). Owner: this session.

## Goal

Close the broken chain so a brand-new business can self-serve:

1. Visitor fills the **landing page** lead form → POSTs to backend → a `Business` row is
   created (`status=pending`, `owner=null`) carrying the prospective owner's name + email.
2. Admin opens **Django admin**, reviews, **Approves**.
3. Approval auto-generates a single-use owner invite and **emails the activation link**.
4. Owner clicks the link → `/business/activate?token=…` → sets name + password → JWT issued.
5. Owner completes the **onboarding wizard** → submits for verification.

A **Mailpit** container catches the dev email so the link is clickable at `localhost:8025`.

## Locked decisions

- **Reuse `Business`** (no separate lead model). Landing creates the `Business` directly.
- **Email sends on admin approve** (single step — covers both the Django admin action and
  the `POST /api/admin/businesses/<id>/approve/` API; both call `approve_business()`).
- **Add an email field** to the landing form (activation is email-based).

## Non-goals

- No prod SMTP provider wiring (only Mailpit for dev + env-driven SMTP settings).
- No admin lead-triage UI beyond the existing Django admin Business list.
- No change to the staff-invite or verification/publish flows.

---

## Backend changes (owner: backend agent)

### 1. Model — `apps/businesses/models.py`

Add two **nullable** fields to `Business` (additive, safe migration):

```python
# Prospective owner captured by the public landing lead form, before an owner
# account exists. Consumed once at admin-approval to mint the owner invite; null
# for in-app registrations (which already have an owner).
pending_owner_name = models.CharField(max_length=255, blank=True)
pending_owner_email = models.EmailField(blank=True, null=True)
```

Migration: a **schema-only** migration, `add nullable column` (no backfill, no NOT NULL).
Separate file, reviewed for lock safety (nullable add = non-blocking).

### 2. Lead service — `apps/businesses/services.py`

```python
def register_business_lead(data: BusinessLeadData) -> Business:
    """Create a PENDING, owner-less Business from a public landing submission.

    Maps the landing payload onto Business fields, normalises category to a
    Business.Category member (falls back to OTHER), stores the prospective owner's
    name/email on pending_owner_*. No owner is attached — that happens at invite
    activation. Returns the created Business. Pure create; no side effects.
    """
```

Return a typed object (dataclass/serializer), **not** a bare dict (backend.md).

Modify `approve_business()` to trigger the invite + email, idempotently:

```python
@transaction.atomic
def approve_business(business, admin_user=None):
    business.status = Business.Status.APPROVED
    business.save(update_fields=["status", "updated_at"])
    emit_event("business_approved", business_id=str(business.id))
    if admin_user:
        emit_event("admin_approved_business", ...)
    _send_owner_invite_if_needed(business)   # see below
    return business


def _send_owner_invite_if_needed(business) -> None:
    """Mint an owner invite and schedule the activation email — once.

    Guard: only when the business has NO owner yet AND a pending_owner_email AND no
    existing PENDING owner invite (idempotent: re-approving never re-sends). The
    email is dispatched via transaction.on_commit so the worker never reads a row
    the outer txn hasn't committed (backend.md Celery rule). The raw token is
    generated here (never stored) and handed to the task.
    """
    if business.owner_id is not None or not business.pending_owner_email:
        return
    if business.owner_invites.filter(status=BusinessOwnerInvite.Status.PENDING).exists():
        return
    invite, raw = generate_owner_invite(business, email=business.pending_owner_email)
    transaction.on_commit(
        lambda: send_owner_invite_email.delay(str(invite.id), raw)
    )
```

### 3. Celery task — new `apps/businesses/tasks.py`

```python
@shared_task(bind=True, max_retries=3, retry_backoff=True, time_limit=30)
def send_owner_invite_email(self, invite_id: str, raw_token: str) -> None:
    """Render and send the owner-activation email for a PENDING invite (idempotent).

    Loads the invite by id, builds the activation URL
    {FRONTEND_URL}/business/activate?token=<raw_token>, renders the html+txt
    templates, and sends to invite.email. raw_token is passed in (the hash is all
    that's stored) — it transits the broker because the link cannot otherwise be
    reconstructed; tokens are single-use and short-lived (5 days).
    """
```

- Pass **ids + the token value**, not model instances (token is a value, allowed).
- Use `EmailMultiAlternatives` (text body + HTML alternative).
- Never log the token (backend.md).

### 4. Email templates — `apps/businesses/templates/businesses/`

`owner_invite_email.txt` and `owner_invite_email.html`. Context:
`{business_name, owner_name, activation_url, expires_days}`. Plain, branded-lite.
(App-dir templates are auto-discovered — `APP_DIRS=True`.)

### 5. Serializer — `apps/businesses/serializers.py`

`BusinessLeadSerializer` (shape/format only): `name` (required), `owner_name`
(required), `email` (required, EmailField), `phone` (required), `category`
(optional), `area` (optional), `instagram_url` (optional). Business-rule mapping
(category normalisation) lives in the service, not here.

### 6. View + URL — `apps/businesses/views.py`, `public_urls.py`

```python
class BusinessLeadCreateView(APIView):
    # Public: the landing page is unauthenticated. Throttled so the open endpoint
    # can't be hammered into spam.
    permission_classes = [AllowAny]
    throttle_scope = "business_lead"
    def get_throttles(self): return [ScopedRateThrottle()]
    serializer_class = BusinessLeadSerializer

    def post(self, request):
        s = BusinessLeadSerializer(data=request.data); s.is_valid(raise_exception=True)
        business = register_business_lead(s.validated_data)
        return success_response({"id": str(business.id)}, status=201)
```

Route in `public_urls.py`: `path("register-lead/", BusinessLeadCreateView.as_view(), ...)`
→ **`POST /api/businesses/register-lead/`**.

### 7. Settings — `config/settings/base.py`

Add an email block (env-driven; console fallback so non-docker dev still works):

```python
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "1025"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "false").lower() == "true"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "Jaqyn <noreply@jaqyn.local>")
```

Add throttle scope to `DEFAULT_THROTTLE_RATES`: `"business_lead": "10/min"` (commented).

### 8. Admin — `apps/businesses/admin.py`

Surface `pending_owner_name` / `pending_owner_email` in `list_display` + `search_fields`
so the admin sees who to approve.

### 9. Tests — `apps/businesses/tests/`

- `register-lead`: anon happy path creates PENDING owner-less Business w/ pending_owner_*;
  bad payload 400; throttle class present.
- `approve_business`: with pending email + no owner → exactly one PENDING invite created
  and `send_owner_invite_email` enqueued (assert via `on_commit`/eager); re-approve →
  no second invite (idempotent); owner-already-set business → no invite.
- Task: renders activation URL with the token; sends to invite.email (use
  `django.core.mail.outbox` with `locmem` backend in tests).

---

## Infra + landing changes (owner: infra/landing agent)

### 10. Mailpit — `docker-compose.yml`

```yaml
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "8025:8025"   # Web UI
      - "1025:1025"   # SMTP
    environment:
      MP_SMTP_BIND_ADDR: 0.0.0.0:1025
      MP_UI_BIND_ADDR: 0.0.0.0:8025
```

Add `mailpit` to `web`, `worker`, `beat` `depends_on` (the worker sends the mail).

### 11. Env — `.env.example`, `.env.prod.example`

Dev (`.env.example`): SMTP → Mailpit, plus the landing origin for CORS:

```
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=mailpit
EMAIL_PORT=1025
EMAIL_USE_TLS=false
DEFAULT_FROM_EMAIL=Jaqyn <noreply@jaqyn.local>
# Landing dev server origin (Vite) — needed for the public register-lead POST.
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

Prod example: documented SMTP vars (no secrets), TLS on, real provider host.

### 12. Landing form — `landing/src/`

- `LeadForm.tsx`: add a **required email** input (`FormFields.email`); wire label via i18n.
- `App.tsx`: `EMPTY_FORM` gains `email: ''`; `handleSubmit` calls a real API util.
- New `landing/src/api.ts`: `submitLead(form)` → `POST ${VITE_API_URL}/api/businesses/register-lead/`
  with `{name, owner_name: owner, email, phone: '+996'+phone, category: cat, area, instagram_url: ig}`.
  Set `formState='error'` on failure (add to `FormState` union + a small error message).
- `VITE_API_URL` via `import.meta.env.VITE_API_URL` (default `http://localhost:8000`);
  add `landing/.env.example` with `VITE_API_URL=http://localhost:8000`.
- Validate before submit (email + required fields). Show the existing success panel only
  on a real 201.

### Payload contract (both agents must match)

`POST /api/businesses/register-lead/`
```json
{ "name": "...", "owner_name": "...", "email": "...", "phone": "+996...",
  "category": "cafe", "area": "...", "instagram_url": "..." }
```
→ `201 { "data": { "id": "<uuid>" } }` (envelope via `success_response`).

---

## E2E test (owner: testing agent, after both land)

`docker compose up` (db, redis, web, worker, beat, mailpit, frontend) + landing dev server.

1. POST a lead (curl or landing form) → assert 201 + Business PENDING in DB.
2. Approve via Django admin action (create superuser) **or** `approve_business` shell call.
3. Open `http://localhost:8025` (Mailpit) → assert one email to the lead address with an
   activation link.
4. Extract the token, hit `GET /api/business/invites/validate/?token=…` → 200.
5. `POST /api/business/invites/activate/` `{token, full_name, password}` → JWT + business_id.
6. `GET /api/business/onboarding/` with the JWT → 200 (IN_PROGRESS).

Report: each step pass/fail with the actual response. State skips plainly.

## Rollout / ordering

1. Backend agent + Infra-landing agent run in **parallel** (no shared files:
   backend owns `base.py`/python; infra owns `docker-compose`/`.env`/`landing`).
2. Backend agent runs `makemigrations` + `pytest` for the businesses app.
3. Testing agent runs the E2E only after both report green.
