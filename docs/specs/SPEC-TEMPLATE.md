---
# Copy this file to docs/specs/SPEC-<AREA>-<NN>.md and fill every section.
# <AREA> = short domain tag (LOYALTY, GROUPS, BANKING, STAFF, QR, ACCOUNTS, …).
# <NN>   = zero-padded sequence within that area (01, 02, …).
id: SPEC-<AREA>-<NN>
title: <one-line feature name>
type: feature            # feature | edit  (edit = changing existing behavior)
status: draft            # draft | linked | ready | in-build | done
owner: <name>

design:
  link: ""               # Figma node URL or claude.ai design link
  status: unlinked       # unlinked | linked   (flip to linked once design.link is set)

target:
  backend_apps: []       # e.g. [loyalty, businesses] — apps under backend/apps/
  frontend: []           # e.g. [apps/web]
  packages: []           # e.g. [@jaqyn/api, @jaqyn/ui, @jaqyn/i18n]
---

# SPEC-<AREA>-<NN> — <feature name>

## §1 Summary
One paragraph: what this feature is and the user value. Why now.

## §2 Behavior
- **Desired behavior:** what the system should do after this ships.
- **Current behavior:** *(required when `type: edit`)* what it does today, and the exact gap.

## §3 Roles & Permissions
Who can do what. One row per actor.

| Role | May | May NOT |
|------|-----|---------|
| <e.g. customer> | … | … |
| <e.g. business staff> | … | … |

Maps to DRF `permission_classes`. Every "May NOT" should become a permission test (§8).

## §4 Workflow
The primary flow as ordered, ID'd steps. Reference these IDs everywhere else.

- **W1** — <actor> does <action> → <result>
- **W2** — …
- **W3** — …

Note alternate / failure branches inline (e.g. "W2a — invalid code → error").

## §5 Screens & States
One subsection per screen. Every screen lists ALL states it must render.

### Screen: <name>  (lands on workflow step W#)
- **Primary action:** <button/intent that advances the workflow>
- **States:** empty · loading · error · success  *(list the ones that apply)*
- **Design frame:** <frame name/id in design.link>

*(Repeat per screen. Every screen must have a design frame once `design.status: linked`.)*

## §6 Data & Contract
**Entities** — new/changed models and key fields:
- `<Model>` — fields, relations, what's new.

**Endpoints** — request/response shape per endpoint (becomes `docs/<feature>-contract.md`):

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| POST | `/api/...` | <role> | `{…}` | `{…}` (typed, not bare dict) | 400/403/404 → body |

## §7 Business Rules
Numbered domain rules the service layer must enforce (not UI concerns).

- **R1** — <rule>. (→ service method that owns it)
- **R2** — …

## §8 Acceptance Criteria
Every criterion ID'd and written Given/When/Then. Each becomes ≥1 test (§ verification).
Cover happy path, every error path, and every permission boundary from §3.

- **AC-1** — Given <state>, When <action>, Then <observable result>.
- **AC-2** — Given <wrong role>, When <action>, Then 403 and no state change.
- **AC-3** — Given <invalid input>, When <action>, Then <error state / status>.
- *(For `type: edit`: add regression ACs for the §2 current behavior that must still hold.)*

## §9 Locales
Languages this ships in (drives `@jaqyn/i18n` keys): e.g. `en`, `ar`.
Note any RTL / formatting concerns.
