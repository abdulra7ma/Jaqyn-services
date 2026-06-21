# Design Brief: Banking Rewards (Rewards Wallet) — Jaqyn

Self-contained — no need to read prior context. Builds on the existing staff-scan loyalty
flow (`docs/staff-scan-flow-design-brief.md`): customers show one personal QR, staff scan it
to award stamps/spend; completing a card unlocks a reward.

## The problem we're fixing
Today a loyalty card dies after one use: fill it → redeem the reward → the card is stuck and
the customer can never earn again. We're changing it so rewards **bank and stack** — a customer
can earn the same reward multiple times, hold several at once, and use them whenever they want.

## Core concept
A completed card mints a **reward voucher** that drops into the customer's **Rewards wallet**.
The card immediately resets and keeps earning. Vouchers accumulate ("2 × Free coffee"). The
customer redeems them one at a time, later, on their own schedule. This is the unifying model
for **every** reward type — once a voucher exists, it banks and redeems the same way regardless
of how it was earned.

## The two users
- **Customer** — earns toward cards, collects reward vouchers in a wallet, presents one to use it.
- **Staff** — scans the customer's personal QR to (a) award progress, or (b) confirm a reward the
  customer chose to redeem.

## Reward types to account for (mix freely in one wallet)
- **Stamp** — "buy 6, get 1 free." Count-based, repeatable. Each full card = one voucher.
- **Visit** — count of visits → reward. Same shape as stamp.
- **Spend** — accumulate money (e.g., 500 SAR) → reward. One big purchase can mint several vouchers.
- **Coupon / Welcome / Birthday** — granted as one-off vouchers (signup gift, birthday treat, a
  coupon). Not earned by repeated scans; they simply appear in the wallet. Design the wallet to
  show a mix: e.g., a stamp reward, a birthday reward, and a welcome gift side by side.

---

## CUSTOMER SCREENS

### 1. Rewards wallet (primary — redesign of the Rewards tab)
Two sections:
- **Ready to use** — banked vouchers. Each row/card: business avatar + name, reward (e.g.
  "Free coffee"), a **×N count badge** when stacked ("×2"), an expiry hint if it expires
  ("Use by 12 Jul"), and a **"Use" / "Redeem"** action. Group identical vouchers into one
  card with the ×N badge; different rewards/businesses are separate cards.
- **In progress** — active cards still filling: stamp track (e.g. ●●●●○○ "4 of 6") or spend
  bar ("320 / 500 SAR"), business + reward name.
- Empty state: friendly "No rewards yet — collect stamps to earn your first."
- Reward types are visually distinguishable but consistent (a stamp reward, a birthday gift 🎂,
  a welcome gift 👋 can coexist — give each a small type cue without breaking the grid).

### 2. Use a reward → "Show this to staff"
Tapping **Use** on a banked voucher opens a redeem screen:
- Big reward badge ("🎁 Free coffee"), business name.
- The customer's **personal QR** (the same QR they always show).
- Copy: "Show this to staff — they'll scan and confirm."
- A **live "Waiting for staff to confirm…" pulse**, and a **countdown** (the reward is
  "presented" for a limited window, e.g. ~2 min, then it just returns to the wallet — design a
  visible timer/expiry so the customer knows).
- Auto-flips to a celebratory **"Redeemed! Enjoy your free coffee"** when staff confirms, then
  returns to the wallet (now showing one fewer of that reward).
- A back/cancel that returns the voucher to the wallet unused.

### 3. Card-completion celebration
When a scan fills a card, the customer's app (My QR / home) shows a transient celebration:
**"🎁 Reward earned! Free coffee added to your rewards"**, and the card visibly resets to 0/6.
Distinguish this ("you earned a reward, it's banked") from actually redeeming it later.

### 4. My QR (mostly unchanged)
Stays the everyday "show to earn" screen. When the customer is actively *presenting a reward to
redeem* (screen #2), it's clearly in "redeem mode" (the reward badge + waiting state), not plain
earn mode — design the distinction so staff and customer both understand which is happening.

---

## STAFF SCREENS (extends the existing dark scanner)

A staff scan of the customer's personal QR now has **two outcomes** depending on whether the
customer has presented a reward:

### A. Normal earn (no reward presented) — existing overlays
- **Stamp added · 4 of 6** / spend progress — as today.
- **NEW: card completed →** "Stamp added · 6 of 6 → 🎁 **Reward earned**" — the voucher is
  banked to the customer's wallet (NOT handed over yet), and the card resets. Make it read as
  "they earned a reward" rather than "give it now." Brief, auto-dismissing.

### B. Redeem (customer presented a reward) — the reward-ready flow
- Scan shows **"Reward ready: Free coffee"** + customer name + big bottom **"Confirm & give
  reward"** + a "Not now" escape.
- Confirm → **"Redeemed"** (reward · customer). That voucher leaves the wallet.
- If the customer has multiple identical rewards, redeeming consumes one; design the confirm so
  it's clear it's one of several if relevant.

Keep the staff scanner's existing look (dark camera, header, program toggle, bottom-sheet
overlays, countdown auto-dismiss). These are additions/relabels, not a redesign.

---

## States & copy
- Wallet stack badge: "×2", "×3".
- "Ready to use" vs "In progress" section headers.
- Reward earned (banked): "Reward earned" / "added to your rewards."
- Redeeming (presented): "Show this to staff", "Waiting for staff to confirm…", timer.
- Redeemed: "Redeemed! Enjoy your free coffee."
- Staff: "Reward earned" (banked) vs "Reward ready" (presented, confirm now) vs "Redeemed."
- Plain language, no codes. Warm, rewarding tone for the customer; glanceable 2–4 words for staff.

## Edge cases to show
- Stacked identical rewards (×N) and how redeeming decrements the count.
- Rewards from multiple businesses in one wallet.
- A reward type mix (stamp + birthday + welcome) in the same wallet.
- Expiring vouchers — expiry hint, and an expired/greyed state.
- Presented reward times out → returns to wallet (no redeem).
- Customer who has BOTH an in-progress card and banked rewards.
- Empty wallet.
- Spend purchase large enough to mint multiple vouchers at once ("+2 rewards earned").

## Visual system (match Jaqyn brand)
Warm terracotta + cream tokens; rounded, friendly, generous spacing; mobile-first, one-handed
reach (primary actions bottom-anchored on mobile). Desktop customer view uses the existing
sidebar + content layout. Success = warm green; gentle, celebratory reward moments (🎁). The
"Confirm & give reward" remains the most prominent CTA on the staff side.

---

## Out of scope for the design agent
Backend (mint+reset logic, spend-loop, wallet endpoint, the "presented voucher" mechanism) and
the coupon/welcome/birthday *grant triggers* are separate engineering tasks. Design the wallet
to accommodate those reward sources, but their earning UIs aren't needed yet.

Assumption to flag if it changes the design: redeeming is **customer-initiated** (customer taps
"Use" → presents personal QR → staff confirms). If staff should instead pick a customer's reward
to redeem from the staff app, the redeem screens shift to the staff side.
