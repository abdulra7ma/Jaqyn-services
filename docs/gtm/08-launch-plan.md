---
title: GTM 08 — Launch Plan
service: platform
type: strategy
status: active
last_reviewed: 2026-07-07
---

# Launch Plan — Jaqyn

**Who executes this:** 1 technical founder. Launch window: early August 2026. Every
activity traces to the 7 preceding GTM docs (cited throughout).

---

## 1. Launch Strategy Choice

**Decision: Staged rollout — silent pilot → founding-cohort push → public.**

Three options considered:

| Option | Why rejected / selected |
|---|---|
| **Public launch (broad, simultaneous)** | Rejected. Self-serve is blocked (SMS/OTP stub, no billing enforcement). A public campaign before the demo script is proven wastes the 120-lead DB. A broken self-serve path at public launch destroys trust with the exact ICPs you need. |
| **Soft launch to closed pilot group** | Partially right but insufficient as the full description. It names the first stage but doesn't capture the transition to broader acquisition. |
| **Staged rollout (selected)** | Correct. Matches every constraint: product blockers, founder-hour limits, the need to prove the demo before scaling it, and the founding-cohort offer mechanics. The docs collectively describe this in `03` §3, `04` §1, `05` §1 without naming it explicitly. |

**The three stages, defined:**

| Stage | What it is | Gate to next stage |
|---|---|---|
| **Stage 1 — Silent pilot** | Founder onboards 2–3 hand-picked cafés from the leads DB. No social announcement. No price published. Goal: prove one end-to-end scan + group campaign cycle works in prod with a real owner, real staff, real customers. | ≥ 1 café with ≥ 10 real scans + 1 completed group campaign. |
| **Stage 2 — Founding-cohort push** | Open outbound to the 120-lead DB (5 DMs/week). Activate Instagram + Telegram channels. Announce Jaqyn publicly in 3–4 Bishkek café Telegram groups. Goal: 15 live cafés, 8 founding-rate conversions by day 90. Founding rate locked for first 25 businesses through 2026-10-31. | 8+ paying founders, 1 published case study, demo script proven. |
| **Stage 3 — Public / self-serve** | Land page updated with social proof + founding café logos. Self-serve signup opens when SMS/OTP ships (B01). Referral program formalised. SEO + partnership channel activated. | SMS/OTP live + billing P0 built. Deferred to month 3+. |

