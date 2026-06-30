---
title: Onboarding / Activation / Landing — Production Readiness Audit
service: shared
type: qa
status: active
last_reviewed: 2026-06-30
---
# Onboarding / Activation / Landing — Production Readiness Audit

Scope: business owner onboarding wizard, invite activation page, and the public
landing lead form. Each finding below was verified against the actual code (file +
line). Auditor false positives and duplicates were dropped; only confirmed issues
appear here. Severity re-ranked by real production impact.

Counts (confirmed): 3 Blocker · 12 High · 13 Medium · 6 Low.

---

## Blocker

### B1. Onboarding logo/cover tiles are fake boolean toggles, not real uploads
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:498-533` (persist `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:191-192`)
- **Evidence:** The logo tile's `onClick` is `() => set({ logoSet: !f.logoSet })` and cover is `() => set({ coverSet: !f.coverSet })`. There is no `<input type="file">` in the file. `persist()` PATCHes `logo_set: next.logoSet` (a boolean). `useUploadBusinessLogo` / `useUploadBusinessCover` exist (`frontend/packages/api/src/business/hooks.ts:94-115`) and write the real `logo_url` back to cache, but are never imported here. The "confirmed" state shows a ☕ emoji and the literal `logo.png` — no real file is ever attached.
- **Expected:** Clicking the tile opens a native file picker, uploads via `useUploadBusinessLogo`/`useUploadBusinessCover`, and previews `me.data.logo_url`/`cover_url` — exactly the pattern already shipped in `frontend/apps/web/app/business/profile/page.tsx:62-71, 337-352`. The backend upload endpoints and services (`set_business_logo`/`set_business_cover`, `backend/apps/businesses/services.py:155-187`) already exist.
- **Production fix:** Import the two upload hooks. Replace each toggle `<button>` with a hidden `<input type="file" accept="image/*">` + a preview `<img>` driven by `me.data.logo_url`/`cover_url`. On change call `uploadLogo.mutate(file)` / `uploadCover.mutate(file)`. Remove `logo_set`/`cover_set` from the `persist()` payload — those flags are a server-side side effect of a real upload, not a client boolean. Pair with B-adjacent backend hardening (see H1).

### B2. OTP login has no real SMS delivery — production users can never receive a code
- **File:** `backend/apps/accounts/tasks.py:11-14`, `backend/apps/notifications/services.py:21-34`
- **Evidence:** `send_otp` calls `notifier.send(None, "sms", "otp", {...})`. `Notifier.provider = "dev-log"` and `send()` does `logger.info(...)` then writes a `NotificationLog` row with `status=SENT`. No gateway call exists anywhere. The OTP issue path (`backend/apps/accounts/services.py:34`) is the only delivery channel, so with `DEV_LOGIN_OTP=""` (the prod default) a real customer can never log in: the row says SENT, the phone receives nothing.
- **Expected:** OTP codes (and the campaign/group/reward SMS nudges that also route through `notifier.send(channel="sms")`) dispatch a real outbound SMS.
- **Production fix:** Integrate an SMS provider (Twilio / Vonage / Eskiz for KG). Add a provider subclass selected via an `SMS_BACKEND` env var (mirror the `EMAIL_BACKEND` pattern), and call the gateway from `Notifier.send`. Add the SMS section to `.env.prod.example` (it has none today). **Needs external provider credentials** — the code seam is in-repo but cannot be made to actually send without an account.

### B3. Terms checkbox is a `<button>` with no checkbox semantics — unusable with a screen reader
- **File:** `frontend/apps/web/app/business/activate/page.tsx:124-135`
- **Evidence:** The "I agree to the Terms…" control is `<button onClick={() => setAgree(!agree)}>` with a styled `<span>` tick inside. No `role="checkbox"`, no `aria-checked`, no native input. Assistive tech announces a generic button with no checked/unchecked state, so a screen-reader user cannot tell whether they have agreed — yet agreement gates activation (`submit()` returns early at line 48 if `!agree`).
- **Expected:** A real checkbox: native `<input type="checkbox">` + `<label htmlFor>`, or `role="checkbox" aria-checked={agree}` on the button.
- **Production fix:** Replace with `<label><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="sr-only" /><span aria-hidden>…tick…</span><span>I agree…</span></label>`, styling the visual span via the `:checked` sibling. This is the single hard gate on the first owner screen, hence blocker for a11y compliance.

---

## High

### H1. Onboarding completion check accepts the client-toggled `logo_set` boolean
- **File:** `backend/apps/businesses/onboarding_services.py:102`, `backend/apps/businesses/serializers.py:52, 74-85`
- **Evidence:** `required_fields()` evaluates the logo requirement as `business.logo_set or bool(business.logo)`. `logo_set` is a writable serializer field (it is in `fields` at line 52 but NOT in `read_only_fields` at lines 74-85), so the onboarding PATCH can set `logo_set=true` with no file. This is the server half of B1: it lets the "Logo image" required-field pass with no real image.
- **Expected:** `logo_set`/`cover_set` are server-managed flags, set only by `set_business_logo`/`set_business_cover` after a real upload. The completion check should be `bool(business.logo)`.
- **Production fix:** Add `'logo_set'` and `'cover_set'` to `read_only_fields` in `BusinessSerializer.Meta`. Change the line-102 check to `bool(business.logo)`. Add/adjust the onboarding test so a `logo_set=true` PATCH no longer satisfies the logo requirement.

### H2. `DEV_LOGIN_OTP` static-code bypass is not enforced off in production
- **File:** `backend/apps/accounts/services.py:39-43`, `backend/config/settings/prod.py`
- **Evidence:** `verify_otp` accepts any phone if `code == DEV_LOGIN_OTP` (skipping cache, attempt, and rate-limit checks). The only guard is the operator leaving `DEV_LOGIN_OTP` empty. `prod.py` does not assert it — a copied dev `.env` or a typo would let anyone log in as any phone instantly.
- **Expected:** A non-empty `DEV_LOGIN_OTP` under `DEBUG=False` fails at boot.
- **Production fix:** In `prod.py` add `if DEV_LOGIN_OTP: raise ImproperlyConfigured("DEV_LOGIN_OTP must be empty in production")`. Pure in-repo change.

### H3. Email backend defaults to console — owner invite activation emails silently dropped
- **File:** `backend/config/settings/base.py:210`, `backend/config/settings/prod.py`
- **Evidence:** `EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "…console.EmailBackend")`. The owner-invite activation email (`_send_owner_invite_if_needed` → `send_owner_invite_email`, `backend/apps/businesses/services.py:112-137`) is the only path delivering an owner's activation link. If `EMAIL_BACKEND` is unset on Railway, the email goes to stdout and the owner gets nothing. `.env.prod.example:64` shows the correct SMTP override, so plumbing exists, but nothing enforces it.
- **Expected:** Prod fails fast (or overrides) when the console backend is active under `DEBUG=False`.
- **Production fix:** In `prod.py` add `if EMAIL_BACKEND.endswith("console.EmailBackend"): raise ImproperlyConfigured(...)`. **Needs an SMTP provider account** to actually deliver, but the boot-time guard is in-repo.

### H4. Staff invite shows "Pending" but no invite is ever dispatched
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:816`; backend `backend/apps/businesses/onboarding_views.py:163-172`
- **Evidence:** `StaffInviteListCreateView.post` calls only `serializer.save(business=business)` — no email/SMS, no Celery task, no activation token flow. The row renders a "Pending" badge, implying the invitee was notified, but the staff member receives nothing and has no way to accept or set a password.
- **Expected:** Saving an invite dispatches a notification to `invite.contact` and creates an accept/activation path.
- **Production fix:** After `serializer.save`, dispatch (via `transaction.on_commit`) an email task (mirroring `send_owner_invite_email`) for email contacts, or `notifier.send` once SMS is real (B2) for phone contacts; build the staff activation token flow. Until the channel exists, change the badge copy so it doesn't claim the person was notified. **Email path in-repo; SMS path needs B2.**

