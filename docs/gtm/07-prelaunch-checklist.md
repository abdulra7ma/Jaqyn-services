---
title: GTM 07 — Pre-Launch Checklist
service: platform
type: strategy
status: active
last_reviewed: 2026-07-07
---

# Pre-Launch Checklist — Jaqyn

**Launch shape (do not re-decide — set by `03`/`04`/`05`):** a **founder-led,
hand-held free pilot** for the first café cohort. Self-serve signup, billing, and
broad acquisition are **deliberately deferred** until SMS + billing land. Every
priority below is scored against *that* launch — a founder onboarding one café
on-site with a laptop — **not** a generic public self-serve launch.

**How to read this file.** Every line is a checkbox with an owner placeholder and
a priority tag. Where the codebase audit (2026-07-07) returned a verdict it is
marked ✅ PASS / ❌ FAIL / ⚠️ CANNOT-VERIFY with the file reference.

- **[BLOCKER]** — the *founder-led pilot* cannot responsibly start until this is done.
- **[IMPORTANT]** — do before/around launch; a gap here degrades the pilot but doesn't stop it.
- **[NICE-TO-HAVE]** — improves the launch; safe to trail.

> **Blocker discipline.** The "known hard blockers" list from `01-positioning.md`
> mixes *self-serve* blockers with *pilot* blockers. Verified below: the two
> workarounds (email OTP for customer join; owner-as-staff seat + admin provisioning
> for the business) hold, so **of the feared product blockers — SMS stub and
> staff-invite email — zero block the founder-led pilot**; both are
> deferred-self-serve items. The real pilot blockers are legal, infra, and
> security items, tagged **[BLOCKER]** throughout and enumerated in the Launch gate
> at the end of this file.

---

## 1. PRODUCT READINESS

**Verified-passing surfaces (no action needed — listed so nobody re-audits):**

- [x] Error handling ✅ PASS — `frontend/apps/web/app/global-error.tsx` + 27 per-route `error.tsx` + 29 `loading.tsx`; DRF `envelope_exception_handler` (`backend/core/exceptions.py`, 51 codes); `useErrMessage()` hook. *(owner: ___)* **[BLOCKER-satisfied]**
- [x] Onboarding ✅ PASS — customer signup→carousel; business register→wizard→admin approval (PENDING→APPROVED→VERIFIED). *(owner: ___)* **[BLOCKER-satisfied]**
- [x] Password reset ✅ PASS — `/forgot-password`, email OTP, 300s TTL, 60s resend cooldown. *(owner: ___)* **[BLOCKER-satisfied]**
- [x] Mobile / PWA ✅ PASS — 3 manifests (customer/business/staff), `sw.js` network-first, responsive Tailwind. *(owner: ___)* **[IMPORTANT-satisfied]**

**Pilot-critical paths — verified this session:**

- [ ] **Prod smoke-test the customer-join path via email OTP (bypasses the SMS stub)** — code ✅ PASS: `request-email-otp`/`verify-email-otp` (`backend/apps/accounts/urls.py:23-24`), `issue_email_otp` mirrors phone with signup fall-through (`backend/apps/accounts/services.py:149`), delivered via Resend. Run one real end-to-end prod join before the first onboarding. *(owner: ___)* **[BLOCKER]** *(one-time prod smoke test)*
- [ ] **Prod smoke-test standing up a business + first scan without invite emails** — code ✅ PASS: `ensure_owner_staff` auto-creates the owner's scanner seat (`backend/apps/staff/services/management.py`); business provisioned via Django admin. Verify once in prod that owner can scan solo. *(owner: ___)* **[BLOCKER]** *(one-time prod smoke test)*

**Known gaps — pilot impact scored honestly:**