**Why this order is non-negotiable:** Stage 1 failures (staff won't scan; owner abandons after day 3) must be caught and fixed before Stage 2 pushes the demo at scale. The founding-offer scarcity (25 seats) is most persuasive when you have real proof; running the scarcity play before you have any proof undermines both the offer and your credibility with every subsequent prospect. (→01 risk #5, →03 §3, →05 §1)

---

## 2. T-Minus Timeline

### Assumptions

- **T-0 (Launch Day) = 2026-08-04 (Tuesday)**. Chosen because: first business demo is booked mid-week (off café rush), giving the weekend buffer to fix any prod issues caught in the final smoke tests; aligns with the founding-cohort Telegram announcement before the first full outreach week (Mon 3 Aug). Adjust ±1 week if blockers slip.
- All [BLOCKER] items from `07` must be resolved before T-0.
- Time estimates are "active work time" — not elapsed calendar time.

---

### T-Minus 14 Days (2026-07-21 to 2026-08-03)

**Key: clear all 9 blockers. No outreach until prod smoke tests pass.**

| Day | Date | Task | Source | Est. time | Status check |
|---|---|---|---|---|---|
| T-14 | Jul 21 | Run prod smoke test: customer join via email OTP end-to-end (real email, real prod DB) | →07 §1 [BLOCKER] | 1 hr | Pass = proceed; fail = fix before T-7 |
| T-14 | Jul 21 | Run prod smoke test: business provisioned via admin → owner scans as staff (solo, no invite email) | →07 §1 [BLOCKER] | 1 hr | Pass = proceed |
| T-13 | Jul 22 | Verify `SEED_TEST_USERS=false` in Railway prod env. Verify seed commands not in prod entrypoint | →07 §3 [BLOCKER] | 30 min | Config check, not code |
| T-13 | Jul 22 | Run `git log` + secret-scan pass: confirm no secrets in repo/commits | →07 §3 [BLOCKER] | 45 min | Zero findings required |
| T-12 | Jul 23 | Verify landing page has NO published price — "30-day free trial" only; no price leaked | →07 §5 [BLOCKER] | 15 min | Live check on jaqyn.kg |
| T-12 | Jul 23 | Build demo café account: café name + logo, 1 group campaign, 1 stamp program, 10–15 fake scans, 2 completed groups | →07 §1 / →04 §2 / →05 §4 [BLOCKER] | 2 hr | The show-don't-tell engine |
| T-11 | Jul 24 | Counsel review of privacy + terms pages (KG lawyer) — brief them, provide the doc URLs | →07 §4 [BLOCKER] | 1 hr (brief) | Legal review may trail to T-5 |
| T-11 | Jul 24 | File KG personal-data operator notification (or confirm filing already submitted) | →07 §4 [BLOCKER] | 2 hr | Government filing — can run in parallel with above |
| T-10 | Jul 25 | Re-test Postgres backup restore: Railway backup → restore to scratch → verify data integrity | →07 §2 [BLOCKER] | 2 hr | Document date + result |
| T-10 | Jul 25 | Confirm Railway auto-deploy on `main` is green: all 6 services (backend/Celery/PG/Redis/frontend/landing) healthy | →07 §2 | 30 min | Dashboard check |
| T-9 | Jul 26 | Apply landing P0 changes: (a) new headline «Ваши гости возвращаются. И приводят друзей.» (b) group-campaign explainer section «Ваши гости — ваша реклама» (c) founding-customer counter "осталось [N] из 25" | →07 §7 / →04 §4 [IMPORTANT] | 3 hr | Live check post-deploy |
| T-9 | Jul 26 | Verify social-proof campaign type NOT surfaced in business campaign-create UI (exclude from launch) | →07 §1 / →01 risk #7 | 30 min | Manual UI check |
| T-8 | Jul 27 | Set up manual pipeline sheet (Google Sheets): stages Lead→Contacted→Replied→Demo booked→Demo done→Trial active→Paying→Churned | →07 §8 / →05 §7 [IMPORTANT] | 45 min | Ready before first DM |
| T-8 | Jul 27 | Secure social handles: @jaqyn.kg Instagram + @jaqyn_kg Telegram channel + write founder Telegram bio | →07 §7 / →06 §2 Appendix A [IMPORTANT] | 45 min | Grab handles even if content trails |
| T-7 | Jul 28 | Create 3 Canva templates (carousel 5-slide, single post terracotta, Reels text overlay) | →06 §7 [IMPORTANT] | 45 min | Once built, reuse forever |
| T-7 | Jul 28 | Record 3 screen recordings: (1) staff scan 30s, (2) group campaign join 45s, (3) wallet card 15s | →06 Appendix B [IMPORTANT] | 1 hr | Content bank foundation |
| T-6 | Jul 29 | Produce content bank 10 posts (loyalty-math carousel, staff-scan Reels, group-join Reels, wallet Reels, paper-card breakdown, MBank comparison, Jaqyn-vs-alternatives table, founder photo, "3 questions" carousel, wallet demo) | →06 Appendix B | 3 hr | Batch in one session |
| T-6 | Jul 29 | Print QR table-tent PDFs (A5 branded, 2 variants, ~10 copies at local Bishkek print shop, ~300–600 KGS) | →07 §7 / →04 §2 [IMPORTANT] | 30 min prep + print shop run | Physical asset for first demo |
| T-5 | Jul 30 | Print 30 copies founding-offer one-pager (A4 RU pitch PDF: one-sentence pitch, 3 proof points, dashboard screenshot, founding price, QR to jaqyn.kg). Note: founding price in the PDF for in-person use; NOT on the public landing page. | →07 §7 / →04 §2 [IMPORTANT] | 1 hr design + print run | One-pager handed at demo close |
| T-5 | Jul 30 | Add env validation for DATABASE_URL, REDIS_URL, SECRET_KEY at boot in prod.py (fail-fast hardening) | →07 §3 [IMPORTANT] | 1 hr | Fast win; deploy + verify |
| T-5 | Jul 30 | Add uptime check: UptimeRobot/BetterStack free tier pinging frontend URL + backend health endpoint → founder Telegram notification on downtime | →07 §2 [IMPORTANT] | 30 min | Free tier, 5-min setup |
| T-4 | Jul 31 | Configure Sentry alert rules: new-issue + error-spike → founder Telegram/email notification | →07 §2 [IMPORTANT] | 30 min | Confirm alerts fire with test error |
| T-4 | Jul 31 | Write rollback plan (1 paragraph in DEPLOY.md): Railway rollback procedure, who does it, max time-to-rollback. Do a rehearsal redeploy. | →07 §2 [IMPORTANT] | 1 hr | Document the plan |
| T-4 | Jul 31 | Install Plausible (cookieless analytics) on jaqyn.kg — avoids cookie-banner requirement | →07 §4/§7 [IMPORTANT] | 1 hr | Verify data flows before T-0 |
| T-3 | Aug 1 | Stand up support channel: one Jaqyn Telegram + WhatsApp number in app footer + landing + onboarding pack | →07 §6 [IMPORTANT] | 1 hr | Test it receives messages |
| T-3 | Aug 1 | Write and publish FAQ page (RU-first, 10 canned answers from →07 §6). Link from app menu. | →07 §6 [IMPORTANT] | 2 hr | Reachable from app before T-0 |
| T-3 | Aug 1 | Prepare operations runbook: how to approve pending business, provision staff seat, issue invoice, toggle paid status, void a wrong stamp | →07 §6 [IMPORTANT] | 1 hr | Founder reference doc |
| T-2 | Aug 2 | Write Telegram announcement copy (3–4 groups), Instagram post and Story copy, WhatsApp network copy (all RU). See §3 for full copy. | →07 §7 / →06 §3 | 2 hr | Drafts ready for T-1 review |
| T-2 | Aug 2 | Refresh demo café account: verify all fake scans/campaigns still look realistic; test on a fresh device. | →05 §4 | 30 min | Zero broken states |
| T-2 | Aug 2 | Verify business dashboard + /admin/analytics/ render correctly with real (non-seed) data — check with any existing business in admin | →07 §8 | 30 min | Day-21 check-in depends on this |
| T-1 | Aug 3 | Final go/no-go review: confirm all 9 [BLOCKER] items checked. If any open: delay T-0 by 3 days, triage. | →07 Launch gate | 1 hr | No exceptions |
| T-1 | Aug 3 | Pre-post first 3 Instagram pieces (Mon Aug 3 posting): wallet-card Reels (Pillar 3), loyalty-math carousel (Pillar 1), founder café photo (Pillar 4). Schedule for Mon/Wed/Fri this week via Instagram native scheduler. | →06 §3 Week 1 | 30 min | Account live before first DM |
| T-1 | Aug 3 | Join 4 Telegram groups (observe only — no posts until Week 3): «кофейни Бишкек предприниматели», «хорека Кыргызстан», «бизнес Бишкек», «баристы Бишкек» | →06 §4 / →04 §2 Ch.3 | 30 min | Presence before announce |
| T-1 | Aug 3 | Follow 20 Bishkek café Instagram accounts; like their last 2–3 posts. Prep the 5 first-wave DM targets (pull from leads DB, note one specific detail per). | →06 §3 / →04 §2 Ch.2 | 45 min | Warm contacts before launch-day DMs |

**T-minus blockers summary (9 items that gate T-0):**

| # | Blocker | Doc ref |
|---|---|---|
| B1 | Prod smoke test: customer email-OTP join path | →07 §1 |
| B2 | Prod smoke test: business + first scan without invite email | →07 §1 |
| B3 | Demo café account built | →07 §1 |
| B4 | `SEED_TEST_USERS=false` verified in prod | →07 §3 |
| B5 | No secrets in repo/commits (secret scan pass) | →07 §3 |
| B6 | No price published on landing page | →07 §5 |
| B7 | Counsel review of privacy + terms | →07 §4 |
| B8 | KG personal-data operator notification filed | →07 §4 |
| B9 | Postgres backup restore re-tested | →07 §2 |

---

### Launch Day — 2026-08-04 (Tuesday), Hour by Hour

**Goal for launch day: first real café demo done, first business in trial, first real scan logged.**

| Time (KGS UTC+6) | Activity | Est. time | Notes |
|---|---|---|---|
| 08:30 | Check Railway dashboard: all 6 services green. Check Sentry: no overnight errors. Check Plausible: baseline traffic. | 15 min | Go/no-go reconfirmation |
| 08:45 | Confirm demo appointment with first café (booked T-2 or T-3). Bring: phone with demo account open, printed QR tent card, 1 pitch PDF. | 10 min | Travel buffer before the meeting |
| 09:00 | **Post Telegram announcement to 3–4 café owner groups.** Exact copy per §3. No price, no link cold-drop — post the message, offer to DM for a demo. | 15 min | First public mention of Jaqyn |
| 09:15 | **Post Instagram feed post** (wallet-card Reels or group-campaign Reels, whichever is most polished) with founding-offer caption. Add Story with founding counter "осталось [N] из 25". | 15 min | Instagram presence live |
| 09:30 | Send founding announcement to personal WhatsApp/Telegram network (friends, acquaintances, anyone who knows café owners). Exact copy per §3. | 15 min | Personal network — warmest possible audience |
| 10:00–11:30 | **First café demo (in-person).** 15-min demo → close → 45-min onboarding if they say yes. Checklist: business profile, first loyalty program, first group campaign, staff scan training, QR tent placed, day-21 check-in booked. | 90 min total | The day's most important task |
| 11:30 | Debrief immediately after demo: what objections came up? What moment landed best? Note in pipeline sheet. | 15 min | Improve script for demo #2 |
| 12:00 | Send 5 cold DMs to the first-wave café targets prepared T-1 (WhatsApp or Instagram per channel noted in leads DB). Log each in pipeline sheet. | 45 min | Day-1 outreach |
| 13:00–14:00 | Lunch. Check Instagram DMs + Telegram group replies (respond within the hour to any inbound). | — | |
| 14:00 | Check if any DM-contacted café replied. Send follow-up or book demos for later this week. | 30 min | Keep momentum |
| 14:30 | If first café onboarded: verify their data appears in /admin/analytics/ and their business dashboard. Log first real scan as the day's milestone. | 15 min | Proof-point for the week |
| 15:00 | If 2nd demo can be booked today (inbound from Telegram or DM): do it. Otherwise defer to Wed/Thu this week. | flex | Target 2 demos in week 1 |
| 17:00 | Post one Instagram Story update: "День первый. Первая кофейня — онлайн." (no name; just the milestone). Humanizes the launch for the social audience. | 10 min | Founder-voice Pillar 4 |
| 18:00 | End-of-day check: update pipeline sheet. How many DMs sent, replies, demos booked. Log against week-1 targets (→07 §8). | 15 min | Baseline for week-1 review |
| 20:00 | Final check: Sentry / Railway still green. Any urgent support messages? Reply to any overnight inbound before sleep. | 10 min | |

---

### T+1 to T+7 (2026-08-05 to 2026-08-11)

**Goal: ≥ 2 live businesses, ≥ 5 total demos attempted, week-1 targets met.**

| Day | Date | Activity | Source | Est. time |
|---|---|---|---|---|
| T+1 | Aug 5 | **Wednesday outreach execution (per weekly cadence):** send follow-ups to Day 1 DMs. Send 5 more cold DMs to second wave from leads DB. Check Telegram groups; write 1 helpful reply if relevant thread. | →05 §8 / →04 §6 | 90 min |
| T+1 | Aug 5 | Demo #2 (if booked). Onboarding if demo converts. | →05 §4/§6 | 90 min (if demo) |
| T+2 | Aug 6 | Check scan counts for any live cafés. Pull numbers into pipeline sheet. | →07 §8 | 20 min |
| T+3 | Aug 7 | **Thursday relationship call** to any live founding café (check-in: «Как дела? Всё работает?» — not a sales call). Catch friction early. | →05 §8 / →04 §6 | 30 min |
| T+3 | Aug 7 | Demo #3 if booked, or walk-in cold visit to 2 target cafés from leads DB. Walk in off-peak (10:00–11:30 or 14:00–16:00). | →05 §3(c) | 60 min |
| T+4 | Aug 8 | **Friday weekly review (per cadence):** count DMs sent/replied, demos booked/done, trials started. Log against week-1 targets. If DM→reply < 20%: tweak opening line. Prep next Monday's Instagram post. | →05 §8 / →04 §6 | 60 min |
| T+4 | Aug 8 | Publish Instagram post #2 (loyalty-math carousel «80 из 100 гостей уходят»). | →06 §3 Week 1 | 20 min |
| T+5 | Aug 9 | Weekend: light check of Telegram groups + DM replies only. No active outreach — respect business owners' weekend. | — | 15 min |
| T+6 | Aug 10 | Weekend: draft next week's content (Instagram post #3/4 from content bank). | →06 §7 | 45 min |
| T+7 | Aug 11 | **Week-1 review (Monday):** update pipeline sheet. If ≥ 2 businesses live: proceed. If only 1: diagnose demo script (objection most heard?), don't add channels. Pull dashboard data from live café(s) for proof posts. Confirm week-2 DM batch targets (5 new prospects). | →07 §8 / →04 §6 | 45 min |

---

## 3. Launch Day Distribution — Announcement Copy

**Rule: no price published. Founding rate mentioned in-person/DM only, not in broadcast. (→07 §5 [BLOCKER], →01 risk #4)**

### Channel 1 — Bishkek café-owner Telegram groups (primary broadcast)
*Post once to each of the 3–4 groups. Do not drop a link cold; offer a DM.*

**RU (primary):**
```
Привет всем!

Я Abdulrahman — основатель Jaqyn, делаю это из Бишкека.

Мы запустили программу для кофеен: цифровые штамп-карты и акции
«приведи друзей» — всё с телефона, без кассового оборудования,
без приложения для гостей.

Ищем первые кофейни-партнёры в Бишкеке — работаем вместе руками,
не просто даём доступ и уходим.

Если интересно — напишите мне лично, покажу за 15 минут.
```

**EN note (brief, if needed for mixed-language groups):**
```
Launching Jaqyn — loyalty stamp cards + "bring your friends" campaigns
for Bishkek cafés, phone-only, no hardware. Looking for founding café
partners. DM me if curious — 15-min demo.
```

---

### Channel 2 — Instagram feed post (launch day)

**Caption (RU primary):**
```
День первый.

Jaqyn — это штамп-карты и «приведи друзей» кампании для кофеен Бишкека.
Всё с телефона. Никакого кассового оборудования. Гостю не нужно
скачивать приложение — просто сканирует QR на столике.

Мы запустились сегодня. Работаем с первыми кофейнями напрямую.

Если вы владелец кофейни — напишите в директ, покажу как это
выглядит у вас на практике.

30 дней бесплатно. Ссылка в профиле.

#кофейнябишкек #бишкеккафе #программалояльности #бишкекбизнес
#малыйбизнесбишкек #кыргызстанбизнес #лояльностьклиентов
```

**Instagram Story (same day):**
```
Slide 1: «Jaqyn запустился. День 1.»
Slide 2: «Ищем первые кофейни Бишкека.»
         «Покажем всё за 15 минут.»
         «→ Напишите нам в директ»
Slide 3: «Осталось [N] мест из 25 в программе первых кофеен.»
         [No price — just scarcity signal]
```

---

### Channel 3 — Personal WhatsApp/Telegram network

*Voice message ~40 seconds or text. Sent to personal contacts who know café owners.*

**RU:**
```
Привет! Запустил сегодня Jaqyn — сервис для кофеен Бишкека.
Штамп-карты и акции «приведи друзей» — через телефон, без
оборудования. Если знаешь кого-то, кто держит кофейню или кафе —
скинь им мой контакт или перешли это сообщение. Я покажу им за
15 минут, сам приеду. Спасибо!
```

**EN note:**
```
Just launched Jaqyn — digital loyalty for Bishkek cafés.
If you know any café owners here, please pass on my contact.
15-minute demo, I come to them. Thanks!
```

---

### Channel 4 — 2GIS profile update

*Not a launch announcement, but a same-day operational task:*
- Verify jaqyn.kg appears correctly in 2GIS business search if it's listed.
- Update any Jaqyn business profile on 2GIS (category: "программное обеспечение" or "маркетинг") with the current website URL, description, and contact.
- Not a paid 2GIS ad channel (→04 §1, low priority); this is baseline hygiene.

---

### Channel 5 — Local business media/communities

*Not for launch day — month 3+ per →04 §1.* Hold until case study is published (KG business press: akipress, 24.kg business section, delo.kg will run a story once there is a real owner testimonial + numbers). Note for future: no announcement here until a case study with real numbers exists.

---

## 4. First 90 Days Roadmap

### Weeks 1–2: Proving one end-to-end cycle

**Goal:** ≥ 2 live cafés, first real scan + group campaign cycle complete, demo script iterated once.

| Activity | Cadence | Source |
|---|---|---|
| Outreach: 5 DMs/week from leads DB | Mon prep, Wed send | →05 §8 |
| Live demos: target 1–2/week | As booked | →05 §4 |
| Onboarding sessions: ~45 min, on-site, immediately after demo converts | As booked | →05 §6 |
| Instagram: 1 post/week (weeks 1–2 calendar items) | Mon/Thu | →06 §3 |
| Telegram groups: observe and learn vocabulary; no posts until week 3 | Daily 10 min | →06 §4 |
| Thursday relationship call to any live café | Thu | →05 §8 |
| Friday pipeline review: DM→reply rate, demo→trial rate | Fri | →05 §8 |
| Week-1 metrics check (→07 §8): demos ≥2, businesses live 1–2, ≥1 real scan, ≥3 customer joins | End of week 1 | →07 §8 |

**Feedback loop (week 1–2):** after each demo, note the top objection heard. If the same objection appears in 2 of the first 3 demos, update the demo script before demo #4. (→04 §2 leading indicator: if <3 live businesses at week 4, diagnose the demo script — not the channel.) (→05 §7: if demo→trial < 60%, the demo is not landing.)

**Exit criteria:**
- ≥ 1 café with ≥ 10 real scans + 1 completed group campaign.
- Demo script iterated at least once based on real objections heard.
- Pipeline sheet has ≥ 10 leads at "Contacted" or later stage.

---

### Weeks 3–6: Double down on working channel, first case study

**Goal:** ≥ 5 live cafés, day-21 check-ins for weeks 1–2 onboards, first case study drafted, founding-rate conversions begin.

| Activity | Cadence | Source |
|---|---|---|
| Outreach: 5 DMs/week, continue | Mon prep, Wed send | →05 §8 |
| Day-21 check-ins for first onboarded cafés: pull dashboard with owner, convert on proof | As scheduled | →03 §3 / →05 §6 |
| Week 3: first Telegram group reply (answer a genuine question, no promo) | Week 3 | →06 §4 |
| Instagram: shift pillar mix toward Pillar 2 (proof) as first dashboard data arrives | Weekly | →06 §2 |
| Content piece #7 («Как кофейня запустила кампанию "приведи двух друзей"»): draft the case-study template now; fill with real data from first day-21 check-in | Week 4 | →04 §3 |
| First founding-rate invoice: if day-21 check-in converts, issue manual счёт, toggle active in admin | Week 3–4 | →03 §4 / →05 §6 |
| Instagram Reels boost: first paid boost ($15–20) after ≥8 posts live and ≥1 founding café data point to show | Week 5 | →06 §4 |
| Referral ask: at every day-21 check-in that converts, ask owner for a Telegram group share | Week 4+ | →04 §2 Ch.3 |
| Month-1 targets review (→07 §8): ≥3 live, ≥40 scans/active café, ≥5 group completions, ≥10 repeat visitors/active café | End of week 4 | →07 §8 |

**Double-down decision (week 5–6):** identify which channel produced the most demos. If Telegram group seeding is producing inbound: increase posting frequency in the highest-activity group. If Instagram DMs are converting faster: batch more DM sending on Wednesday. If walk-ins outperform digital: add a Thursday walk-in block. Run only one experiment at a time — change one variable.

**Exit criteria:**
- ≥ 5 live cafés on a group campaign.
- ≥ 1 founding-rate paying customer (invoice issued + paid).
- First case study draft complete (waiting only on day-21 data to fill in numbers).
- Founding counter updated on landing page with real remaining spots.

---

### Weeks 7–12: Repeatable acquisition, referral loop, pricing validation

**Goal:** ≥ 8 founding-rate paying customers, ≥ 15 demos total, 1 published case study, referral pipeline activated. (→04 §8 "strong outcome" criteria)

| Activity | Cadence | Source |
|---|---|---|
| Outreach: 5 DMs/week; referral asks at every paying conversion | Continuous | →05 §8 |
| Month-2 relationship calls: rotate through all live founding cafés | Thu weekly | →05 §8 |
| Formally open referral program: «Приведите кофейню — месяц бесплатно» (manual credit, no code needed) | Week 7 | →04 §1 (month 2+) |
| Publish first case study as a blog post + Instagram carousel (piece #7) with real numbers (scans, campaign joins, repeat visits) | Week 8 (after day-21 data) | →04 §3 |
| Add case-study quote + dashboard screenshot to landing page social-proof strip | Same week as publish | →04 §4 P0 |
| Instagram: first micro-influencer collaboration (Bishkek food blogger, 5k–15k followers, barter: free coffee at a founding café + product access) | Month 2–3 | →04 §5 / →06 §4 |
| Barista community event / Bishkek coffee weekend: table + live demo | Month 2–3 if event scheduled | →04 §1 |
| Month-2 budget check: if ≥3 live businesses + working demo script, step up to small budget tier ($100/mo: 1 Instagram boost + better table tents) | Week 7 | →04 §5 |
| **Pricing validation:** at day-21 check-in with each paying customer, ask two questions: (1) What almost stopped you from starting? (2) If the price goes to [990/1,990 KGS standard], would you renew? Log all answers. | Every paying conversion | →03 §4 (WTP validation) |
| **Billing P0 planning:** begin the billing build checklist (Plan/Subscription model, entitlement checks, trial-expiry enforcement) to target self-serve readiness by month 3–4. Do not rush billing before founding cohort is proven. | Week 9+ | →03 §7 P0 |
| **SEO slow-burn seed:** draft first Russian-language blog post «программа лояльности кофейня Бишкек» | Week 10+ | →04 §1 (month 3+) |
| **Partnership conversations:** begin DMs to coffee equipment dealers + Poster/iiko resellers once 5+ founding cafés are live | Week 9+ | →04 §1 (month 3+) |
| Day-90 review: demos completed, live businesses, founding-rate conversions, MRR, case studies published. If ≥8 paying: self-serve + referral program formal launch. If <5 paying: diagnose demo-to-trial conversion rate — do NOT add channels. | End of week 12 | →04 §8 |

**Exit criteria for Stage 3 (self-serve) gate:**
- 8+ founding-rate paying customers.
- 1 published case study with real numbers.
- Demo script proven (demo→trial ≥ 60%).
- SMS/OTP provider chosen + integrated (B01).
- Billing P0 built (Plan/Subscription model + entitlement checks).

---

## 5. Feedback Machine

### Collection channels

| Channel | When | What to capture | Source |
|---|---|---|---|
| **Founder WhatsApp/Telegram (support number)** | Always-on | Bug reports, "staff can't scan," "customer can't join," confusing UX, broken flow | →07 §6 |
| **Day-21 check-in call (on-site or video)** | 21 days after each onboarding | Dashboard review with owner: what worked, what didn't, objections to paying, any friction they tolerated without telling you | →05 §6 |
| **Thursday relationship call** (1 live café per week, rotating) | Weekly | Scan-count drop = churn signal. Staff turnover = onboarding friction. Owner complaints = product gaps. Quotes = content + objection handling | →05 §8 |
| **Post-demo debrief (self-note)** | After every demo | Top objection heard, which demo moment landed, what they asked that wasn't in the pitch | →04 §2 leading indicator |
| **Pipeline sheet "Notes" column** | After every touchpoint | Specific objections, reasons for "not now," stated reasons for churn | →05 §7 |
| **Instagram DM replies + Telegram group threads** | Check Mon/Wed/Fri | Owner language: what pain they describe, what questions they ask before agreeing to demo | →06 §6 |

### Tagging scheme (7 tags, applied in pipeline sheet Notes + a running Issues log)

| Tag | Meaning | Example |
|---|---|---|
| `scan-friction` | Staff not scanning, camera issues, or "too many steps" | "Barista forgot to scan 3 customers today" |
| `join-friction` | Customers not joining the loyalty program | "Only 2 out of 20 scanned the QR" |
| `onboarding-gap` | Something founder couldn't explain or owner couldn't set up solo | "They didn't know how to create a second campaign" |
| `churn-signal` | Scan count dropped week-over-week without explanation | Dashboard alert: café X had 12 scans week 1, 2 scans week 2 |
| `feature-request` | Owner explicitly asked for something that doesn't exist | "Can I see which specific customers visited on which day?" |
| `competitor-mention` | Owner mentioned a specific alternative they're considering | "My friend uses a Telegram bot and likes it" |
| `proof-moment` | Strong positive signal (owner excited, shared on their Instagram, brought up unprompted) | "Told me she had 8 groups complete in one week" |

### Weekly review ritual (Friday, 20 min)

1. Scan pipeline sheet Notes for all new entries since last Friday. Apply tags.
2. Count tags: is `scan-friction` appearing in ≥ 2 cafés? That is a product issue, not a coincidence — log it as a fix item.
3. Pull one `proof-moment` to turn into content (Instagram caption or Telegram post for next week).
4. Identify if any `churn-signal` requires a Thursday call this coming week.
5. If `feature-request` appears ≥ 3 times with the same ask: add to backlog, note the frequency.

### Fix-now vs backlog criteria

| Fix-now (this week) | Backlog (scheduled) |
|---|---|
| A `scan-friction` or `join-friction` issue affecting ≥ 2 active cafés simultaneously | A `feature-request` that only 1 owner has mentioned |
| Any prod error in Sentry that affects the core scan → reward flow | UI improvements in non-critical screens |
| A support message that implies data loss or a wrong stamp that can't be manually corrected | New campaign types or analytics improvements |
| A broken empty state on a screen owners actually see | Performance improvements not causing visible lag |
| Any security/data issue regardless of frequency | Kyrgyz language localization |

---

## 6. Risk Register

### Risk 1 — Cafés sign up but staff don't scan consistently

**Likelihood:** High. The most common failure mode in staff-operated loyalty programs. Staff turnover, busy rushes, and "we forgot to ask" erode scan counts within weeks.

**Early signal:** scan count drops week-over-week (`churn-signal` tag) without owner reporting a slow week.

**Pre-planned response:**
- At onboarding: set the explicit rule with the owner — every guest at the counter is asked once «У вас есть наша карточка?» Agree on it as a script, not a suggestion. (→05 §6)
- At the first sign of low scans (day-21 check-in or Thursday call): diagnose together — "Are staff asking every guest? Let me come in for 20 minutes and show the team the scan flow again."
- Offer to personally re-train one staff member. "They'll teach the rest." (→05 Obj. 3 handling)
- If staff turnover is the cause: walk the owner through re-adding a new staff seat in admin. Make this the first item in the operations runbook.

---

### Risk 2 — Customers join once but don't return (loyalty habit doesn't form)

**Likelihood:** Medium. Particularly affects cafés with low daily traffic or a single visit type (event venues, seasonal spots).

**Early signal:** repeat-visitor count (≥ 2 scans, same customer) below 10 at 30 days for an active café. (→05 §6 pilot success bar)

**Pre-planned response:**
- At the day-21 check-in: if repeat-visitor count is low but scan count is OK, the loyalty reward structure is too far out (e.g., 15 stamps for a free coffee). Ask the owner to lower the threshold to 8 or 10 — visible progress hooks the habit faster.
- If the group campaign has zero completions: the campaign window is probably too long or the reward is too weak. Shorten the window to 7 days and increase the reward value.
- Disqualification signal: if a café does < 30 covers/day, the loyalty card can't accumulate enough scans in 30 days to show ROI. Flag these as "extend trial to 60 days manually" — the docs explicitly permit this for slow-ROI cases. (→03 §3 fallback)

---

### Risk 3 — Owner churn after novelty wears off (weeks 4–6 abandonment)

**Likelihood:** Medium. After the initial excitement of setup, owners forget to promote the QR, staff get inconsistent, and the dashboard feels like "nothing new."

**Early signal:** owner stops responding to Thursday relationship calls; scan count flat for 2 consecutive weeks with no reported problem.

**Pre-planned response:**
- The Thursday relationship call (→05 §8) exists precisely to catch this before the owner goes silent. Do not skip it.
- At week 4–5 for any live café: proactively show them one new number they haven't seen yet (e.g., "You have 8 repeat visitors now — here are their names"). Make the dashboard feel like a newspaper, not a scoreboard.
- Introduce the second feature at week 5–6: if they only ran a stamp card, propose a group campaign now ("Your next step — let's set up one 'bring friends' campaign. I'll help you run it this Thursday."). New features reset the novelty clock.
- If owner churns despite this: log the stated reason in the pipeline sheet. If the same reason appears for 2+ churned cafés: it is a product positioning issue, not an owner attitude issue.

---

### Risk 4 — Founder time collapses under support load

**Likelihood:** Medium. With 3+ live cafés, inbound support requests (staff can't scan, customer lost their phone, wrong stamp) can consume the time budgeted for outreach.

**Early signal:** > 3 support messages per day; outreach DMs sent per week drops below 5; demos booked per week drops to 0.

**Pre-planned response:**
- The FAQ page (→07 §6) and canned responses (10 drafted pre-launch) deflect the most common tier-1 questions before they reach the founder. Publish the FAQ link proactively at every onboarding.
- The operations runbook (→07 §6) lets the founder resolve common issues (wrong stamp, add staff seat, void a voucher) in under 5 minutes each without re-diagnosing every time.
- Time budget: per →05 §8, the weekly time budget is ~9 hours split ~60/40 between active selling and supporting live customers. If support exceeds 4 hours/week with <5 live cafés, the issue is not scale — it is a FAQ gap. Add the question to the FAQ page; it will reduce recurrence.
- Hard constraint: do not let support bleed into Tuesday morning and Thursday afternoon coding blocks (→05 §8 "protect these slots"). The billing build and SMS integration are the path to reducing founder-hour dependency; delaying coding delays the escape from founder-led.

---

### Risk 5 — Pilot cafés demand features before converting to paid

**Likelihood:** Medium. "I'll pay when you add [X]" is a negotiation tactic and sometimes a real need. The risk is a feature negotiation cycle that delays conversion indefinitely.

**Early signal:** at day-21 check-in, a converting owner says "I would pay but I need [feature]." If the feature is on the billing P0 checklist, it's a genuine blocker. If it's novel, it's a negotiation.

**Pre-planned response:**
- Distinguish: is the requested feature something they need to *prove* the existing product works, or something they want *after* paying? Loyalty habit proof (scans, repeat visits, group completions) does not require new features — it requires time and the features already shipped.
- Honest response: "The feature you're describing is on the roadmap. The core — stamp cards, group campaigns, dashboard — is live today and is what the trial is proving out. Let me show you the numbers from the trial, and we can talk about the roadmap after you decide."
- Do not over-promise a roadmap to close a conversion. (→05 §6: set success criteria at onboarding start, not at day 21.)
- If the same feature request appears from ≥ 3 independent cafés: it may be a real gap in the founding-cohort value proposition. Log it with `feature-request` tag, assess whether it gates the founding-cohort conversion cycle, and prioritize accordingly — but only *after* the request appears 3+ times, not on first mention.

---

## 7. Launch Dashboard Spec

**Reviewed daily in week 1. Reviewed weekly after week 1.**

### How to view these numbers today

| Number | Where | Tool | Frequency (week 1 / post week 1) |
|---|---|---|---|
| **Total scans (all cafés)** | `/admin/analytics/` or ScanLog query | Django admin — `apps/reporting/analytics.py` | Daily / Weekly |
| **Scans per active café (week)** | Business dashboard: `/api/business/dashboard/` | Django admin per-business view | Daily / Weekly |
| **Group campaign completions (all cafés)** | `/api/business/campaigns/<id>/analytics/` | Django admin per-campaign | Daily / Weekly |
| **Repeat visitors (≥ 2 scans, same customer, per café)** | Customer list: `/api/business/customers/` | Django admin | Daily / Weekly |
| **Customer joins (loyalty enrollments)** | `/admin/analytics/` | Django admin | Daily / Weekly |
| **Active businesses (live, ≥1 real scan)** | Django admin: Business list, filter by status | Django admin | Daily / Weekly |
| **Founding-rate paying customers** | Pipeline sheet + Django admin subscription toggle | Manual (no billing code yet) | Daily / Weekly |
| **Pipeline funnel** (Lead→Contacted→Replied→Demo→Trial→Paying→Churned) | Pipeline sheet (Google Sheets) | Manual | Daily / Weekly |
| **DMs sent this week** | Pipeline sheet | Manual | Weekly |
| **DM→reply rate** | Pipeline sheet | Manual (replies / DMs sent) | Weekly |
| **Demo→trial rate** | Pipeline sheet | Manual | Weekly |
| **Trial→paying rate** | Pipeline sheet | Manual | Weekly |
| **Instagram DMs initiated** | Instagram Insights | Instagram | Weekly |
| **Demos from social** | Pipeline sheet (source column) | Manual | Weekly |
| **Website traffic (jaqyn.kg)** | Plausible dashboard | Plausible | Weekly |
| **Uptime** | UptimeRobot/BetterStack | External monitor | Daily |
| **Sentry error count** | Sentry dashboard | Sentry | Daily |

---

### Week-1 daily dashboard (check every morning)

| Metric | Target (week 1) | Source |
|---|---|---|
| Total real scans (non-demo) | ≥ 1 by T+0, ≥ 10 by T+7 | ScanLog / admin |
| Active businesses live | ≥ 1 by T+0, ≥ 2 by T+7 | Admin Business list |
| Customer loyalty joins | ≥ 3 by T+7 | Admin analytics |
| Sentry new errors | 0 critical, any error investigated same day | Sentry |
| Uptime | 100% | UptimeRobot |

---

### Weekly dashboard (post week 1 — check every Monday)

| Metric | Week-4 target | Week-12 target | Source |
|---|---|---|---|
| Active businesses on group campaign | ≥ 3 | ≥ 15 | Admin / campaign analytics |
| Total scans (rolling 7-day) | ≥ 40/active café | ≥ 40/active café | ScanLog |
| Group campaign completions (rolling 7-day) | ≥ 5 groups | ≥ 5 groups/active café | Campaign analytics |
| Repeat visitors (≥ 2 scans) per active café | ≥ 10 | ≥ 10 | Customer list / admin |
| Founding-rate paying customers | 0–2 | ≥ 8 | Pipeline sheet + admin |
| Pipeline: DM→reply rate | ≥ 20% | ≥ 20% | Pipeline sheet |
| Pipeline: demo→trial rate | ≥ 60% | ≥ 60% | Pipeline sheet |
| Demos from social (Instagram+Telegram) | ≥ 1 | ≥ 2/month | Pipeline sheet |
| MRR (founding rate) | ~690–1,490 KGS | ≥ 5,520–11,920 KGS | Pipeline sheet |
| Days uptime (rolling 30) | ≥ 29/30 | ≥ 29/30 | UptimeRobot |

**MRR context:** 8 founding-rate Grow plans (690 KGS/mo) = 5,520 KGS/mo (~$63). At standard Grow rate (990 KGS/mo): 7,920 KGS/mo. This is validation-stage revenue, not scale — the unit economics are healthy (→03 §6 >85% gross margin) and the binding constraint is founder-hour throughput, not revenue potential. (→02 §1.2 / →03 §6)

---

### Decision triggers

| Dashboard signal | Action |
|---|---|
| Scans/café < 10 at day 14 | Thursday call to that café: is staff scanning consistently? |
| Group completions = 0 at day 21 | Shorten campaign window; increase reward value; check if campaign was shared |
| DM→reply rate < 20% two weeks running | Rewrite the opening DM line (personalize more, shorten) |
| Demo→trial rate < 60% | Identify most-heard objection; adjust demo script for that specific objection |
| Trial→paying rate < 60% | Day-21 check-in quality issue — are you showing the owner their own real data? |
| Any Sentry critical error | Fix before next outreach — a broken prod path undermines every demo |
| Uptime event > 15 min during business hours | Post-mortem in DEPLOY.md; adjust Railway config or add redundancy |
