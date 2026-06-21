# Conventions

## Response envelope  (TBD §15)
Success:
```json
{ "success": true, "data": {}, "message": "Operation completed successfully" }
```
Error:
```json
{ "success": false, "error": { "code": "INVALID_APPROVAL_CODE",
  "message": "The approval code is invalid or expired" } }
```
Implement via a DRF custom exception handler + a `Response` wrapper so EVERY view
returns this shape. HTTP status still set correctly (400/401/403/404/409/429).

## Error codes  (use these exact strings)
```
INVALID_OTP            OTP_EXPIRED            BUSINESS_NOT_ACTIVE
INVALID_QR_TOKEN       QR_TOKEN_EXPIRED       INVALID_APPROVAL_CODE
SCAN_LIMIT_REACHED     REWARD_ALREADY_REDEEMED REWARD_EXPIRED
GROUP_FULL             GROUP_NOT_ACTIVE       GROUP_CHECKIN_CLOSED
NOT_GROUP_MEMBER       GROUP_NOT_COMPLETE     WRONG_BUSINESS
PERMISSION_DENIED      RATE_LIMITED           VALIDATION_ERROR
```

## Auth
- JWT (SimpleJWT). Access ~30 min, refresh ~14 days. `logout` blacklists refresh.
- Customer/staff have no password — they authenticate by OTP / business-code+PIN
  and receive JWTs the same way.
- Role checks via DRF permission classes: `IsCustomer`, `IsStaff`, `IsBusinessOwner`,
  `IsAdmin`. Object-level: business-scoped data filtered by `request.user`'s business.

## Permission matrix  (TBD §4.2 — enforce in permission classes + querysets)
| Action | Customer | Staff | Owner | Admin |
|---|:-:|:-:|:-:|:-:|
| Login by phone | ✓ | ✓ | ✓ | ✓ |
| View own rewards | ✓ | ✗ | ✗ | ✓ |
| Scan merchant QR / collect / redeem own | ✓ | ✗ | ✗ | ✓ |
| Verify redemption / verify group | ✗ | ✓ | ✓ | ✓ |
| Create business | ✗ | ✗ | ✓ | ✓ |
| Approve business / offer | ✗ | ✗ | ✗ | ✓ |
| Create reward / group offer | ✗ | ✗ | ✓ | ✓ |
| Create / join group | ✓ | ✗ | ✗ | ✓ |
| View analytics | ✗ | limited | ✓ | ✓ |
| Manual adjust reward | ✗ | ✗ | limited | ✓ |
| Disable users/offers | ✗ | ✗ | ✗ | ✓ |

## Fraud / abuse rules  (TBD §12)
- Phone verification required before earning.
- Limit reward collection per business per customer per day (config, e.g. 1).
- Min interval between repeat scans of same merchant (e.g. 6h).
- Approval code: business-specific, rotates daily, valid_from/valid_to enforced,
  rate-limit failed code attempts (Redis), admin can regenerate/disable.
- Group: check-in only inside window; reward only after required check-ins; reward
  redeemable once; members must be unique phone-verified users.
- QR tokens random/unguessable, never raw IDs; expirable; admin-disablable.
- Every scan + failed attempt → ScanLog (success/failed/blocked + failure_reason).

## Privacy  (TBD §18)
- Merchants see MASKED customer phone (e.g. `+99670***456`), only customers tied to
  their business. Admin access logged.

## Analytics events  (TBD §14) — emit (log/table) on these
customer: customer_signed_up, merchant_qr_scanned, reward_collected,
reward_unlocked, reward_redeemed, group_offer_viewed, group_created, group_joined,
group_invite_shared, group_checked_in, group_completed, group_failed.
business: business_registered, business_approved, reward_program_created,
merchant_qr_downloaded, group_offer_created, group_offer_approved,
group_offer_paused, staff_redeemed_reward.
admin: admin_approved_business, admin_rejected_business, admin_approved_offer,
admin_manual_adjustment, admin_blocked_customer, admin_disabled_business.

## Celery tasks  (TBD §5.11 / §13)
`send_otp(phone, code)` · `send_group_full_notification(group_id)` ·
`send_visit_reminder(group_id)` · `send_reward_unlocked(customer_id, reward_id)` ·
`send_business_weekly_report(business_id)` · `expire_old_groups` ·
`rotate_approval_codes` (beat, daily) · `expire_rewards` (beat).

## Tech stack  (TBD §2)
Django + DRF · PostgreSQL · Redis + Celery (+ beat) · JWT (SimpleJWT) ·
Django Admin (admin panel for MVP) · Docker + docker-compose · Nginx · Sentry.
Frontend: Next.js/React PWAs (customer / business / staff).

## i18n
Russian + English from start (`ru` default), Kyrgyz later. API messages keyed so
frontend can localize; store `language` on CustomerProfile.
