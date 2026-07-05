# FIX-08 — Camera-denied error lacks recovery guidance

Priority: HIGH · Area: shared frontend · Model: **sonnet**

## Files
- `frontend/apps/web/app/_components/QrScanner.tsx` (permission/HTTPS reasons already detected, ~line 32–37)
- `frontend/apps/web/app/staff/scan/page.tsx` (CameraOff sheet, ~line 814–915 — manual fallback already exists)

## Current behavior
Scanner detects NotAllowedError → "permission" and insecure context, but
the user-facing message stops at "camera unavailable". At the counter, a
staff member on iOS who tapped "Don't allow" once has no idea how to
recover; manual code entry exists but isn't offered as the obvious next step.

## Expected behavior
Permission-denied state shows: (1) short how-to-enable hint per the common
case ("Allow camera in browser settings / Настройки → Safari → Камера"),
(2) a prominent "enter code manually" action right in the error state.
Insecure-context state says HTTPS is required. All copy via @jaqyn/i18n
(EN + RU).

## Fix
Extend the error rendering in QrScanner / CameraOff sheet with
reason-specific copy + manual-entry CTA. No new deps; keep scanner cleanup
(stream release) untouched.

## Verify
1. Deny camera permission in browser → denied state shows hint + manual
   entry button; manual code path completes a collect.
2. Reduced check on http:// (non-localhost) → HTTPS message.
3. Grant permission → normal scan unaffected. Typecheck + staff tests pass.
