---
title: GTM 09 — Metrics, Analytics & Retention System
service: platform
type: strategy
status: active
last_reviewed: 2026-07-07
---

# Metrics, Analytics & Retention System — Jaqyn

**Who executes this:** 1 technical founder, ~10 hrs/week (→05 §8), founder-led
pilot launching ~2026-08-04 (→08 §2). Every number below must be gettable in
minutes from tools that already exist, or it does not belong in a one-founder
system.

**Reading key (used throughout, matching →07 §8's honesty style):**

- **✅ EXISTS** — data is captured and queryable today (cite the model/endpoint).
- **🔧 NEW-DEV** — the *data* may exist but the *capture or report layer* must be
  built. Every 🔧 is a small, named task, not a rewrite.
- **⚠️ CANNOT-MEASURE-YET** — no source exists; use a named proxy or a manual sheet.

**One structural trap resolved up front (→ blocks §5/§6).**
`NotificationPreference.email_enabled` defaults to **`False`**
(`backend/apps/notifications/models.py:14`). Any lifecycle email that *respects*
that flag reaches ~zero customers. Lifecycle emails in §5 are therefore sent as
**transactional / legitimate-interest** messages that bypass the marketing
preference exactly as the OTP path does (`accounts/tasks.py:31`) — welcome and
win-back are service messages about the customer's own loyalty account, not
promotions. Every recipient still gets a one-line RU unsubscribe. This is a
🔧 NEW-DEV prerequisite: a `send_lifecycle_email(user, template)` helper that
logs to `NotificationLog` and does **not** gate on `email_enabled`.

---

## 1. North Star Metric

### The metric

> **Weekly Repeat Stamps Awarded (WRSA)** — the count, per ISO week, of successful
> loyalty-award scans given to a customer who has **at least one prior successful
> scan at that same business**.

Operational definition (SQL-computable against shipped models):

```
WRSA(week) = COUNT(ScanLog s)
  WHERE s.status = 'success'
    AND s.action IN (<award/collect actions>)      -- stamp/points award, not a redeem
    AND s.customer_id IS NOT NULL
    AND s.business_id IS NOT NULL
    AND s.created_at ∈ week
    AND EXISTS (
      SELECT 1 FROM ScanLog p
      WHERE p.customer_id = s.customer_id
        AND p.business_id = s.business_id
        AND p.status = 'success'
        AND p.created_at < s.created_at
    )
```

**Unit choice (committed):** count *repeat-stamp events*, not unique customers —
it's the value delivered, and it lets one loyal regular's 4 visits/week register
as 4 units of habit, which is what a café monetizes. Report a secondary
**unique-repeat-customers** cut alongside it (same query, `COUNT(DISTINCT
customer_id)`) so a single heavy user can't mask a thin base.

### Why this is the right north star

A north star must move up **only when both sides of the marketplace win**. WRSA is
the single event where that is simultaneously true:

- **For the café:** a repeat stamp *is* a returning paying guest at the till —
  the exact outcome the whole product is sold on («Jaqyn brings customers back»,
  →01 §5). It is the numerator of every ROI story the founder tells at the day-21
  check-in (→05 §6).
- **For the customer:** a repeat stamp is measurable progress toward a reward they
  chose to pursue — the habit forming, not a one-off.

### Why the obvious alternatives are rejected

| Candidate | Why not the north star |
|---|---|
| **Total scans** | Vanity. It counts first-ever scans (acquisition, one-time) and voucher redemptions (a *cost* event) equally with repeat visits. A café with 40 first-time scans and zero returners looks healthy and is dying. Total scans is a good *input* metric (→07 §8 uses it as a per-café bar), not the north star. |
| **Signups / customer joins** | Top-of-funnel. Measures reach, not delivered value. A customer who joins and never returns delivered nothing to the café. |
| **Vouchers redeemed** | Lags too far and conflates cost with value; a redeem is the *payoff*, not the recurring habit. Track it as a health metric (§7), not the star. |
| **MRR** | Correct long-run business metric but, in the founder-led free pilot, revenue is deliberately decoupled from usage (→03, →08 §1). MRR at launch reflects founder sales hours, not product value. Revisit as north star at Stage 3 (self-serve). |

**Cadence:** weekly (ISO week), reviewed every Friday (§7), aligned to 05's Friday
review ritual. **Source:** ScanLog (`backend/apps/qr/models.py:47`) — ✅ EXISTS as
data; the WRSA query itself is 🔧 NEW-DEV (one saved SQL / Django admin action, §3).

---

## 2. The Two Funnels

Conversion metric between each stage, and where each number comes from **today**.
Tri-flagged per the reading key.

### 2.1 Business funnel: lead → demo → live → retained-paying

| # | Stage | Definition | Conversion metric | Source today |
|---|---|---|---|---|
| B0 | **Lead** | In the 120-lead 2GIS DB or discovered | — | ✅ `apps/leads` admin table + pipeline sheet (→05 §7) |
| B1 | **Contacted → Replied** | First outreach sent; any reply | reply / contacted (target ≥20%, →05 §7) | ⚠️ Manual pipeline sheet — no in-app capture |
| B2 | **Demo done** | 15-min demo completed | demo / replied (≥50%) | ⚠️ Manual pipeline sheet |
| B3 | **Live** | Business onboarded **and ≥1 real staff scan logged** | demo / trial→ (≥60%) | ✅ Business row + ScanLog `business_id` first success (`apps/reporting/analytics.py`) — *the one stage the product can prove* |
| B4 | **Retained** | ≥40 scans / ≥10 repeat visitors over 30 days (→05 §6 bar) | retained / live | ✅ ScanLog + `/api/business/customers/` (lifetime stamps) |
| B5 | **Paying** | Invoice issued + paid, subscription toggled active | paying / retained | ⚠️ Manual (admin toggle, no billing code — →03, →08 §7) |

**Honest read:** stages **B3–B4 are ✅ measurable in-app** (they are product usage).
Stages **B1, B2, B5 are ⚠️ manual by design** for cohort one and live in the Google
Sheet (→05 §7, →07 §8). This is not a gap to close before launch — installing
Plausible closes *web* traffic only; the sales funnel stays manual until self-serve
(Stage 3, →08 §1). Do not build in-app sales-CRM analytics for 25 businesses.

### 2.2 Customer funnel: QR scan → signup → join → first stamp → repeat → redemption

| # | Stage | Definition | Conversion metric | Source today |
|---|---|---|---|---|
| C0 | **QR landing view** | `/q/[token]` opened (first touch) | — | 🔧 NEW-DEV — needs a Plausible custom event on the page; **not** captured today |
| C1 | **Scan → Signup** | Anonymous QR view → email-OTP account created | signup / QR view | ⚠️ **CANNOT-MEASURE-YET** — a pre-signup QR view has no `customer_id`; ScanLog can't join an anon view to the later account. Measure the *denominator* (views) via Plausible 🔧 and the *numerator* (new users/day) via `User.date_joined` ✅; the ratio is approximate, flag it |
| C2 | **Signup → Join** | Account → enrolled in a loyalty program | join / signup | ✅ `LoyaltyMembership` row exists per (customer, program); `apps/reporting` + `/admin/analytics/` |
| C3 | **Join → First stamp** | First successful award scan for that membership | first-stamp / join | ✅ First ScanLog success with `customer_id` (the **activation** event, §4) |
| C4 | **First stamp → Repeat** | A *second* success scan at same business | repeat / first-stamp | ✅ ScanLog self-join (this is the WRSA base, §1) |
| C5 | **Repeat → Redemption** | Voucher redeemed | redeem / repeat | ✅ `Voucher.redeemed_at` / `status=REDEEMED` (`apps/loyalty/models.py:210,232`) |

**Honest read:** the **core value funnel C2→C5 is fully ✅ measurable** against
shipped models (LoyaltyMembership → ScanLog → Voucher). Only the **top edge
(C0–C1) is weak**: the QR-view denominator requires Plausible instrumentation
(🔧) and true view→signup attribution is CANNOT-MEASURE-YET without threading the
QR token into the signup record (a future 🔧 if attribution ever matters — it does
not for the pilot; the founder knows which café each customer came from).

---

## 3. Event Tracking Plan

**Two sources of truth, split by event class (this split is the whole design):**

- **Product events** (scan / stamp / redeem / join / voucher) → **ScanLog +
  Postgres** are already the source of truth. The events are *captured* ✅; the
  **query/report layer over them is 🔧 NEW-DEV** (a `reporting/gtm_metrics.py`
  module of ~8 saved queries + a Django-admin "GTM weekly" page, ~1 day of work).
- **Web-funnel events** (landing / QR view / signup steps) → **Plausible**, which
  is **not installed yet** (→07 §7, →08 T-4). Every custom web event below is
  **🔧 NEW-DEV instrumentation** (a `plausible('EventName')` call on the page).

> A "✅ exists" on the underlying data never hides a "🔧 NEW-DEV" on the capture —
> both columns are shown per event.

### Recommended stack (sized to <$20/mo)

**Chosen: Plausible (cloud, cookieless) + ScanLog/Postgres as the product-event
source of truth + a weekly Django-admin/SQL report.**

- **Plausible** — cookieless, ~$9/mo starter, EU-hosted. Web funnels + custom
  goals for landing/QR/signup. Cookieless **sidesteps the missing consent banner**
  (→07 §4, →04) — the decisive reason. Already committed in →07 §7 and →08 (T-4).
- **ScanLog/Postgres** — already the product-event ledger; zero new infra. The
  WRSA query, activation query, and churn signals (§6) all run here.
- **Weekly report** — the §7 template, filled Friday in 30 min from a single
  Django-admin "GTM" page (🔧) + the Plausible dashboard + the manual pipeline sheet.

**Documented alternative (not chosen):** **PostHog free tier** (1M events/mo)
gives product analytics + funnels + session data in one tool. Rejected because it
**sets cookies by default → forces the consent banner** the pilot is trying to
avoid, adds a client SDK to the bundle, and duplicates the ScanLog ledger the
product already keeps. Choosing it would contradict the launch plan (→08 T-4).
Revisit at Stage 3 when a consent banner ships anyway.

### Event table (18 events)

Product events are named `snake_case`; web/Plausible goals are `Title Case`.

| # | Event | Class | Trigger (real screen / endpoint) | Key properties | Capture status |
|---|---|---|---|---|---|
| 1 | `Landing View` | web | jaqyn.kg page load (→04) | path, referrer, utm | 🔧 NEW-DEV (Plausible auto-pageview; goal setup) |
| 2 | `Lead Form Submit` | web | landing consent lead form submit | source | 🔧 NEW-DEV (Plausible goal) |
| 3 | `QR Landing View` | web | `/q/[token]` opened (first customer touch) | business_id, token | 🔧 NEW-DEV (Plausible custom event) |
| 4 | `Signup Start` | web | `/signup/email` page view | source=qr\|direct | 🔧 NEW-DEV (Plausible goal) |
| 5 | `otp_requested` | product | `POST request-email-otp` (`accounts/urls.py:23`) | channel=email | ✅ data via NotificationLog; 🔧 report |
| 6 | `signup_completed` | product | email-OTP verified → `User` created (`accounts/services.py:149`) | user_id, joined_via | ✅ `User.date_joined`; 🔧 report |
| 7 | `program_joined` | product | `LoyaltyMembership` created (auto-join or `/q` flow) | membership_id, business_id, program_type | ✅ `LoyaltyMembership`; 🔧 report |
| 8 | `stamp_awarded` | product | `POST /api/staff/scan/` success (award action) | customer_id, business_id, staff_id, is_repeat (bool) | ✅ ScanLog (`qr/models.py:47`); 🔧 WRSA report |
| 9 | `first_stamp` | product | first `stamp_awarded` for a membership (**activation**, §4) | customer_id, business_id, hours_since_signup | ✅ derived from ScanLog; 🔧 report |
| 10 | `repeat_stamp` | product | `stamp_awarded` where a prior success scan exists (**north star base**) | customer_id, business_id | ✅ ScanLog self-join; 🔧 WRSA report |
| 11 | `campaign_scan` | product | `POST /api/staff/campaigns/scan/` success (`01` §1) | campaign_id, kind=individual\|group | ✅ ScanLog; 🔧 report |
| 12 | `group_joined` | product | customer joins a group (`/campaign-groups/<id>/invite/`) | group_id, business_id, is_leader | ✅ campaign models; 🔧 report |
| 13 | `group_completed` | product | group reaches required check-ins | group_id, business_id, seats | ✅ `/api/business/campaigns/<id>/analytics/`; 🔧 report |
| 14 | `voucher_issued` | product | `Voucher` row created (reward earned) | voucher_id, business_id, reward_type, expires_at | ✅ `Voucher.issued_at` (`loyalty/models.py:230`); 🔧 report |
| 15 | `voucher_redeemed` | product | `POST redeem-voucher` → `Voucher.redeemed_at` set | voucher_id, business_id, days_to_redeem | ✅ `Voucher.redeemed_at:232`; 🔧 report |
| 16 | `scan_failed` | product | ScanLog `status=failed/blocked` | failure_reason, business_id | ✅ ScanLog (`status`,`failure_reason`); 🔧 report — **scan-friction signal** |
| 17 | `business_went_live` | product | first ever `status=success` scan for a business (B3) | business_id, days_since_onboard | ✅ derived from ScanLog; 🔧 report |
| 18 | `lifecycle_email_sent` | product | `send_lifecycle_email()` fires (§5) | user_id, template, status | 🔧 NEW-DEV (helper + NotificationLog write) |

**NEW-DEV summary:** 4 Plausible web goals (#1–4), 1 Plausible custom event (#3),
1 lifecycle-email helper (#18), and **one `reporting/gtm_metrics.py` module** that
turns the ✅ product data (#5–17) into the §7 report. Everything product-side is
*captured today* — only the read layer is new. No client analytics SDK is added.

---

## 4. Activation — the "Aha Moment"

Activation is the moment a new user has experienced the product's core value once,
such that they are meaningfully likely to return. Two definitions, one per side.

### Customer activation — **first stamp within 24h of signup**

> A customer is **activated** when their first successful award scan
> (`first_stamp`, event #9) occurs **within 24 hours of `signup_completed`**.

**Reasoning from the docs.** The customer joins by scanning a table-tent QR *at the
café, mid-visit* (→05 Obj.4, →01 §3: `/q/[token]` auto-join). So the natural
activation window is *the same visit* — the staff scan that awards the first stamp
should happen minutes after signup, not days. If it doesn't happen on visit one,
the docs' own risk #2 (→08 §6 "customers join once but don't return") is already
in motion. 24h captures "same visit / same day" with slack for a customer who
scans the tent, signs up, and gets stamped on the way out. Measurable ✅ from
ScanLog + `User.date_joined`.

### Business activation — **first 10 successful scans within 7 days of going live**

> A business is **activated** when it logs **10 successful scans within 7 days** of
> `business_went_live` (event #17).

**Reasoning from the docs.** →08 §1 Stage-1 gate is "≥10 real scans." →07 §8 week-1
target is "≥1 real scan"; the risk register (→08 §6 Risk 1) names *staff not
scanning* as the #1 failure mode. 10 scans in the first week is the earliest
signal that staff have actually adopted the ask-and-scan habit rather than the
owner scanning once for the demo and stopping. Measurable ✅ from ScanLog.

### Three onboarding changes to raise activation, grounded in existing screens

1. **Make the `/q/[token]` first-scan flow end on "show this to staff now."**
   Today the QR landing → auto-join → wallet. Add a one-line closing state on the
   `/q` flow: «Покажите этот экран сотруднику — получите первую печать сейчас»
   ("Show this screen to staff — get your first stamp now"), deep-linking the
   customer's personal QR. This collapses the signup→first-stamp gap to seconds
   and directly drives the 24h customer-activation metric. *(existing screen:
   `/q/[token]` + `/loyalty`; small copy/CTA change.)*

2. **Fold staff scan-training into a checklist the founder completes on-site,
   scored by activation.** →05 §6 onboarding already includes "let staff scan you
   once." Make that scan the *seed* of the 10-in-7 business-activation count and
   tell the owner the bar out loud: «Первая цель — 10 сканирований за 7 дней. Я
   вернусь в четверг посмотреть.» It turns an abstract onboarding step into a
   named target the owner and staff own. *(existing: →05 §6 onboarding + Thursday
   relationship call.)*

3. **Use the onboarding carousel's last slide as an activation nudge, not a
   welcome.** The consumer onboarding tour (`/onboarding`, 6 slides, gated on
   `CustomerProfile.onboarding_completed`) currently ends generically. Make the
   final slide a single action: «Отсканируйте QR на столике, чтобы получить первую
   печать» with the wallet CTA. Every new customer passes through it; make it point
   at the activation event. *(existing: `/onboarding` carousel.)*

---

## 5. Retention Program — Lifecycle Communications

**Channel reality (state plainly):** customer email via the shipped **Resend**
path is the only live customer channel. There is **no push** (PWA, no iOS push —
→07 §1), **SMS is a dev stub** (→07 §1), Telegram/WhatsApp customer sends are
config flags with no live sender. So: **email now; SMS/Telegram when they ship.**
All lifecycle email is sent via the `send_lifecycle_email()` helper that bypasses
`email_enabled` as transactional/legitimate-interest (see the trap note up top),
logs to `NotificationLog`, and carries a one-line unsubscribe. 🔧 NEW-DEV: the
helper + two email templates below + one Celery beat schedule.

### 5.1 Welcome email — customer (send: on `signup_completed`, via `on_commit`)

**Recipient: the customer** (higher-leverage than a business welcome — business
onboarding is founder-led and in-person, →05 §6, so a business welcome email is
low value). Copy grounded **only in shipped features** — wallet card, stamps→reward,
next-visit scan, `/loyalty` link. No push, no unshipped features.

**Subject (RU):** «Ваша карта лояльности готова 🎉»
**Subject (EN):** "Your loyalty card is ready 🎉"

**RU body:**
```
Здравствуйте!

Ваша карта лояльности в Jaqyn готова — она уже в вашем телефоне, её
невозможно потерять или забыть дома.

Как это работает:
• Каждый визит — печать. Собираете нужное количество — получаете награду.
• Ничего скачивать не нужно. Ваша карта открывается по ссылке ниже.
• В следующий визит просто покажите свой QR сотруднику — и печать ваша.

→ Открыть мою карту: {loyalty_url}

Хорошего дня,
команда Jaqyn

—
Это письмо об вашей карте лояльности. Не хотите получать такие письма? Ответьте «стоп».
```

**EN translation:**
```
Hello!

Your Jaqyn loyalty card is ready — it's already in your phone, impossible
to lose or leave at home.

How it works:
• Every visit earns a stamp. Collect enough and you get a reward.
• Nothing to download. Your card opens from the link below.
• Next visit, just show your QR to the staff — and the stamp is yours.

→ Open my card: {loyalty_url}

Have a good day,
the Jaqyn team

—
This is an email about your loyalty card. Prefer not to receive these? Reply "stop".
```

### 5.2 Inactivity win-back — customer (send: no scan 14 days after first stamp)

Trigger source ✅: ScanLog — customer has `first_stamp` but no success scan in 14
days (§6 signal). **Email now; queue the same copy for SMS/Telegram when shipped.**

**Subject (RU):** «Вам осталось совсем немного до награды ☕»
**Subject (EN):** "You're just a little away from your reward ☕"

**RU body:**
```
Здравствуйте!

Ваша карта в {business_name} ждёт вас — до награды осталось {stamps_left}
{печать/печати/печатей}. Зайдите на кофе, покажите свой QR сотруднику,
и вы станете ближе к цели.

→ Посмотреть мою карту: {loyalty_url}

До встречи,
команда Jaqyn

—
Ответьте «стоп», чтобы не получать напоминания.
```
*(Note: `{stamps_left}` and the plural form come from the loyalty membership;
if the program is cashback-based, swap to «ваш кэшбэк ждёт вас».)*

**EN translation:**
```
Hello!

Your card at {business_name} is waiting — you're just {stamps_left} stamp(s)
away from your reward. Drop in for a coffee, show your QR to the staff, and
you'll be closer to the goal.

→ View my card: {loyalty_url}

See you soon,
the Jaqyn team

—
Reply "stop" to stop reminders.
```

### 5.3 Feature-announcement pattern

Keep it a **pattern, not a broadcast machine** (one founder, small cohort). When a
customer-visible feature ships: a single short RU email to *active* customers only
(scanned in the last 30 days — never re-wake churned users with a feature blast),
one benefit sentence + one CTA into the exact screen, sent via
`send_lifecycle_email()`. For businesses, the announcement is a line in the
**Thursday relationship call** (→05 §8), not an email — the founder is already
talking to them.

### 5.4 In-product retention hooks that EXIST — how to exploit them

| Hook | What ships today | How to exploit it for retention |
|---|---|---|
| **ONE_AWAY notice** | `CampaignNotice` kind `ONE_AWAY` (`notifications/models.py`) fires when a customer is one stamp from a reward | The single strongest habit hook. Ensure `evaluate_patches()`/notice logic fires it reliably and it deep-links to `/loyalty`. Pair it with the §5.2 win-back so "one away + inactive" gets an email, not just an in-app notice. |
| **Group invites** | Group campaigns with WhatsApp/Telegram invite links (→01 §1) | Each invite is a customer-driven re-engagement of *other* customers — retention that spreads. Surface "invite friends" at the moment a group notice (`GROUP_SEAT_FILLED`) lands. |
| **Tier ladder** | `LoyaltyTier` status ladder on points programs (→ MEMORY tiered-cashback) | Status is a retention moat — show "1 visit to Gold." Feed tier-threshold proximity into the same ONE_AWAY-style nudge. |
| **Weekly business digest** | `send_weekly_report()` (`notifications/tasks.py:109`) | Retains the *owner* — the newspaper-not-scoreboard tactic (→08 §6 Risk 3). Ensure it always contains one number the owner hasn't seen (new repeat visitors + their names). |

### 5.5 Monthly cohort retention review (who / when / how)

- **Who:** the founder. **When:** first Friday of each month, ~30 min, appended to
  the existing Friday review (→05 §8).
- **How (SQL-level, against shipped models):**
  1. **Cohort a customer by signup month** (`User.date_joined`).
  2. For each cohort, compute **month-N retention** = share of that cohort with
     ≥1 `status=success` ScanLog in calendar month N after signup. (Self-contained
     ScanLog + User query — 🔧 one saved query in `reporting/gtm_metrics.py`.)
  3. **Segment by business** (ScanLog `business_id`) so a café with collapsing
     retention is visible against the cohort average — this is the café-level
     churn early-warning (§6) rolled up.
  4. Read one triangle table (cohorts × months). Action: any cohort whose month-1
     retention is <30% → the *activation* onboarding (§4) is failing for those
     businesses; go re-train (→05 §6).

---

## 6. Churn Early-Warning Signals + Intervention Playbook

Each signal: threshold, detection source (existing tables only), intervention
(from →05's relationship-call cadence + §5 lifecycle messages).

### 6.1 Café (business) signals

| Signal | Threshold | Detection source | Intervention |
|---|---|---|---|
| **Scan count drop WoW** | This ISO week's success scans < 50% of last week's, for an active café | ✅ ScanLog `business_id` + `created_at`, weekly buckets | **The #1 signal (→08 §6 Risk 1).** Thursday relationship call (→05 §8): «Всё работает? Сотрудники спрашивают про карту?» Offer a 20-min re-train on-site. |
| **Staff stopped scanning** | **No** success scan by any staff at the café in **5+ days** | ⚠️ CANNOT-MEASURE directly — `StaffMember` has no last-login field. **Proxy:** ScanLog gap per `business_id` | Same Thursday call. Diagnose staff turnover; walk owner through re-adding a staff seat in admin (→07 §6 runbook). |
| **No new campaign after first ended** | First group campaign completed/expired + 0 new campaigns in 7 days | ✅ campaign models + `/api/business/campaigns/<id>/analytics/` | →08 §6 Risk 3 "novelty wears off": proactively propose the next campaign on the Thursday call — «Ваша следующая акция — давайте настроим в четверг». New feature resets the novelty clock. |

### 6.2 Customer signals

| Signal | Threshold | Detection source | Intervention |
|---|---|---|---|
| **No scan 14 days after first stamp** | `first_stamp` exists, no success scan in 14 days | ✅ ScanLog self-query | Send the §5.2 win-back email («осталось совсем немного до награды»). Email now; SMS/Telegram when shipped. |
| **Voucher expiring unused** | `Voucher.status=ACTIVE` AND `expires_at` within 72h AND `expiry_warned_at IS NULL` | ✅ `loyalty/models.py:231,236` — the model already carries `expiry_warned_at` for exactly this | Send a one-shot expiry-nudge email (reuse §5.2 template, subject «Ваша награда скоро сгорает»), set `expiry_warned_at` so it fires once. 🔧 NEW-DEV: a daily Celery beat scan. |

**Automation note:** all four measurable signals become **one daily Celery beat
task** (`churn_scan`) that writes `CampaignNotice`/`lifecycle_email` for customer
signals and appends business signals to the founder's Friday report — no dashboard
polling, one-founder-safe. 🔧 NEW-DEV, ~half a day, all queries above are shipped
models.

---

## 7. Weekly Metrics Review — One-Page Friday Template

**Fill in 30 minutes every Friday** (aligns with →05 §8 Friday review). Thresholds
are tied to the **exact** →07 §8 / →08 §7 targets — no new targets invented. This
**extends** →08 §7's launch dashboard (does not replace it); §8 §7 stays the daily
week-1 view, this is the recurring weekly one-pager.

**Legend:** 🟢 on target · 🟡 within 25% below target · 🔴 more than 25% below /
signal firing.

| Row | Source | 🔴 Red | 🟡 Yellow | 🟢 Green |
|---|---|---|---|---|
| **★ North star — WRSA** (weekly repeat stamps) | ScanLog (§1 query) 🔧 | flat or ↓ vs last wk | flat, but repeat-customers ↑ | ↑ vs last week |
| Unique repeat customers / active café | ScanLog | < 5 | 5–9 | ≥ 10 (→07 §8) |
| Total scans / active café (rolling 7d) | ScanLog | < 20 | 20–39 | ≥ 40 (→07 §8 / →05 §6) |
| Active businesses live | Admin Business list | below plan | at plan | ≥ wk-4 target 3 / wk-12 target 15 (→08 §7) |
| Group completions (rolling 7d) | `/api/business/campaigns/<id>/analytics/` | 0 | 1–4 | ≥ 5 (→07 §8) |
| Customer activation (first stamp <24h) | ScanLog + `date_joined` (§4) | < 40% | 40–59% | ≥ 60% |
| Business activation (10 scans / 7d) | ScanLog (§4) | any live café < 10 | — | all live cafés ≥ 10 |
| Voucher redemption rate | `Voucher` status (`loyalty/models.py`) | < 20% | 20–39% | ≥ 40% |
| **Churn signals firing** (§6) | ScanLog / Voucher | any café WoW-drop signal | 1 customer signal batch | none |
| Pipeline: demo→trial rate | Manual sheet (→05 §7) | < 60% | — | ≥ 60% (→08 §7) |
| Founding-rate paying | Manual (admin toggle) | below plan | at plan | ≥ wk-12 target 8 (→08 §7) |
| Website traffic (jaqyn.kg) | Plausible 🔧 | ↓ WoW | flat | ↑ WoW |
| Sentry errors / Uptime | Sentry / UptimeRobot | any critical / <29-30d | — | 0 critical / 100% |

**Fill order (30 min):** (1) open the Django-admin GTM page → copy the top 8 product
rows [15 min]; (2) glance Plausible → 1 row [2 min]; (3) glance Sentry/UptimeRobot →
1 row [2 min]; (4) copy pipeline + paying from the sheet → 2 rows [5 min]; (5) any
🔴 → book the matching intervention (§6) into next week's Thursday slot [6 min].

**Decision triggers (inherited from →08 §7, do not re-decide):** WRSA flat/down 2
weeks + scans OK → habit not forming, shorten reward threshold (→08 §6 Risk 2);
café WoW-drop → Thursday call; group completions 0 at day 21 → shorten window,
raise reward.

---

## Appendix — NEW-DEV backlog (everything flagged 🔧, one place)

| Item | Where | Size |
|---|---|---|
| `reporting/gtm_metrics.py` — WRSA, activation, cohort, churn queries + admin "GTM weekly" page | backend/apps/reporting | ~1 day |
| Plausible install + 4 web goals + 1 QR-view custom event | landing + `/q/[token]` + `/signup` | ~1–2 hr (→08 T-4) |
| `send_lifecycle_email()` helper (bypasses `email_enabled`, logs to NotificationLog) | backend/apps/notifications | ~2 hr |
| Welcome + win-back + voucher-expiry email templates (RU/EN) | backend/apps/notifications | ~2 hr |
| `churn_scan` daily Celery beat (customer signals → email/notice; business signals → report) | backend/apps/notifications | ~half day |
| `/q/[token]` "show staff now" activation CTA + onboarding final-slide nudge | frontend/apps/web | ~2–3 hr |

**Nothing here adds infra beyond the ~$9/mo Plausible plan.** Product events are
already captured in ScanLog; the work is read-layer + a handful of copy/CTA changes.
