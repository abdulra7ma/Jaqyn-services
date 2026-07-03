---
title: Leads admin tool (flexible lead table)
service: backend
type: spec
status: active
last_reviewed: 2026-07-03
---

# Leads admin tool — flexible, JSON-backed lead table

Internal sales tool inside the Django admin (django-unfold). Lists scraped
business leads (seeded from the Bishkek 2GIS xlsx), lets the team change
statuses, edit cells, and add rows/columns at runtime. **All table operations
(sort, filter, search, pagination) run client-side in the browser** — the
backend stores flexible data and serves it; a JS data-grid does the work.

## Goals

- One flexible table of leads, embedded as a section in the Django admin.
- Columns are a **runtime registry** with editable **types** (text, number,
  date, boolean, url, select, multiselect). Add/rename/retype columns without a
  deploy.
- Upload a **JSON array** of objects → rows. Unknown keys auto-register as
  columns.
- **Statuses** are runtime-managed (name + color + order); rows are re-statused
  inline with colored pills; filter by status.
- Every row records **`created_by`** (the admin user who created/imported it);
  filter by creator.
- Inline cell edit + add-row + add-column, persisted to the DB.
- Seed once from `jaqyn_bishkek_2gis_leads.xlsx` with the 6 formula-based score
  columns **computed in Python** (static values, editable afterward).

## Non-goals

- No server-side sort/filter/pagination (explicitly client-side).
- No customer/staff-app surface — admin-only.
- No live recomputation of score formulas after seed.

## Architecture

New Django app **`apps.leads`**. Registered in the django-unfold sidebar as its
own section. One custom admin page renders the grid; thin JSON endpoints back it.

### Models

**`LeadColumn`** — column registry.
| field | type | notes |
|---|---|---|
| `key` | slug, unique | JSON key inside `Lead.data` |
| `label` | char | display header |
| `type` | char choices | `text·number·date·boolean·url·select·multiselect` — **editable** |
| `choices` | JSONField (list[str]) | for `select`/`multiselect`; else `[]` |
| `order` | int | grid column order |
| `is_visible` | bool | show/hide in grid |
| `editable` | bool | default `True` |

**`LeadStatus`** — runtime-managed status list.
| field | type | notes |
|---|---|---|
| `name` | char, unique | e.g. "Not contacted", "Contacted", "Won" |
| `color` | char (hex) | from design-system §1 semantic palette |
| `order` | int | pipeline order |
| `is_default` | bool | applied to new rows |

**`Lead`** — the row.
| field | type | notes |
|---|---|---|
| `data` | JSONField | dict keyed by `LeadColumn.key` |
| `status` | FK `LeadStatus` | `null=True`, `on_delete=SET_NULL` |
| `created_by` | FK `User` | auto-set, `on_delete=SET_NULL` |
| `created_at` / `updated_at` | datetime | UTC |

Statuses and `created_by` are **first-class real fields** (not `LeadColumn`s) so
they stay queryable and joinable; everything else lives in `data`.

### Service layer (`apps/leads/services.py`)

Business logic lives here (per backend rules), raising domain exceptions:

- `import_leads(payload: list[dict], user) -> ImportResult` — validate payload is
  a list of objects; auto-register unknown keys as `text` columns; create rows
  with `created_by=user` and default status; return a typed `ImportResult`
  (`@dataclass`: created, updated, new_columns).
- `coerce_value(column: LeadColumn, raw) -> object` — validate/coerce a value
  against the column type; raise `ValidationError` on mismatch (e.g. non-numeric
  into a `number` column, value outside `choices` for `select`).
- `update_row(lead, data_patch, status_id, user) -> Lead` — coerce each patched
  field, apply status, save.
- `create_column` / `update_column` — register or retype a column. Retyping
  re-coerces existing values where safe; leaves incompatible values untouched and
  reports them.