### H5. Owner wizard advances with empty required fields — no per-step validation
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:423-426`
- **Evidence:** The Continue button (steps 1-4) is `onClick={() => setStage(stage + 1)}` with no guard on `displayName`, `phone`, `address`, `desc`, or `businessType`. A user can click straight to step 5 without filling anything, only then hitting the "Required fields missing" banner.
- **Expected:** Each Continue validates the fields belonging to that step and blocks with inline feedback.
- **Production fix:** Add per-step guard functions (step 1: `displayName/phone/address/desc`; step 2: `businessType`; step 3: `items.length > 0`) that `showToast` and return early instead of advancing.

### H6. Autosave PATCH failures are silent — indicator still shows "saved"
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:170-195, 337-338`; hook `frontend/packages/api/src/business/hooks.ts:184-193`
- **Evidence:** `persist()` calls `save.mutate({...})` with no `onError`, and `useSaveOnboarding` has no `onError`. The sidebar indicator only reads `save.isPending`; on failure `isPending` is false so it shows the green "Progress saved automatically" even though the data never reached the server — silent data loss across a reload.
- **Expected:** A failed save flips the indicator to an error state / toast.
- **Production fix:** Pass `{ onError: () => showToast("Auto-save failed — check your connection") }` to `save.mutate`, and make the sidebar dot also reflect `save.isError`.

