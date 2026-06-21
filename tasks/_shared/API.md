# API Contract

Base: `/api/`. All responses use the envelope in CONVENTIONS.md. Auth via JWT
(Bearer) unless marked public. Permission = which role(s) may call.

Legend: 🔓 public · 👤 customer · 🧑‍💼 staff · 🏪 business_owner/manager · 🛡 admin

---

## Auth  (module 5.1)
```
POST  /api/auth/request-otp/        🔓  body {phone}                 → {request_id, expires_in}
POST  /api/auth/verify-otp/         🔓  body {phone, code}           → {access, refresh, user, is_new}
POST  /api/auth/logout/             👤🧑‍💼🏪🛡 body {refresh}            → ok
GET   /api/auth/me/                 any-auth                         → {user, profile?, business?}
PATCH /api/auth/profile/            👤🏪 body {name,email,birthday,language,marketing_opt_in} → user/profile
```
Rules: OTP rate-limited (Redis) per phone + per IP. OTP 4–6 digits, TTL ~5 min,
max N attempts. Returning user → `is_new=false`.

## Business / Merchant  (module 5.2)
```
POST  /api/business/register/       🏪(owner)  → creates Business(status=pending)
GET   /api/business/me/             🏪         → owner's business
PATCH /api/business/me/             🏪
GET   /api/business/dashboard/      🏪         → metrics (scans, customers, rewards…)
GET   /api/business/qr/             🏪         → merchant_collect QR token + PNG/url
GET   /api/business/customers/      🏪         → masked customer list (privacy §18)
GET   /api/business/reports/        🏪         → report metrics (module 5.12)
```

## Staff  (module 5.3)
```
POST  /api/staff/login/             🔓 body {business_code, pin}     → staff session/JWT
GET   /api/staff/today-code/        🧑‍💼                              → current ApprovalCode
POST  /api/staff/scan/              🧑‍💼 body {token}                 → resolve + verify
POST  /api/staff/redeem/            🧑‍💼 body {code|token}            → redeem reward
POST  /api/staff/redeem/manual-code/🧑‍💼 body {code}
GET   /api/staff/recent-activity/   🧑‍💼
GET   /api/staff/groups/            🧑‍💼                              → active groups @ business
POST  /api/staff/groups/{id}/verify/   🧑‍💼
POST  /api/staff/groups/{id}/redeem/   🧑‍💼
```

## QR Tokens  (module 5.4)
```
GET   /api/qr/{token}/              🔓/👤  → resolve token → {type, business, context}
POST  /api/qr/{token}/collect/     👤 body {approval_code}          → loyalty collect
POST  /api/qr/{token}/check-in/    👤 body {approval_code?, group_id?}
POST  /api/qr/{token}/redeem/      🧑‍💼
```

## Loyalty Rewards  (module 5.5)
```
POST  /api/business/rewards/                 🏪
GET   /api/business/rewards/                 🏪
GET   /api/business/rewards/{id}/            🏪
PATCH /api/business/rewards/{id}/            🏪
POST  /api/business/rewards/{id}/pause/      🏪
POST  /api/business/rewards/{id}/activate/   🏪
GET   /api/customer/rewards/                 👤   → all progress across businesses
GET   /api/customer/rewards/{id}/            👤
POST  /api/customer/rewards/{id}/redeem-request/  👤  → generate redemption code
```

## Approval Code  (module 5.6)
```
GET   /api/staff/today-code/                       🧑‍💼
POST  /api/business/approval-code/regenerate/      🏪
POST  /api/merchant/{business_id}/validate-code/   👤 body {code}
```

## Group Offers  (module 5.7)
```
GET   /api/group-offers/                                   🔓/👤  (active only)
GET   /api/group-offers/{id}/                              🔓/👤
POST  /api/business/group-offers/                         🏪
PATCH /api/business/group-offers/{id}/                    🏪
POST  /api/business/group-offers/{id}/submit-for-approval/🏪
POST  /api/business/group-offers/{id}/pause/              🏪
POST  /api/business/group-offers/{id}/activate/           🏪
```

## Group Deals  (module 5.8)
```
POST  /api/groups/                          👤 body {group_offer, visit_time}
GET   /api/groups/{invite_token}/           🔓/👤
POST  /api/groups/{id}/join/                👤
POST  /api/groups/{id}/leave/               👤
POST  /api/groups/{id}/cancel/              👤(leader)
POST  /api/groups/{id}/check-in/            👤 body {approval_code?}
POST  /api/groups/{id}/redeem/              🧑‍💼
GET   /api/customer/groups/                 👤
```

## Redemption  (module 5.10)
```
POST  /api/staff/redeem/                                    🧑‍💼
POST  /api/staff/redeem/manual-code/                        🧑‍💼
POST  /api/customer/rewards/{id}/generate-redemption-code/  👤
```

## Admin  (module 5.13)
```
GET   /api/admin/businesses/pending/         🛡
POST  /api/admin/businesses/{id}/approve/    🛡
POST  /api/admin/businesses/{id}/reject/     🛡
GET   /api/admin/group-offers/pending/       🛡
POST  /api/admin/group-offers/{id}/approve/  🛡
POST  /api/admin/group-offers/{id}/reject/   🛡
POST  /api/admin/group-offers/{id}/pause/    🛡
GET   /api/admin/scan-logs/                  🛡
GET   /api/admin/redemption-logs/            🛡
POST  /api/admin/manual-adjustment/          🛡  body {customer, program, amount_count, reason}
POST  /api/admin/users/{id}/block/           🛡
POST  /api/admin/businesses/{id}/disable/    🛡
```
MVP note: admin functions can be served by Django Admin first; REST endpoints
above are Phase 5/7 hardening.

## Health
```
GET   /api/health/   🔓  → {status:"ok", db, redis}
```
