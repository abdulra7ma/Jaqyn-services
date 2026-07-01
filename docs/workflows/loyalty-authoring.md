---
title: Loyalty Authoring Workflow
service: cross-cutting
type: workflow
status: active
last_reviewed: 2026-06-30
---

# Loyalty Authoring

## Summary

The owner side of loyalty: create and manage loyalty programs and run their
lifecycle (pause / activate / archive). A business can run several programs at once
(e.g. points→cashback alongside visits→item). Triggered by a business owner. Clean —
all routes wired.

## Step-by-step

1. **List.** `/business/loyalty` → `GET /api/business/loyalty/programs/`
   (`loyalty/api.ts:17`).
2. **Create.** `/business/loyalty/new` → `POST /api/business/loyalty/programs/`
   (`loyalty/api.ts:18`) → `LoyaltyProgramService`. Routes to the new program detail
   (`business/loyalty/new/page.tsx:388`).
3. **Edit.** `/business/loyalty/[id]` →
   `GET`/`PATCH /api/business/loyalty/programs/<id>/` (`loyalty/api.ts:19,20`).
4. **Lifecycle.** `POST /api/business/loyalty/programs/<id>/<action>/`
   (`loyalty/api.ts:21`) with `action ∈ {pause, activate, archive}`.

## Mermaid

```mermaid
sequenceDiagram
    actor O as Owner
    participant FE as /business/loyalty
    participant API as loyalty/business_views
    participant SVC as LoyaltyProgramService
    O->>FE: create program
    FE->>API: POST /api/business/loyalty/programs/
    API->>SVC: create program
    O->>FE: edit / pause / archive
    FE->>API: PATCH or POST /{id}/{action}/
    SVC-->>FE: updated program
```

## Notes

No gaps. Customer enrollment and the earn/redeem loop are in
[loyalty-earn-redeem](loyalty-earn-redeem.md).