### H7. `addCatalogItem` / `addStaffInvite` mutation errors are swallowed
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:230-248`
- **Evidence:** Both `addItem.mutate(...)` and `addStaff.mutate(...)` pass only `onSuccess`. On a 4xx/5xx (e.g. 409 staff limit, 400 validation, network drop) nothing is shown; the Add button just re-enables silently.
- **Expected:** Failure surfaces a toast.
- **Production fix:** Add `onError: (e) => showToast((e as {message?:string})?.message ?? "Failed to add")` to both call sites.

### H8. Onboarding state query error renders the wizard as submit-ready (false readiness)
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:219-221, 263`
- **Evidence:** Only `me.isError` is checked before render. When `useOnboardingState` errors, `state.data` is `undefined`, so `completion = … ?? 0` and `missing = … ?? []`. `canSubmit = missing.length === 0 && !!f.businessType && items.length > 0` then becomes `true` once the form was hydrated with a type and items — step 5 shows the green "All required fields complete" banner and enables Submit against unknown state. (`useOnboardingState` has `retry:false`, hooks.ts:181-182, so an error sticks.)
- **Expected:** `state.isError` shows an error banner and blocks submission.
- **Production fix:** After the `me.isError` guard, add an `state.isError` branch (error screen / retry), and gate `canSubmit` on `!state.isError`.

### H9. Landing phone prefix double-applies if the user types/pastes `+996`
- **File:** `landing/src/api.ts:22`; UI `landing/src/components/LeadForm.tsx:225-241`
- **Evidence:** `submitLead` builds `phone: ` + "+996" + `form.phone`. The UI shows a visible `+996` prefix and a free-form input with no stripping. Pasting `+996700123456` yields `+996+996700123456`, which `BusinessLeadSerializer.phone` (`CharField(max_length=32)`, serializers.py:278) accepts and stores.
- **Expected:** Strip a leading `+996`/`996`/non-digits before prefixing.
- **Production fix:** In `submitLead`: `const digits = form.phone.replace(/^\+?996/, "").replace(/\D/g, ""); phone: `+996${digits}``. (Pairs with M9 backend regex validator.)

### H10. Activate form has no `<form>` element — Enter does not submit
- **File:** `frontend/apps/web/app/business/activate/page.tsx:88-143`
- **Evidence:** Inputs sit in a plain `<div>`; submit is a `<button onClick={submit}>` with no `<form onSubmit>` wrapper. Keyboard users pressing Enter get nothing, and the group is not exposed as a form landmark.
- **Expected:** Wrap fields in `<form onSubmit={(e)=>{e.preventDefault();submit();}}>` with the submit button `type="submit"`.
- **Production fix:** Replace the outer card `<div>` with `<form>`, set the button to `type="submit"`.

