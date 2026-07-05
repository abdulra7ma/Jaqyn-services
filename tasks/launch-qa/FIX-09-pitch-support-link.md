# FIX-09 — Pitch page support link hardcoded

Priority: MEDIUM · Area: frontend config · Model: **haiku**

## Files
- `frontend/apps/web/app/pitch/[token]/page.tsx` (~line 31: `href="https://t.me/jaqyn"`)

## Current behavior
Dead-link screen (expired/claimed pitch) points prospects at a hardcoded
Telegram URL. Channel change = code change + deploy.

## Expected behavior
URL comes from `NEXT_PUBLIC_SUPPORT_URL` (validated in the public env
schema, with the current t.me link as documented default) — one env var
edit on Railway changes it.

## Fix
Add the var to the public env zod schema + .env.example, read it in the
page. Grep for other hardcoded t.me/support links while there; same
treatment.

## Verify
1. Unset var → build uses default; set var → link reflects it.
2. Typecheck + build pass.
