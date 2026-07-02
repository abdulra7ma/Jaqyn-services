# Prospect Pitch Link — Design Spec

**Date:** 2026-07-02
**Status:** approved (design), pending implementation plan
**Service:** backend (apps/businesses) + frontend (apps/web)

## Problem

Sales is founder-led door-to-door / Instagram DM in Bishkek. We need a
conversion asset that turns a cold prospect into a claimed, onboarding business
in one tap-through. The founder pre-builds the prospect's business in admin
(name, logo, category); the prospect opens a personalized link, sees **their own
business already live inside Jaqyn** (logo on a branded loyalty card, stamps they
can tap to fill), scrolls the business-value story, then claims it with
email + 6-digit code — landing directly in onboarding with everything pre-filled.

The hook is emotional: *it's already made for you, just take it.*

## Decisions (locked)

- **Approach A — dedicated `PitchInvite`.** Not reusing `QRCodeToken` (no claim
  semantics, no open-tracking) or `BusinessOwnerInvite` (admin sets its email;
  here the prospect types their own, and TTL/flow diverge).
- **Business pre-created, claimed on verify.** Admin creates a real `PENDING`
  `Business` (name, logo, category, `owner=null`) when generating the link.
  Email verify attaches `owner`, flips `onboarding_status=IN_PROGRESS`, starts trial.
- **No password at claim.** Verify returns JWT (magic-link style); the user is
  created with an unusable password. Password (if ever) is set later. This matches
  the existing email-OTP `verify` returning tokens directly.
- **Reward editor carries into onboarding.** The prospect can edit the goal count
  and reward text on the hero card before claiming. The chosen values ride in the
  `verify` request body and become the business's first **draft** campaign — so
  onboarding shows «6-й кофе бесплатно — вы выбрали». Not persisted before claim
  (no orphan data if the link is ignored).
- **Russian, mobile-first.** Opened from an IG DM on a phone (~390px). Desktop
  secondary (variant exists).

## Workflows (end-to-end)

### W1 — Founder creates & sends a pitch link
1. Founder opens the prospect's `Business` in Django admin (already created via the
   existing demo/lead flow, or created fresh here with name + logo + category, `PENDING`, `owner=null`).
2. Clicks **«Создать pitch-ссылку»** on the change page.
3. Backend `generate_pitch_invite` mints a `PitchInvite` (`status=pending`, 30-day expiry),
   returns the raw token once.
4. Admin shows the full URL `{FRONTEND_URL}/pitch/{raw}` in a copyable success message.
   Raw token is never stored — only its sha256 hash. If lost, generate a new one.
5. Founder pastes the link into an Instagram DM / WhatsApp to the owner.

### W2 — Prospect opens the link (resolve)
1. Owner taps the link → `/pitch/[token]` → `GET /api/pitch/{token}/`.
2. `resolve_pitch` validates: exists, not expired, not claimed.
   - First resolve flips `pending → opened`, stamps `opened_at`, emits `pitch_opened`.
   - Subsequent resolves keep `opened` (idempotent, no re-emit).
3. Response: business name, logo URL, category, category-default program
   (goal + reward text), published-business count for social proof.
4. Page renders hero card + feature blocks + sticky CTA.
5. Owner plays: taps stamps (visual only), edits reward goal/text (held in client state).

### W3 — Prospect claims (email → code → onboarding)
1. Taps «Забрать бизнес» → email sheet (state B).
2. Submits email → `POST /api/pitch/{token}/claim/ {email}` → `request_pitch_code`:
   validates invite still claimable, issues 6-digit code to `pitch_otp:{token}`,
   sends email (via `transaction.on_commit`), emits `pitch_code_requested`. → code sheet (C).
3. Submits code + the (possibly edited) `goal` + `reward_text` →
   `POST /api/pitch/{token}/verify/` → `claim_pitch`:
   - Verify code (attempt limit, expiry).
   - `select_for_update` on the invite; reject if already `claimed`.
   - Get-or-create `User` as `BUSINESS_OWNER`, unusable password.
   - Attach `business.owner`, `onboarding_status=IN_PROGRESS`, `start_trial(business)`.
   - Create the chosen **draft** campaign from `goal`/`reward_text`.
   - Invite → `claimed`, stamp `claimed_at`/`claimed_email`.
   - Emit `pitch_claimed`; return JWT + user + business.