### H11. LeadForm has no `<form>` element and labels are not associated with inputs
- **File:** `landing/src/components/LeadForm.tsx:183-343` (form), `189-291` (labels), `210-241` (phone)
- **Evidence:** All inputs are in a `<div>`; the submit button has `onClick` and no `type`. Every `<label>` lacks `htmlFor` and every `<input>` lacks `id`, so association is proximity-only — screen readers announce unlabeled inputs. The phone input additionally has no label and the `+996` prefix `<span>` is not part of its accessible name.
- **Expected:** Real `<form onSubmit>`, `type="submit"` button, and `id`/`htmlFor` (or nesting) on all seven field groups; phone input gets an `id` + label and the `+996` prefix included via `aria-label`/`aria-describedby`.
- **Production fix:** Wrap in `<form>`; add matching `id`/`htmlFor` to business/owner/phone/email/category/area/instagram; give the phone input `aria-label="Phone number (+996)"`.

### H12. Onboarding wizard is entirely hardcoded English (zero i18n)
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:1-999` (e.g. `STEP_DEFS` 31-37, field labels 539-606, toasts 229/243-244, statuses 910-926); activate page `frontend/apps/web/app/business/activate/page.tsx:1-170`
- **Evidence:** Neither file imports `useT`/`@jaqyn/i18n`; every label, placeholder, toast, status, and button is an English literal. The frontend rules mandate all user-facing copy through `@jaqyn/i18n`, and the primary owners are Russian-speaking. (The profile page already uses `useT`, so the pattern exists.) `schema.ts:99-103` `ROLE_HINT` and the owner invite email template (`backend/apps/businesses/templates/businesses/owner_invite_email.html:2`, `lang="en"`) are also English-only.
- **Expected:** All copy routed through `useT()` with keys in `packages/i18n` (ru + en); a Russian invite-email template, locale-aware send.
- **Production fix:** Add `useT`, key every string, register ru/en translations; key `ROLE_HINT`; add a Russian email template and select by locale. Marked High because it's the core owner surface in the target market; large but in-repo.

---

## Medium

### M1. Business detail logo `<img>` has no `onError` fallback
- **File:** `frontend/apps/web/app/nearby/[id]/page.tsx:38-43`
- **Evidence:** `{b.logo_url ? <img src={b.logo_url} … /> : (b.glyph || initial)}` with no `onError`. If the R2/CDN URL 404s or the CDN is down, the 80×80 tile renders a broken-image icon with no fallback to the glyph/initial. Same gap in `InitialTile` (`frontend/apps/web/app/_components/kit.tsx:88-98`) and `GlyphTile` (`frontend/apps/web/app/_components/campaigns.tsx:115-125`).
- **Expected:** `onError` swaps in the glyph/initial fallback.
- **Production fix:** Add an `imgError` state and render the fallback when the image errors; centralize in `InitialTile`/`GlyphTile` so all call sites benefit.

### M2. No `next/image` anywhere — all user-uploaded images use raw `<img>`
- **File:** `frontend/apps/web/app/_components/kit.tsx:40, 89`; also `campaigns.tsx:115`, `nearby/[id]/page.tsx:39`, `business/profile/page.tsx:331-332, 498`
- **Evidence:** Six inline `@next/next/no-img-element` suppressions; every logo/cover/avatar is a bare `<img>`. Frontend rules require `next/image` everywhere with dimensions. No `images.remotePatterns` is configured in `next.config.js`.
- **Expected:** `next/image` with the R2/CDN domain in `remotePatterns`; same-origin `/media/` proxy paths use `<Image unoptimized />` or are added to patterns.
- **Production fix:** Configure `images.remotePatterns`; migrate `InitialTile`/`GlyphTile`/`UserAvatar`/hero images to `next/image`. (The `/media/` proxy rewrite in next.config means relative paths need `unoptimized` or the proxy origin allow-listed.)

### M3. Cover image interpolated into an unquoted CSS `url()`
- **File:** `frontend/apps/web/app/nearby/[id]/page.tsx:30`; also `business/profile/page.tsx:360-362, 491-493`
- **Evidence:** `style={{ background: b.cover_url ? `url(${b.cover_url}) center/cover` : … }}` — the URL is interpolated raw. A URL containing `)`/quotes/`url(` could break out of the value. The source is server-stored data, so impact is limited, but it is unsanitized injection into a style attribute.
- **Expected:** Quote the URL or render via `next/image fill`.
- **Production fix:** Use `url('${b.cover_url}') center/cover` (quote + ideally encode), apply at all three call sites.

### M4. Review screen shows no logo/cover status before submit
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:840-865`
- **Evidence:** `StageReview`'s five cards (identity, location, type, catalog, staff) never show whether a logo was uploaded, though logo is required (`onboarding_services.py:102`). After the B1 fix the user has no confirmation the file was received at the final check.
- **Expected:** A "Logo" row driven by `!!me.data?.logo_url`.
- **Production fix:** Add `["Logo", logoUploaded ? "Uploaded" : "Missing — required"]` to the identity card, sourced from the real `logo_url` after B1.

### M5. Activate page renders the full form with a blank email during token validation
- **File:** `frontend/apps/web/app/business/activate/page.tsx:28-41, 76-153`
- **Evidence:** The form renders immediately while `validateInvite` is in flight; `invite` is `null` so the Email field shows empty. The only loading hint is the subtle footer "Validating invitation…" (line 147). The form looks broken/pre-filled-wrong for ~200-500ms.
- **Expected:** A loading skeleton/spinner until the invite resolves.
- **Production fix:** Add a `validating` state (true → false in both `.then` and `.catch`); render a skeleton while validating and `!invalid`.

### M6. Confirm-submit modal button has no double-submit guard
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:459-461`
- **Evidence:** The modal Submit `<button onClick={doSubmit}>` has no `disabled`. `doSubmit` closes the modal then `submit.mutate(...)`; a fast double-tap before the modal unmounts can fire two `submitOnboarding()` calls. (The outer footer button is guarded, the modal one isn't.)
- **Expected:** `disabled={submit.isPending}` on the modal button.
- **Production fix:** Add `disabled={submit.isPending}` to the modal Submit button.

### M7. Onboarding submit gate can read stale `missing_required_fields` on entering step 5
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:219-221`
- **Evidence:** `canSubmit` derives from `state.data` (React Query cache). Autosave is debounced 600ms; if the user fills the last required field then jumps to step 5 within the debounce window, the cache hasn't refetched and `canSubmit` can still be `false` (Submit greyed) despite all fields being filled.
- **Expected:** On entering step 5, refetch onboarding state so the gate is evaluated live.
- **Production fix:** `useEffect(() => { if (stage === 5) void state.refetch(); }, [stage])`.

### M8. Business-type query error on step 2 renders a blank grid, no retry
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:372`
- **Evidence:** `<StageType types={types.data ?? []} … />` passes `[]` on error; `StageType` maps over the empty array and shows nothing. No `types.isError`/`isLoading` handling — the user sees an empty step with no message or retry.
- **Expected:** Error → message + retry; loading → spinner/skeleton.
- **Production fix:** Branch on `types.isError`/`types.isLoading` before rendering `StageType`.

### M9. Landing phone accepts non-digits; no backend regex validator
- **File:** `landing/src/App.tsx:38-43`; `backend/apps/businesses/serializers.py:278`
- **Evidence:** `handleSubmit` checks non-empty + email format only; spaces/dashes/parens pass and reach the API as e.g. `+996700 123 456`. `BusinessLeadSerializer.phone` is a bare `CharField(max_length=32)` with no validator, so it's stored raw.
- **Expected:** Client strips to digits and length-checks; backend rejects non-conforming phones.
- **Production fix:** Strip non-digits + require ≥9 digits client-side; add `RegexValidator(r"^\+?\d{7,15}$")` to the serializer phone field.

### M10. Landing form uses one generic error for both validation and server failures
- **File:** `landing/src/App.tsx:38-53`; copy `landing/src/components/LeadForm.tsx:293-305`
- **Evidence:** Both the client-validation path and the `catch` server-error path call `setFormState('error')`, rendering the single string "Something went wrong. Please try again." The user can't distinguish a missing field from a network failure, and (M-a11y) the error block is conditionally rendered with no live region.
- **Expected:** Field-specific validation messages vs. a distinct server-error message; the error region announced.
- **Production fix:** Add a `validationError` state with specific messages; reserve `formState='error'` for network failures; make the error container always-present with `role="alert" aria-live="assertive"` and mark invalid fields `aria-invalid`.

### M11. Activation token stays in the URL the whole flow; no Referrer-Policy header
- **File:** `frontend/apps/web/app/business/activate/page.tsx:17`; `frontend/apps/web/next.config.js` (no `headers()`)
- **Evidence:** The single-use token is read from `useSearchParams()` and remains in `/business/activate?token=…` while the user fills name/password. `next.config.js` defines no `headers()`, so no `Referrer-Policy`. The raw token lands in history and proxy/CDN logs. (Backend stores only the SHA-256 hash, so this is defence-in-depth.)
- **Expected:** Strip the token from the URL after validation; set `Referrer-Policy: no-referrer` on the route.
- **Production fix:** `router.replace("/business/activate", { scroll: false })` after `setInvite`; add a `headers()` block in `next.config.js` setting `Referrer-Policy: no-referrer` for `/business/activate`.

### M12. LeadForm outer card padding (48px) never reduces on mobile
- **File:** `landing/src/components/LeadForm.tsx:53`
- **Evidence:** `.jq-split` has inline `padding: 48`. The grid collapses at 879px but the 48px padding never reduces; with section padding the content column is cramped to ~227px on a 375px phone.
- **Expected:** Padding reduces to ~20-24px ≤560px.
- **Production fix:** Add `@media (max-width: 560px) { .jq-split { padding: 22px; } }` in `styles.css` (or move to responsive Tailwind classes).

### M13. Onboarding mobile-only review label column is a fixed 140px
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:897`
- **Evidence:** `<span className="w-[140px] flex-none …">` inside a `p-5` card. On a 375px phone the card content is ~335px, leaving only ~181px for the value — long addresses/descriptions get badly cramped, no wrapping.
- **Expected:** Narrower label on mobile or stacked rows.
- **Production fix:** `w-[100px] sm:w-[140px]`, or switch the row to `flex-col gap-0.5 sm:flex-row sm:gap-3.5`.

---

## Low

### L1. Activation: expired vs. already-used invite show the same generic guidance
- **File:** `frontend/apps/web/app/business/activate/page.tsx:35-37, 61-72`
- **Evidence:** The `.catch` sets `invalid` to the backend message and the page always says "Ask the Jaqyn team to resend your invite." The backend raises distinct codes — `INVITE_USED` (409), `INVITE_EXPIRED` (410), `INVITE_NOT_FOUND` (404) (`onboarding_services.py:46-52`). An already-activated user should be told to log in, not to request a resend.
- **Expected:** Branch on the code: USED → "already activated, log in"; EXPIRED → request a new invite; NOT_FOUND → invalid link.
- **Production fix:** Parse the structured error code from the API client and render code-specific copy + CTA.

### L2. Catalog add validates name only; empty price is accepted and stored
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:228-239`
- **Evidence:** `addCatalogItem` returns early only on empty name; `price` is passed as-is. `CatalogItemSerializer.price` allows blank, so an item with empty price persists and renders blank on the customer profile.
- **Expected:** Require a price (or mark it clearly optional).
- **Production fix:** Add `if (!draft.price.trim()) return showToast("Enter a price");` before `addItem.mutate`.

### L3. Onboarding "missing field" jump buttons and "Edit" buttons lack accessible names
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:872-877, 889-892`
- **Evidence:** Missing-field buttons render `{m.label} ›` and the five section Edit buttons all render just "Edit" — screen readers hear "Edit, button" five times with no section context, and the `›` glyph is read as a character.
- **Expected:** `aria-label={`Edit ${sec.title}`}` and `aria-label={`Fix ${m.label} (step ${m.step})`}`.
- **Production fix:** Add the `aria-label`s; mark the `›` glyph `aria-hidden`.

### L4. Remove (×) buttons for catalog items and staff invites have no accessible name
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:738, 817`
- **Evidence:** Both remove controls render just `×`; screen readers announce "times"/"×" with no indication of what gets deleted.
- **Expected:** `aria-label={`Remove ${it.name}`}` / `aria-label={`Remove ${m.full_name}`}`.
- **Production fix:** Add the `aria-label`s.

### L5. Confirm-submit modal is not a dialog (no role, focus trap, Escape)
- **File:** `frontend/apps/web/app/business/onboarding/OnboardingFlow.tsx:448-465`
- **Evidence:** The overlay is plain `<div>`s; no `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, focus return, or Escape-to-close. Tab escapes to the page behind; screen readers aren't told a dialog opened.
- **Expected:** `role="dialog" aria-modal="true" aria-labelledby` on the panel, focus trap, Escape handler, focus return — or a native `<dialog>`.
- **Production fix:** Add the ARIA + a focus-trap/Escape effect, or migrate to `<dialog>.showModal()`.

### L6. Landing phone prefix `+996` is hardcoded (Kyrgyzstan-only)
- **File:** `landing/src/components/LeadForm.tsx:225`; `landing/src/api.ts:22`
- **Evidence:** A fixed `+996` prefix span and unconditional `+996` prepend; non-KG numbers become malformed. This is deliberate MVP (Bishkek pilot) scoping, not a live bug — flagged so it isn't forgotten at market expansion.
- **Expected:** An international dial-code selector when expanding beyond KG.
- **Production fix:** Replace the fixed prefix with a dial-code select and drop the unconditional prepend; generalize the "area" label. No external creds needed.

---

## Mocked steps → production gap

These are the places where the flow only *looks* complete but does nothing real in production. Fix these before any pilot that takes real owners or customers.

| Step | What it pretends | Reality | Confirmed in |
|---|---|---|---|
| Onboarding logo/cover | Image uploaded ("☕ logo.png") | Boolean toggle; no file; `logo_set=true` PATCHed; `Business.logo` stays null | B1, H1 |
| OTP login (SMS) | Code sent ("status=SENT") | `Notifier` is a dev logger; no gateway; phone receives nothing | B2 |
| Owner invite email | Activation link emailed on approval | Console backend by default → email goes to stdout unless `EMAIL_BACKEND` overridden | H3 |
| Staff invite | "Pending" — invitee notified | Only a DB row; no email/SMS, no accept/activation flow | H4 |
| Onboarding map | Pin/coordinate picker | Static CSS-grid decoration; lat/lng are raw text fields (`MiniMap.tsx` with a real map exists but isn't used here) | (UX gap; see note) |
| Catalog categories | Type-appropriate options | Hardcoded mixed list ("Coffee… Hair… Nails") regardless of business type; the seeded `cats` exist in `schema.ts` but aren't exposed | (UX gap; see note) |
| Terms / Privacy links | Clickable policy links | Bold `<b>` text, no `href`, no published documents | B3 (a11y) + content gap |

Notes: the map-picker and catalog-category items are real UX gaps (the building blocks — `MiniMap.tsx`, `schema.ts` `cats`, `BusinessType.module` — already exist), but they are product/UX scope rather than correctness defects, so they are documented here rather than ranked as numbered findings. The Terms/Privacy links are a real content + a11y gap; the a11y half is captured in B3.