- [ ] **SMS/OTP provider is a dev-log stub** ⚠️ — `send_otp` calls the dev-log notifier (`backend/apps/accounts/tasks.py:13-27`); phone self-signup impossible in prod. **Blocks self-serve, NOT the pilot** (email OTP is the pilot path, above). Decide provider + per-OTP KG cost before opening self-serve (`03` §7 P1; open question #5). *(owner: ___)* **[IMPORTANT]** *(BLOCKER only for self-serve, which is deferred)*
- [ ] **Staff/owner invite emails partially wired** ⚠️ — `send_owner_invite_email` task + `StaffInvite` model exist (`backend/apps/businesses/tasks.py:16`, `models.py:255`; admin at `reporting/dashboard.py:132`), but email delivery is not fully proven. **Not a pilot blocker** — founder provisions seats via admin on-site. Wire + test before any owner is expected to self-add staff. *(owner: ___)* **[IMPORTANT]**
- [ ] **Support surface missing in-app** ❌ FAIL — no in-app FAQ/help pages; no discoverable support channel; only Telegram-per-business in `tasks/LAUNCH.md`. See §6. *(owner: ___)* **[IMPORTANT]**
- [ ] **Empty states — secondary surfaces untested** ⚠️ PARTIAL — core flows covered; sweep secondary screens (staff activity filters, campaign analytics with zero data, business customer list empty) for dead-end empty states per `.claude/rules/frontend.md` (`Empty` `actionLabel`). *(owner: ___)* **[IMPORTANT]**
- [ ] **No cookie/consent banner** ❌ PARTIAL — see §4; cross-linked to analytics choice in §7 (pick cookieless to sidestep). *(owner: ___)* **[IMPORTANT]**
- [ ] **Social-proof campaign type half-built** — exclude from launch messaging (`01` risk #7, `backend/apps/campaigns/services/social.py`); demo only individual + group campaigns. Verify it is not surfaced in the business campaign-create UI. *(owner: ___)* **[IMPORTANT]**
- [ ] **Patches/achievements are backend-only** — confirm no half-rendered achievement UI ships to customers. *(owner: ___)* **[NICE-TO-HAVE]**
- [ ] **Kyrgyz language absent from the app** (RU/EN only; legal pages have KY). Launch messaging stays RU (`01` risk #6); flag KY as fast-follow, do not claim "in your language." *(owner: ___)* **[NICE-TO-HAVE]**
- [ ] Build & seed the **demo café account** (`04` §2 / `05` §4 required asset): café name+logo, 1 group campaign, 1 stamp program, 10–15 fake scans, 2 completed groups. The show-don't-tell engine for every demo. *(owner: ___)* **[BLOCKER]** *(no demo = no sales motion)*

---

## 2. INFRASTRUCTURE & RELIABILITY

- [x] Prod settings separation ✅ PASS — `backend/config/settings/{base,dev,prod,test}.py`; `DEBUG=false` default; `prod.py` raises on `DEV_LOGIN_OTP` non-empty, console email backend, missing `GOOGLE_OAUTH_CLIENT_ID` (`prod.py:9-17`). *(owner: ___)* **[BLOCKER-satisfied]**
- [x] Security headers ✅ PASS — HSTS (31536000s) + `SECURE_SSL_REDIRECT` + nosniff + XFO + referrer policy + CSP report-only; CORS env-driven. *(owner: ___)* **[BLOCKER-satisfied]**
- [x] Error monitoring installed ✅ PASS — Sentry both sides, 0.1 sample. *(owner: ___)* **[BLOCKER-satisfied]**
- [ ] **Re-test Postgres backup restore before launch** ⚠️ — DEPLOY.md §8 says Railway backups, "restore tested once." Do a fresh restore-to-scratch dry run now; note date + who. A backup you haven't restored recently is a hope, not a backup. *(owner: ___)* **[BLOCKER]**
- [ ] **Configure Sentry alerting** ⚠️ CANNOT-VERIFY — Sentry captures errors, but confirm alert *rules* fire (new-issue + spike → founder's Telegram/email). Capture without alerting is silent. *(owner: ___)* **[IMPORTANT]**
- [ ] **Add an uptime check** — external ping (UptimeRobot/BetterStack free tier) on the frontend URL + a backend health endpoint → founder notification on downtime. *(owner: ___)* **[IMPORTANT]**
- [x] Rate limiting ✅ PASS — DRF throttles on auth/write; `OTP_RATE_LIMIT_PER_PHONE=5`. Confirm anon + authed write rates are set in prod, no unthrottled write surface. *(owner: ___)* **[IMPORTANT-satisfied]**
- [ ] **Write the rollback plan** — one paragraph in DEPLOY.md: Railway auto-deploys `main`; rollback = redeploy the previous successful build from the Railway deployments list (or `git revert` + push). State who does it and the max acceptable time-to-rollback. Do a rehearsal redeploy once. *(owner: ___)* **[IMPORTANT]**
- [ ] Confirm Railway auto-deploy on `main` is green and the frontend/backend/Celery/Redis/Postgres services are all healthy pre-launch. *(owner: ___)* **[IMPORTANT]**

---

## 3. SECURITY & DATA

- [ ] **Add env validation at boot for `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`** ❌ FAIL — `prod.py` fails fast on a few vars but not these three; a missing/blank one fails at first use, not startup, violating `.claude/rules/backend.md` "fail fast at boot." The vars are set on Railway today, so this is hardening (fail-at-first-use → fail-at-boot), not a pilot stopper. Add explicit `ImproperlyConfigured` raises alongside the existing checks (`backend/config/settings/prod.py:1-17`). *(owner: ___)* **[IMPORTANT]** *(fastest win — low effort, high value)*
- [ ] **Verify `SEED_TEST_USERS` is false/unset in the prod Railway env** ✅ code-present / ⚠️ config — env-gated (`backend/config/settings/base.py:597`, `entrypoint.sh:15`). A go/no-go config check — if true in prod, test users seed into the live DB. *(owner: ___)* **[BLOCKER]**
- [ ] Optionally add a `prod.py` assertion that `SEED_TEST_USERS` is not "true" (defense-in-depth, low effort). *(owner: ___)* **[IMPORTANT]** *(fast win)*
- [ ] Verify **demo/test-account seeding is off in prod** — `seed_test_users` and `seed_demo` commands exist; confirm neither runs in the prod entrypoint. *(owner: ___)* **[IMPORTANT]**
- [ ] **Flip `ROTATE_REFRESH_TOKENS` to True** ⚠️ — currently `False` (`backend/config/settings/base.py:441`), i.e. a 14-day refresh token is reusable. Blacklist is enabled, so rotation is safe to turn on, but it changes session behavior — **needs a login/refresh/logout + blacklist regression test in the same change**. Not a free win. *(owner: ___)* **[IMPORTANT]**
- [ ] Sanity-check JWT lifetimes for the pilot — access 30min / refresh 14d is fine; document the decision. *(owner: ___)* **[NICE-TO-HAVE]**
- [ ] **Add `pip-audit` + `pnpm audit` to CI** ❌ FAIL — CI (`.github/workflows/ci.yml`) is pytest + migrations-check + lint + typecheck + build; no dependency audit. Add both as non-blocking-then-blocking gates per `.claude/rules/backend.md`/`frontend.md`. *(owner: ___)* **[IMPORTANT]** *(fast win)*
- [x] Upload validation ✅ PASS — image upload size validation shipped (see commit `553fe42`). Confirm content-type + dimension caps too. *(owner: ___)* **[IMPORTANT-satisfied]**
- [ ] **Abuse review of public write surface** — OTP request, lead form, QR-join, voucher redeem: confirm throttles + validation resist scripted abuse (attacker cannot brute OTP, spam leads, or double-redeem a voucher — server-enforced one-time redemption already noted in `01`). *(owner: ___)* **[IMPORTANT]**
- [ ] Confirm **no secrets in the repo / commits** and all config is env-only (universal rule). Quick `git log` + secret-scan pass. *(owner: ___)* **[BLOCKER]**

---

## 4. LEGAL & COMPLIANCE

- [ ] **Counsel review of privacy + terms** ⚠️ PARTIAL — `landing/public/privacy.html` + `terms.html` exist in EN/RU/KY, but `tasks/LAUNCH.md` flags them "placeholder-grade, needs counsel." Get a KG lawyer to review before collecting real customer PII. *(owner: ___)* **[BLOCKER]** *(you are collecting personal data at launch)*
- [ ] **KG personal-data operator notification** — file the personal-data operator notification with the authority (researched in MEMORY: KG legal/registration — entity/tax/data-operator filings). Consent checkbox on the lead form already covers collection consent; the *operator notification* is the separate filing. *(owner: ___)* **[BLOCKER]**
- [ ] **Cookie / consent banner** ❌ FAIL — none exists. **Mitigation: choose a cookieless analytics tool (Plausible, §7) and you may not need a full banner for the pilot** — confirm with counsel. If any cookie-setting tool is added (Yandex Metrica), a banner becomes mandatory. Cross-linked to §7. *(owner: ___)* **[IMPORTANT]**
- [ ] **Registered KG legal entity + tax (ГНС) registration complete** — required to issue invoices (счёт-фактура) for the founding cohort (`03` §7 P0; MEMORY: KG legal/registration). Gates the first invoice, **not the pilot start** — the free trial runs without it; complete it during the 30-day trial window at the latest, before the day-30 paid conversion. *(owner: ___)* **[IMPORTANT]**
- [ ] Prepare a compliant **счёт-фактура invoice template** (entity name, ИНН/ПИН, bank details) — `05` §6 lists the fields. *(owner: ___)* **[IMPORTANT]**
- [ ] **Trademark check for «Jaqyn»** — search the KG trademark registry (Кыргызпатент) for conflicts before printing brand assets and social handles. *(owner: ___)* **[IMPORTANT]**
- [ ] Verify the **lead-form privacy link resolves** (not a 404) and the consent checkbox is required (`04` §4 trust stack). *(owner: ___)* **[IMPORTANT]**

---

## 5. BILLING & MONEY

**Launch decision (from `03`): launch the free pilot WITHOUT billing code.** Manual
invoicing covers cohort one (~25 businesses). Therefore all *code* billing items
are **IMPORTANT**, not BLOCKER. The single true prerequisite is the legal entity
(in §4) so a manual invoice can be issued.

- [ ] **Do NOT publish a price on the landing page** — landing says "30-day free trial" only (`03` §4, `01` risk #4). Verify no price leaked into landing copy. *(owner: ___)* **[BLOCKER]** *(publishing an unvalidated price is the harmful action)*
- [ ] **Manual-invoicing readiness** — legal entity (§4) + счёт template (§4) + a way to toggle a business "paid/active" by hand in Django admin. This is the entire "billing" system for cohort one. *(owner: ___)* **[IMPORTANT]**
- [ ] Reference — the full billing build checklist lives in **`docs/gtm/03-pricing.md` §7** (P0 Plan/Subscription model + service-layer entitlement checks + trial-expiry enforcement; P1 FreedomPay + dunning + SMS; P2 per-region price books). **Do not duplicate it here.** Track P0 items there. *(owner: ___)* **[IMPORTANT]**
- [ ] Trial-expiry enforcement (`trial_ends_at` is currently decorative) — needed before self-serve, not before the founder-led pilot (founder converts on proof at day 21, `03` §3). *(owner: ___)* **[NICE-TO-HAVE]** *(for the pilot; [IMPORTANT] for self-serve)*
- [ ] FreedomPay integration — deferred (P1, self-serve gate). Stripe is unavailable in KG (`03` §7). *(owner: ___)* **[NICE-TO-HAVE]** *(for the pilot)*

---

## 6. SUPPORT & OPERATIONS

- [ ] **Stand up one support channel** — recommend a **single Jaqyn Telegram + one WhatsApp number** (not per-business). Put it in the app footer + landing + onboarding pack so it's discoverable (fixes the ❌ FAIL support surface). *(owner: ___)* **[IMPORTANT]**
- [ ] **Write a customer/owner-facing FAQ page** — no in-app FAQ exists (❌ FAIL). Ship a simple RU-first help page reachable from the app menu, seeded with the 10 canned answers below. *(owner: ___)* **[IMPORTANT]**
- [ ] Define an **operations runbook for the founder** — how to: approve a pending business (admin), provision a staff seat (admin), issue an invoice, toggle paid status, look up a customer's wallet, void a wrongly-awarded stamp. *(owner: ___)* **[IMPORTANT]**

**Canned responses — draft these 10 before launch (RU-first; one-line answers here):**

- [ ] **How do customers join?** — They scan the café's table-tent QR (or personal QR); a page opens, they enter email, get a 6-digit code, done — no app install. *(owner: ___)* **[IMPORTANT]**
- [ ] **Staff won't / can't scan** — Open the staff scanner, tap once, point at the customer's QR; audio confirm = success. If the camera fails, use manual-entry fallback; re-add the staff seat in admin if their login is missing. *(owner: ___)* **[IMPORTANT]**
- [ ] **Customer lost their phone** — Their loyalty lives on their account, not the device; they log back in with the same email on any phone and the wallet is intact. *(owner: ___)* **[IMPORTANT]**
- [ ] **Wrong stamp / awarded by mistake** — The owner/founder can adjust the customer's balance in the admin; note the reason. (Interim until an in-app void exists.) *(owner: ___)* **[IMPORTANT]**
- [ ] **Refund / reverse a redeemed voucher** — Vouchers redeem once, server-enforced; to reverse, re-issue a fresh voucher to the customer rather than un-redeeming, and log it. *(owner: ___)* **[IMPORTANT]**
- [ ] **Change a reward / loyalty rule** — Edit the loyalty program in the business dashboard; changes apply going forward, existing progress is preserved. *(owner: ___)* **[IMPORTANT]**
- [ ] **Add a staff member** — Owner adds a staff scanner seat from settings; during the pilot the founder can add it via admin if invite email hasn't fired. *(owner: ___)* **[IMPORTANT]**
- [ ] **Reprint / replace a QR** — The QR encodes a stable token (`/q/{token}`); reprint the same table-tent PDF — the code doesn't change and old prints keep working. *(owner: ___)* **[IMPORTANT]**
- [ ] **Data privacy — what do you store / GDPR-style ask** — We store the customer's email + their loyalty activity per business, nothing more; see the privacy policy; a customer can request deletion via the support channel. *(owner: ___)* **[IMPORTANT]**
- [ ] **Cancel / stop using Jaqyn** — No lock-in: the owner tells us to deactivate; during the pilot there's nothing to unsubscribe from (free), and no auto-charge exists yet. *(owner: ___)* **[IMPORTANT]**

---

## 7. MARKETING & LAUNCH ASSETS

- [x] Landing site live ✅ — jaqyn.kg exists with hero, benefits, deal carousel, QR workflow, dashboard preview, FAQ, consent lead form (`04` §4). *(owner: ___)* **[IMPORTANT-satisfied]**
- [ ] **Apply `04` §4 P0 landing changes** — (a) new headline «Ваши гости возвращаются. И приводят друзей.»; (b) **group-campaign explainer section** «Ваши гости — ваша реклама» (the uncontested differentiator, currently not on the page); (c) Founding-Customer counter "осталось [N] из 25". *(owner: ___)* **[IMPORTANT]**
- [ ] **Install privacy-light analytics** — recommend **Plausible (cookieless)** so it sidesteps the missing cookie-banner gap (§4). Yandex Metrica has stronger KG/RU fit **but sets cookies → forces a consent banner** — only pick it if you also ship the banner. Analytics is currently Sentry-only (⚠️ PARTIAL); this closes the "no user analytics" gap. *(owner: ___)* **[IMPORTANT]**
- [x] SEO surfaces ✅ PASS — `sitemap.ts` + robots + `llms.txt` exist. Verify Search Console/Bing/Yandex submission + `og:image` (MEMORY: SEO still manual). *(owner: ___)* **[NICE-TO-HAVE]**
- [ ] **Secure social accounts** — @jaqyn.kg (or @jaqyn_app) Instagram + @jaqyn_kg Telegram channel + founder personal Telegram bio (`06` §2, Appendix A). Grab the handles now even if content trails. *(owner: ___)* **[IMPORTANT]**
- [ ] **Content bank — 10 pieces before day 1** (`06` Appendix B): loyalty-math carousel, staff-scan Reels, group-join Reels, wallet-card Reels, paper-card breakdown, MBank comparison, Jaqyn-vs-alternatives table, founder photo post, "3 questions" carousel, wallet-card demo. *(owner: ___)* **[NICE-TO-HAVE]** *(sales works without it; social funnel doesn't)*
- [ ] **Announcement drafts** — `08` (not yet written) owns these; hold a placeholder. *(owner: ___)* **[NICE-TO-HAVE]**
- [ ] **Print QR table tents** — A5 branded PDF, 2 variants, ~300–600 KGS at a Bishkek print shop (`04` §2 / `05` §6). *(owner: ___)* **[IMPORTANT]**
- [ ] **Founding-offer one-pager** — A4 RU pitch PDF: one-sentence pitch, 3 proof points, dashboard screenshot, founding price, QR to sign up. Print 30 (`04` §2 / `05` §4). *(owner: ___)* **[IMPORTANT]**
- [ ] **«Калькулятор лояльности» lead magnet** (Google Sheet) per `06` §5 — highest-value ICP-A converter. *(owner: ___)* **[NICE-TO-HAVE]**

---

## 8. MEASUREMENT

**Targets are laddered to the docs (`04` §8, `05` §6/§7), not to an aggressive
"5 cafés week 1."** With ~45-min on-site onboarding per café and founder hours as
the binding constraint (`03` §6), week-1 live count is realistically low; density
builds by week 4 and day 90.

### Week-1 targets

| Target | Value | Trackable today? |
|---|---|---|
| Demos completed | ≥ 2 | ⚠️ Manual pipeline sheet (`05` §7) — no in-app funnel |
| Businesses live (onboarded, ≥1 real scan) | 1–2 | ✅ Business dashboard + ScanLog (`backend/apps/qr/models.py`) |
| First real staff scan in prod | 1 | ✅ ScanLog / `apps/reporting` |
| First customer joins a loyalty program | ≥ 3 | ✅ loyalty enrollment + `/admin/analytics/` (`apps/reporting/analytics.py`) |
| Outreach DMs sent | ≥ 5 | ⚠️ Manual pipeline sheet |

### Month-1 targets (aligns with `04` §8 "≥3 live by week 4" → building toward day-90 15 live / 8 paying)

| Target | Value | Trackable today? |
|---|---|---|
| Businesses live on a group campaign | ≥ 3 | ✅ campaign joins/completions, business dashboard + `/admin/analytics/` |
| Total scans across cohort | ≥ 40/active café (`05` conversion bar) | ✅ ScanLog |
| Group-campaign completions | ≥ 5 groups | ✅ campaign analytics (`/api/business/campaigns/<id>/analytics/`) |
| Repeat visitors (≥2 scans, same customer) | ≥ 10/active café | ✅ customer visit history (`apps/reporting`) |
| Founding-rate conversions | 0–2 (proof-led, converts from day 21) | ⚠️ Manual (invoice/admin toggle) — no billing analytics |
| Instagram DMs → demos | ≥ 2 demos from social | ⚠️ Manual pipeline sheet (`06` §6) |

**Trackability summary.** Product-usage numbers (scans, redemptions, campaign
joins, completions, repeat visits, funnel) are **trackable today ✅** via ScanLog
(`backend/apps/qr/models.py`), the business dashboard, and `/admin/analytics/`
(`apps/reporting/analytics.py`). Acquisition-funnel numbers (DM→demo→trial→paying,
signup funnel) have **no in-app analytics ⚠️** — but they are **not unmeasured**:
they live in the founder's manual pipeline sheet (`05` §7). Installing Plausible
(§7) closes web-traffic tracking; the sales funnel stays manual by design for
cohort one.

- [ ] Set up the **manual pipeline sheet** (`05` §7 stages: Lead→Contacted→Replied→Demo booked→Demo done→Trial active→Paying→Churned) before the first outreach. *(owner: ___)* **[IMPORTANT]**
- [ ] Agree the **per-café conversion bar** with each pilot owner at onboarding (scans ≥40, ≥5 groups, ≥10 repeat customers over 30 days — `05` §6). *(owner: ___)* **[IMPORTANT]**
- [ ] Confirm the **business dashboard + `/admin/analytics/` render correctly with real (non-seed) data** before the first day-21 check-in. *(owner: ___)* **[IMPORTANT]**

---

## Launch gate — the go/no-go

**Cannot start the founder-led pilot until every [BLOCKER] above is checked.**
Everything [IMPORTANT] should be done before or within the first onboarding week;
[NICE-TO-HAVE] can trail into month 1.