4. Success pop (D) → `postAuthRoute` → onboarding, pre-filled (logo, name,
   «{reward} — вы выбрали»).

### W4 — Edge / failure flows
- **Expired or already-claimed link** (W2 step 2 fails): `resolve` raises `Gone` →
  frontend dead-link screen («Ссылка больше не активна» + Telegram CTA). Never a 404.
- **Wrong code** (W3 step 3): `INVALID_OTP` → code boxes error state, stay on sheet.
- **Code expired / too many attempts**: `OTP_EXPIRED` / `RATE_LIMITED` → message +
  offer resend (60s cooldown, re-runs `request_pitch_code`).
- **Email belongs to an existing user**: get-or-create returns them; they claim the
  business with their existing account (no duplicate). If that user *already owns a
  business* (`Business.owner` is OneToOne), raise `ConflictError` → frontend message
  «Этот email уже владеет бизнесом».
- **Race: two verifies at once**: `select_for_update` serializes; the second sees
  `claimed` and gets `ConflictError`.

## Architecture

### Backend — `apps/businesses`

**Model `PitchInvite`** (mirrors `BusinessOwnerInvite` token mechanics):
- `business` FK → Business (CASCADE)
- `token_hash` CharField unique (sha256 of raw `secrets.token_urlsafe(32)`; raw
  shown once in admin, never stored — reuse `hash_token` from `onboarding_services`)
- `status` TextChoices: `pending` → `opened` → `claimed`; plus `expired`
- `expires_at` DateTime (default TTL 30 days — a sales cycle, not a security window)
- `opened_at`, `claimed_at` nullable DateTime
- `claimed_email` EmailField nullable
- TimeStamped

**Service module `apps/businesses/pitch_services.py`** (all business logic; views
stay thin, raise domain exceptions from the existing `JaqynAPIException` family):
- `generate_pitch_invite(business, ttl_days=30) -> tuple[PitchInvite, str]`
  — mint invite, return `(invite, raw_token)`.
- `resolve_pitch(raw_token) -> PitchView` — validate (exists, not expired, not
  claimed), flip `pending→opened` + stamp `opened_at` on first resolve, emit
  `pitch_opened`. Returns a typed view: business name, logo URL, category, a
  category-default program preview (goal + reward text), and a live count of
  published businesses for social proof. Raises `NotFound`/`Gone` for
  missing/expired/claimed.
- `request_pitch_code(raw_token, email, ip) -> None` — validate invite claimable,
  issue a 6-digit code via the existing email-OTP infra under a **separate cache
  namespace** `pitch_otp:{token}` (do not collide with signup `email_otp:`), same
  rate limits (`OTP_RATE_LIMIT_*`, `OTPThrottle`). Emit `pitch_code_requested`.
- `claim_pitch(raw_token, email, code, goal, reward_text) -> ClaimResult`
  — verify code; get-or-create User as `BUSINESS_OWNER` with unusable password;
  under `transaction.atomic` + `select_for_update` on the invite: attach
  `business.owner`, set `onboarding_status=IN_PROGRESS`, `start_trial(business)`,
  create the chosen **draft** campaign, flip invite `claimed` + `claimed_at` +
  `claimed_email`. Single-use: a claimed invite rejects re-verify. Emit
  `pitch_claimed`. Return JWT access/refresh + user + business (shape reused by
  frontend `postAuthRoute`). All post-commit side effects via
  `transaction.on_commit`.

**Endpoints** (`apps/businesses/pitch_views.py`, `AllowAny` deliberate + commented,
throttled, added to `config/urls.py`):
- `GET  /api/pitch/{token}/` → resolve
- `POST /api/pitch/{token}/claim/` `{email}` → request code
- `POST /api/pitch/{token}/verify/` `{email, code, goal, reward_text}` → claim

### Django Admin — screens & actions (`apps/businesses/admin.py`, django-unfold)

The admin is the founder's entire control surface for this feature — no separate
internal tool. Three concrete touchpoints on the existing `BusinessAdmin`:

**A. Business change page — «Создать pitch-ссылку» button.**
- A django-unfold change-form action (button in the object toolbar, next to the
  existing approve/reject actions), enabled only when the business has no active
  claimed invite.
- On click: calls `generate_pitch_invite(business)`, then renders a
  `messages.success` containing the full copyable URL and a note «Ссылка активна
  30 дней. Токен показан один раз.» The raw token appears only here.
