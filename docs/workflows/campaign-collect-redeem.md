---
title: Campaign Collect & Redeem Workflow
service: cross-cutting
type: workflow
status: active
last_reviewed: 2026-07-02
---

# Campaign Collect & Redeem

## Summary

The core customer loyalty loop for **campaigns**: discover an active campaign,
join it, accumulate progress when staff scans the customer's personal QR at the
till, and — once the campaign completes — present the issued voucher for staff to
redeem. Triggered by a customer; the progress and redeem steps are driven by staff
at the point of sale. (The scan side is detailed in
[staff-scan-unified](staff-scan-unified.md); this doc is the customer's view of
the loop.)

## Layers & services involved

- **Frontend:** `/campaigns`, `/campaigns/[id]`, `/collect`, `/rewards`,
  `/campaign-wallet`, `/campaign-wallet/[id]`, `/qr`; API in
  `frontend/packages/api/src/customer/api.ts`; live polling via `useRewards`
  (`refetchInterval: 3000`).
- **Backend:** `campaigns/views/customer_views.py` + `views/staff_views.py`;
  services `progress.py` (`CampaignProgressService`), `eligibility.py`
  (`CampaignEligibilityService`), `rewards.py` (`CampaignRewardService`),
  `scanner.py` (`StaffScannerService`).
- **Models:** `Campaign`, `CampaignParticipant`, `CampaignAction`,
  `CampaignRewardVoucher`.
- **Queues:** Celery `notify_*` (visit/reward-unlocked), `expire_campaign_vouchers`.

## Step-by-step

1. **Discover.** `/campaigns` → `GET /api/customer/campaigns/`
   (`customer/api.ts:231`, paginated) and `/campaigns/feed/`
   (`customer/api.ts:237`, `{followed, discover}`). Detail at
   `GET /api/customer/campaigns/<id>/` (`customer/api.ts:239`).
2. **Join.** `POST /api/customer/campaigns/<id>/join/` (`customer/api.ts:244`) →
   creates a `CampaignParticipant` via `CampaignProgressService`. **Out:** updated
   participant + progress.
3. **Show personal QR.** `/collect` (and `/qr`) render the customer's permanent
   personal QR from `GET /api/customer/qr/` (`customer/api.ts:157`). The screen
   polls progress while open.
4. **Staff advances it.** Staff scans the QR →
   `POST /api/staff/campaigns/scan-customer/` (`staff/api.ts:59`) lists eligible
   campaigns, then `POST /api/staff/campaigns/visit/` (`staff/api.ts:97`) →
   `UnifiedConfirmVisitView` → `CampaignProgressService` records a `CampaignAction`
   (asks for amount on spend programs). When the rule completes,
   `CampaignRewardService` mints a `CampaignRewardVoucher`.
5. **See the reward.** Customer's `/rewards` and `/campaign-wallet`
   (`GET /api/customer/campaign-wallet/`, `customer/api.ts:248`) show the unlocked
   voucher; the open screen reflects it within the 3s poll. Detail via
   `GET /api/customer/campaign-vouchers/<id>/` (`customer/api.ts:250`).
6. **Choose an item (if needed).** For item-choice rewards,
   `GET /api/customer/campaigns/<id>/catalog/` (`customer/api.ts:255`) then
   `POST /api/customer/campaign-vouchers/<id>/select-item/` (`customer/api.ts:259`).
7. **Present voucher.** `POST /api/customer/campaign-vouchers/<id>/present/`
   (`customer/api.ts:252`) puts the voucher into a presentable/redeemable state and
   renders its QR.
8. **Staff redeems.** Two paths, both end at the same endpoint:
   - **From customer scan (preferred, no second scan):** when the customer scan
     response includes `active_vouchers`, the chooser sheet pins a redeem entry.
     Staff taps it → `POST /api/staff/campaigns/redeem-voucher/` with `voucher_id`
     (`staff/api.ts:137`) — no second QR scan needed.
   - **From voucher QR scan:** customer presents the voucher QR;
     `POST /api/staff/campaigns/redeem-voucher/` with `token` or `voucher_id`.
   Either path → `CampaignRewardService` marks the voucher redeemed. Customer's
   wallet updates on next poll.

## Mermaid

```mermaid
sequenceDiagram
    actor C as Customer
    actor S as Staff
    participant FE as Next app
    participant CAPI as customer_views
    participant SAPI as staff_views
    participant SVC as campaigns/services

    C->>FE: browse /campaigns
    FE->>CAPI: GET /api/customer/campaigns/
    C->>FE: join
    FE->>CAPI: POST /api/customer/campaigns/{id}/join/
    C->>FE: open /collect (personal QR)
    S->>SAPI: POST /api/staff/campaigns/scan-customer/
    S->>SAPI: POST /api/staff/campaigns/visit/
    SAPI->>SVC: ProgressService.record + RewardService.maybe_issue
    SVC-->>SAPI: progress / voucher
    Note over FE,CAPI: /rewards polls every 3s -> shows unlocked voucher
    alt redeem from customer scan (preferred)
        Note over S,SAPI: active_vouchers in scan response; staff taps redeem
        S->>SAPI: POST /api/staff/campaigns/redeem-voucher/ {voucher_id}
    else redeem from voucher QR
        C->>FE: present voucher QR
        S->>SAPI: POST /api/staff/campaigns/redeem-voucher/ {token or voucher_id}
    end
    SAPI->>SVC: RewardService.redeem
    SVC-->>FE: wallet reflects redeemed (next poll)
```

## Entry points & exit conditions

- **Entry:** `/campaigns` discovery (or a `/c/[id]` public campaign link).
- **Success:** voucher issued on completion, presented, and redeemed at POS.
- **Failure:** ineligible scan → `CampaignEligibilityService` returns a typed
  `IneligibilityReason` (e.g. already-counted, not-joined, expired); voucher expiry
  via `expire_campaign_vouchers` closes the loop unredeemed.

## Gaps

- ~~**Two-scan round trip:**~~ **Resolved.** The customer scan response now
  includes `active_vouchers`; the chooser sheet offers a redeem action at the top,
  so collect and redeem are one scan (see step 8 and
  [staff-scan-unified](staff-scan-unified.md)).
- 🔴 **Dead redeem path:** legacy `staffApi.redeem`/`redeemManual`
  (`staff/api.ts:51,53`) point at non-existent `/api/staff/redeem/*`. The live
  redeem uses `/api/staff/campaigns/redeem-voucher/`. **Fix:** delete the dead
  methods/hooks (see [staff-scan-unified](staff-scan-unified.md#gaps)).