- `compute_scores(row: dict) -> dict` — reimplements the 6 xlsx formulas (used by
  the seed only):
  - Rating Score = `min(30, rating*6)`
  - Review Strength = `min(10, log10(reviews+1)*3.5)`
  - Repeat / Young / Local Decision = switch on High/Medium/Low
  - Campaign Ease = 10 if category matches coffee/cafe/barber/salon/beauty/nail/
    pizza/fast (EN+RU substrings) else 6
  - Total Jaqyn Fit = `min(100, round(sum(...)))`
  - Sales Priority = A ≥80, B ≥65, else C

### JSON endpoints (staff-only, CSRF-protected, under the admin URL tree)

All gated on `request.user.is_staff`; non-staff → 403. Thin views: parse → call
service → shape response.

| method + path | purpose |
|---|---|
| `GET  leads/api/table/` | `{columns, statuses, rows}` — one payload for the grid |
| `POST leads/api/upload/` | body = JSON array → `import_leads`; returns summary |
| `POST leads/api/rows/` | create row |
| `PATCH leads/api/rows/<id>/` | edit cells and/or status |
| `DELETE leads/api/rows/<id>/` | delete row |
| `POST leads/api/columns/` | add column |
| `PATCH leads/api/columns/<id>/` | edit column (incl. change type) |
| `DELETE leads/api/columns/<id>/` | remove column |

`GET table/` uses `select_related("status", "created_by")` — no N+1. Enforced by
a `django_assert_num_queries` test.

### Frontend grid

Custom admin template extending the unfold base. **Tabulator** (single-file JS
grid, vendored into `apps/leads/static/leads/`) handles client-side sort, filter,
per-column header filters, global search, pagination, and editable cells natively.
Cell edits / status changes / add-row fire `fetch` PATCH/POST to the endpoints.
Status renders as a colored pill using `LeadStatus.color`; select columns render
as dropdowns from `choices`. Grid styling pulls from the design-system warm
palette (cream surfaces, terracotta accents, §1 status tints).

`// ponytail:` client-side grid holds ~10k rows comfortably; switch `GET table/`
to server-side pagination if the lead count ever crosses that.

### Seed

`apps/leads/fixtures/bishkek_leads.json` — generated once from the xlsx
(`All Leads` sheet, 120 rows), with scores computed via `compute_scores`. A
management command `python manage.py seed_leads` loads columns + statuses + rows
idempotently. Column type map from the sheet:

- `select`: Area, Source Map, Repeat Visit Potential, Young/Smartphone Fit, Local
  Decision Maker Likelihood, Franchise/Local Type, Sales Priority (A/B/C)
- `url`: 2GIS Source URL, Google Maps Search URL
- `number`: Priority Rank, Rating, Review Count, all 6 score columns
- `date`: Last Checked
- `text`: Business Name, Category, Address, Tags, Suggested First Campaign, Field Notes

**Visit Status** column → seeds the `LeadStatus` list (Not contacted [default],
Contacted, Interested, Negotiating, Won, Lost) and sets each row's `status`,
rather than becoming a `LeadColumn`.

## Testing (backend rules)

- Services: `coerce_value` per type (valid + reject), `import_leads`
  (create + update + auto-new-column), `compute_scores` (asserts A/B/C boundary
  and one full row), `update_column` retype re-coercion.
- Endpoints: auth test (non-staff 403) + happy path for `upload`, `PATCH row`,
  `POST column`; `GET table/` under `django_assert_num_queries`.

## Design system

Admin-facing (internal) — labels via Django `gettext`, not `@jaqyn/i18n` (that
layer is for the Next.js apps). Grid colors and status pills come from
`docs/design-system.md` §1; no raw hex invented.

## Open ceilings / deliberate shortcuts

- Scores are static after seed (no live recompute) — accepted per brainstorm.
- Client-side ops cap ~10k rows — logged above.
- Column delete does not purge the key from existing `data` blobs (orphan keys
  are harmless, hidden once the column is gone); a cleanup pass can be added if
  needed.