- If an unexpired unclaimed invite already exists, offer «Показать / пересоздать» —
  regenerate mints a new token and marks the old invite `expired` (single active
  link per business).

**B. Changelist — pitch-status column.**
- New `list_display` column **«Pitch»** rendering a colored unfold badge from
  `PitchInvite.status`: `— Не отправлено` (neutral), `Открыто` (amber),
  `Забрано` (sage). Derived from the latest invite per business
  (annotate to avoid N+1; assert with `django_assert_num_queries`).
- Add to `list_filter` so the founder can filter «Открыто но не забрано» — the
  literal follow-up call list. Sortable by status.

**C. PitchInvite inline (read-only) on the Business change page.**
- A `TabularInline` (like the existing `BusinessNoteInline`) listing this
  business's invites: masked token (last 4 of hash), status, `created_at`,
  `opened_at`, `claimed_at`, `claimed_email`. Append-only, no edit/delete —
  it's an audit trail of outreach attempts.
- On claim, `claim_pitch` also writes a `BusinessNote`
  (`kind=STATUS_CHANGE`, «Бизнес забран через pitch-ссылку ({email})») so the
  existing onboarding thread shows the claim event alongside approvals.

**D. Optional standalone `PitchInviteAdmin`** (low priority) — a flat cross-business
list of all invites for a funnel-at-a-glance view (opened vs claimed counts).
Skip for v1 unless the changelist column proves insufficient; the column + filter
cover the daily follow-up need.

**Analytics** (rides on shipped `core.analytics`): `pitch_opened`,
`pitch_code_requested`, `pitch_claimed`, distinct_id = business id (pre-claim) then
user id (on claim), properties ids/enums only.

### Frontend — `apps/web`

**Route `/pitch/[token]/page.tsx`** (client component; fetches via a
`usePitchResolve(token)` TanStack Query hook in `@jaqyn/api`). Single scrolling
page, states per the approved screens:

- **Hero:** wallet card with business logo + accent gradient (reuse
  `_lib/wallet.ts` accent logic + card visuals). **Tap-to-stamp** — tapping empty
  stamps fills them (framer-motion, already a dep), 6th → ★ + reward burst.
  **Inline reward editor** — the reward pill opens a stepper (goal `−/+`) + reward
  text field; card preview updates live; chosen values held in component state.
- **Feature-value blocks** (6, marketing-only, no backend): retention, on-the-map
  (personalized «{name} и N заведения рядом»), group campaigns («1 гость → 3
  друга → печать всем»), analytics (count-up ring/bars), vouchers, no-app/POS-parallel.
- **Social proof:** «Заведения Бишкека уже переходят в Jaqyn» (+ live count when real).
- **Sticky CTA** «Забрать бизнес — 3 месяца бесплатно», visible through scroll and
  behind both interactions — claimable at any moment.
- **Claim sheet** (bottom sheet): B email → C 6-box code (default + wrong-code
  error, 60s resend) → D sage success pop → redirect via existing `postAuthRoute`
  into onboarding, where logo/name/reward are pre-filled.
- **Dead-link screen:** expired/claimed → warm empty-state, «Ссылка больше не
  активна», «Написать в Telegram». Never a 404.

Mutations `useRequestPitchCode` / `useClaimPitch` in `@jaqyn/api`. All copy through
`@jaqyn/i18n` (new `pitch.*` namespace, RU + EN). External input (token, email,
code) validated at the edge before use.

## Testing

- Backend: each endpoint gets auth + throttle + happy-path; service tests for
  double-claim, expired, wrong code, existing-email user, first-resolve status
  flip. List/column query-count check per the N+1 rule.
- Frontend: one behavior test on the claim form (email → code → success calls the
  mutation), MSW-mocked. Tap-to-stamp and reward editor are UI state — light
  component test on the editor updating the preview.

## Out of scope

- The business onboarding wizard itself (recon found `/business/dashboard` +
  profile editing but no confirmed step wizard). This feature redirects into
  whatever `/business` entry exists today; building/rewiring the wizard is separate.
- SMS/phone pitch links (email only for v1).
- Payment collection (manual invoicing, per launch plan).

## YAGNI notes

- No separate "pitch analytics dashboard" — the three events + admin status column
  are enough. Add a dashboard when volume justifies it.
- Reward editor persists nothing until claim — deliberately no draft-autosave.
