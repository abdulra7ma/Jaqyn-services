---
title: "Design Brief: Staff-Scan Loyalty Flow (Jaqyn)"
service: shared
type: contract
status: active
last_reviewed: 2026-06-30
---
# Design Brief: Staff-Scan Loyalty Flow (Jaqyn)

## Goal
Replace the current two-sided loyalty flow with a single **staff-scans-customer** interaction. One scan handles earning a stamp, completing a card, and redeeming a reward. Design the screens and states for both the **staff app** and the **customer app**.

## The two users
- **Customer** — shows a permanent personal QR code. Their entire job is "open app, show QR."
- **Staff** — points their device camera at the customer's QR. Their entire job is "scan, glance at result, occasionally tap once."

## Reward types (drives what the scan does)
- **Stamp / Visit** — count-based ("buy 6, get 1 free"). One scan = +1. Most common case.
- **Spend** — money-based ("spend 500 SAR, get reward"). Scan must capture a purchase amount.
- Assume **one active earn-program per business at a time** (no program-picker needed).

---

## Customer app — screens to design

**1. "My QR" screen** (primary, always one tap away)
- Large, scannable QR code, centered, high contrast.
- Customer name + avatar above it.
- Subtext: "Show this to earn rewards."
- Should work at arm's length in a café — QR must stay large even on small phones, screen brightness ideally boosts on open.

**2. Reward progress (post-scan live update)**
- After staff scans, the customer's app should reflect the new state (push/poll): e.g. stamp card animates from 3/6 → 4/6.
- A "card complete" celebratory state when the final stamp lands: "🎁 Your reward is ready!"

**3. Reward-ready / claim moment**
- When a card completes, customer sees the reward they've unlocked (e.g. "Free coffee") so they know what to ask for. The actual redeem is confirmed on the *staff* device, but the customer should *see* it happening.

## Staff app — screens & states to design

**1. Scanner screen (default, always-on camera)**
- Live camera viewfinder filling most of the screen, with a QR target frame.
- Continuous scanning — no "tap to scan" button. Designed for back-to-back customers ("next, next").
- Small header: business name + logged-in staff name.

**2. Result states** — these appear as overlays/cards on top of (or sliding over) the scanner, then auto-dismiss so the next customer can be scanned. Design each:

| State | Trigger | Content | Action |
|--|--|--|--|
| **Awarded** ✓ | stamp/visit scan | Customer name + "✓ Stamp added · 4 of 6" + progress ring/bar | none — auto-dismiss ~2s |
| **Enter amount** | spend-type program | small popup: numeric keypad, "Purchase amount", currency = SAR | staff types total → "Add" → returns to Awarded state |
| **Reward ready** 🎁 | a scan that completes the card | Customer name + "Reward unlocked: [Free coffee]" + big **Confirm & give reward** button | staff taps Confirm → "Redeemed ✓" → auto-dismiss |
| **Already counted** | re-scan within cooldown | gentle "Already added a moment ago" (not an error-red) | dismiss |
| **Error** | wrong business / inactive / invalid QR | red toast with plain message ("This code isn't from your shop") | dismiss |

**3. Confirmation / done feedback**
- Every successful scan needs an unmistakable, fast, glanceable confirmation (color + icon + short text + light haptic/sound cue) so staff don't have to read carefully between customers.

---

## Full interaction flow (all branches)

```
Customer opens app → shows "My QR" screen
        │
Staff scanner (always on) detects QR
        │
   ┌────┴─────────────────────────────────────────┐
   ▼                                               ▼
stamp / visit program                        spend program
award +1 instantly                     popup: "Enter purchase amount"
   │                                     staff types amount → submit
   │                                               │
   └───────────────────┬───────────────────────────┘
                        ▼
              Did this complete the card?
                ┌───────┴────────┐
               no                yes
                ▼                 ▼
       "✓ Stamp added      "🎁 Reward ready: [reward]"
        4 of 6"             staff taps "Confirm & give reward"
        auto-dismiss              → "Redeemed ✓" → auto-dismiss
```

## States & copy guidance
- Staff-side copy is **glanceable, 2–4 words** for the happy path ("Stamp added", "Reward ready", "Redeemed").
- Customer-side copy is **warm and rewarding** ("Nice! 4 of 6", "Your reward's ready 🎉").
- Errors are plain-language, never codes ("This QR isn't from your shop" — not "WRONG_BUSINESS").

## Edge cases to show in designs
- Customer card already complete but not yet redeemed → scan goes straight to **Reward ready**.
- Double-scan / accidental re-scan → **Already counted** (friendly, not error).
- Business has no active program / inactive account → clear staff message.
- Spend amount entry: invalid/empty amount handling, currency formatting (SAR), large-number keypad.
- Poor lighting / camera permission denied → scanner empty state + "Enable camera."

## Visual system (match existing Jaqyn brand)
- **Palette:** warm terracotta + cream (existing Jaqyn tokens). Success = warm green; errors = muted red, not alarming.
- Rounded, friendly, generous spacing. Mobile-first, one-handed reach (primary actions near the bottom).
- The Confirm button on "Reward ready" is the single most prominent CTA in the staff app — make it large and bottom-anchored.

---

## Out of scope for the design agent
- Backend rewrite (new `/api/staff/collect/` endpoint, dropping approval codes) is a separate task.
- If a business can run a stamp card *and* a spend program at once, the design needs a program-picker state on scan. Current assumption: one active earn-program per business.
