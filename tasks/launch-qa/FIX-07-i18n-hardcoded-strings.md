# FIX-07 — Hardcoded EN strings on customer/staff surfaces (RU launch)

Priority: HIGH · Area: frontend i18n · Model: **haiku sweep → sonnet fix**

## Files
- Known: `frontend/apps/web/app/onboarding/page.tsx` (~line 203 "Get started")
- Sweep target: all of `app/` EXCEPT `app/business/**` (customer + staff
  surfaces face strangers at launch; business owner surface is
  concierge-onboarded — lower priority, log findings to PLAN backlog).

## Carried over from FIX-05 (must handle in this pass)
Add these keys (used by business/more staff-code confirm, currently render raw):
- `biz.staffCode.regenConfirm.title` — EN "Generate a new code?" / RU "Создать новый код?"
- `biz.staffCode.regenConfirm.description` — EN "Your staff's current code will stop working immediately." / RU "Текущий код сотрудников перестанет работать немедленно."
- `biz.staffCode.regenConfirm.confirm` — EN "Generate new code" / RU "Создать новый код"

## Carried over from FIX-04 (must handle in this pass)
- Business dashboard activity rows reuse `staff.activity.kind.*` keys on an
  owner surface — add dedicated `owner.dashboard.activity.kind.*` keys.
- `fmtAgo` relative-time suffixes in the dashboard page (`с/м/ч`) are
  hardcoded Russian (mirrors staff `fmtRelative`) — route through i18n.

## Current behavior
LAUNCH.md item 3 requires RU 100% on customer + staff surfaces. At least
one hardcoded string exists ("Get started" on the onboarding tour); a
systematic sweep hasn't been run.

## Expected behavior
Every user-visible string on customer + staff surfaces resolves through
`useT()` / @jaqyn/i18n with an RU value present in
`frontend/packages/i18n/src/locales.ts`.

## Fix
1. Sweep (haiku): grep JSX text literals + attribute strings (`aria-label`,
   `placeholder`, `alt`, `title`) under app/ minus app/business; list every
   hardcoded user-facing string with file:line. Exclude test files and
   non-UI constants.
2. Fix (sonnet): add namespaced keys (EN + RU) and replace literals. Do NOT
   machine-translate anything ambiguous — flag untranslatable/marketing copy
   for the user in the checkpoint note.

## Verify
1. Re-run the sweep grep → zero user-facing literals remain in scope.
2. Switch locale to RU in the app → walk /onboarding, /campaigns, /staff/scan,
   /staff/activity: no English leftovers on screen.
3. `pnpm --filter web test` + typecheck pass.
