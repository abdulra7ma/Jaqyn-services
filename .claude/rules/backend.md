# Backend Rules — Django / DRF / Celery

Applies to `backend/`. Django 5 + DRF + SimpleJWT + Celery + Redis + Postgres.

## Tooling
- Lint + format: **Ruff** (config in `pyproject.toml`), PEP 8 enforced.
- Types: **mypy** + `django-stubs` + `djangorestframework-stubs`. CI fails on type errors.
- Hooks: **pre-commit** runs ruff + mypy on staged files.
- Tests: **pytest** + `pytest-django`. Factories via `factory_boy`.
- Deps: a **lockfile** is committed and is the source of truth. `pip-audit` (or
  equivalent) runs in CI; dependency-update bot enabled. A failing audit blocks merge.

## Type hints (mandatory)
- Every function, method, and parameter is type-hinted. No untyped signatures.
- Every function declares an explicit return type.
- Return **clear, structured types** — never bare `dict` / `str` / `tuple` for
  structured data. Use `@dataclass`, typed objects, or a DRF serializer.
  `dict[str, Any]` is not an acceptable return type for domain data.

## Interfaces — Protocols
- Define a `typing.Protocol` **at a boundary**, not by default. A boundary is any of:
  more than one implementation exists (or is genuinely planned), there's a test double
  swapped in at that seam, or an import cycle needs breaking.
- Where a Protocol exists, code depends on the Protocol, not the concrete class.
- The Protocol lives next to the service it describes; the concrete class implements it.
- For a service with exactly one implementation and no seam, depend on the concrete
  class directly. Don't add indirection that has no second side.

## Service layer
- Services are **independent**: self-contained, no tight coupling to other services.
  Cross-service needs go through the other service's public surface (its Protocol where
  one exists), never its internals.
- **All business logic lives in the service layer.** Models hold data + invariants;
  services hold logic.
- **Module size is a smell, not a hard cap.** A service module pushing ~300 lines is a
  signal it may have too many responsibilities — review and split *by responsibility*,
  not to hit a number. When it does split, convert to a package:
  `services/<name>/__init__.py` is the entry file that re-exports the public surface,
  with implementation split across sibling files. Never smear one cohesive service
  across five files just to satisfy a line count.

## Error handling
- Services signal failure by **raising domain exceptions**, never by returning error
  sentinels (`None`, `False`, `{"error": ...}`).
- A single hierarchy: base `ServiceError` with typed subclasses
  (`NotFoundError`, `ConflictError`, `ValidationError`, `PermissionDeniedError`, …).
- One DRF **custom exception handler** maps the hierarchy to HTTP responses
  (status code + structured body). Views never translate exceptions to responses
  by hand — that would be business logic leaking into views.

## Validation
- **Shape/format validation → serializers.** Required fields, types, lengths, enum
  membership, basic field-level constraints.
- **Business-rule validation → services.** Anything that needs domain state, other
  records, or cross-field rules. A service may reject input the serializer accepted.
- Don't duplicate a rule in both layers; pick the layer that owns it.

## Docstrings — doc-driven
- Every service function/class has a docstring. The docstring is the source of truth:
  it states what logic the function performs and the rules it enforces.
- **Any logic change must update the docstring in the same edit.** Docstring and code
  never drift.
- For invariants that actually matter, back the prose with a **test** (or doctest) that
  asserts the behavior. A rule that can silently rot is not enforced — it's hoped for.

## Static / magic values
- Any variable holding a static literal must carry a comment explaining **why** the
  value is what it is and **where it comes from** (spec, business rule, external API
  limit, config default). No unexplained magic numbers or strings.
- Prefer named constants over inline literals.

## Views (DRF)
- **Views hold zero business logic** — parse input, call a service, shape the response.
- Always set explicit `serializer_class`, `permission_classes`, `queryset`.
- No `AllowAny` unless deliberate and commented.
- **Paginate every list endpoint** with a default page size *and a hard max* so an
  attacker can't request `?page_size=1000000`. Define both in settings.
- **Throttle** auth endpoints and all write endpoints via DRF throttle classes.
  Anonymous and authenticated rates set explicitly; no unthrottled write surface.

## API surface
- **drf-spectacular** generates the OpenAPI schema; CI fails if the schema is stale.
- If external clients consume the API, it is **versioned** (URL or header). Breaking
  changes ship under a new version; old version deprecated on a stated timeline.

## ORM & data
- Every relation access uses `select_related` / `prefetch_related`. No ORM calls in loops.
- All multi-write operations wrapped in `transaction.atomic`.
- **Read-modify-write under contention** (balances, counters, claim/lock flows) uses
  `select_for_update`. Never read a value, compute, and write it back without a lock.
- No business logic in migrations. Migrations committed, never edited after merge.

## Time & money
- `USE_TZ=True`. Store UTC; only timezone-aware datetimes cross a boundary.
- Money and any exact-precision quantity use `Decimal`, never `float`.

## Migrations — operational safety
- **No logic** in migrations (restated — it matters).
- Schema changes that touch large tables are **non-locking and incremental**:
  add nullable column → backfill in a separate data migration → add the constraint
  in a third. Never `add NOT NULL with default` or a blocking `RunPython` backfill in
  one shot on a big table.
- **Schema migrations and data migrations are separate files.** A data backfill never
  rides along inside a schema change.
- Every migration is reviewed for the lock it takes and whether it's safe to run while
  the app serves traffic.

## Celery
- Tasks **idempotent**. Pass **ids, not model instances**.
- **All post-write side effects go through `transaction.on_commit`.** Never `.delay()` a
  task — or send mail, or bust a cache — from inside `transaction.atomic`. The worker can
  pick up the id before the outer transaction commits and operate on a row that isn't
  there yet. This is the #1 Celery-with-Postgres bug; the rule is non-negotiable.
- Set `max_retries`, `retry_backoff`, and a hard time limit on every task.

## Observability
- **Structured (JSON) logs**, not free-form strings. Explicit, intentional log levels.
- A **request/correlation id** is generated at the edge and threaded through
  view → service → Celery task, so one request is traceable end to end across the worker
  boundary.
- **Never log tokens, passwords, or PII.** This is the floor, not the whole policy.

## Config & security
- Settings via env vars only. No secrets in code or commits.
- **Fail fast at boot**: a missing required env var raises on startup, not at first use.
- Settings split into **base / dev / prod**; prod has no dev conveniences.
- `DEBUG=False` by default.

## Tests
- Every endpoint: **auth test + permission test + happy path.**
- List endpoints assert query counts with `django_assert_num_queries` — that's how the
  N+1 rule is *enforced*, not just stated.
- Add/adjust a test in the same change that changes behavior.
- State results plainly. If skipped or failing, say so.

## Style
- PEP 8. No `print`, no commented-out code in commits.
- Match surrounding style. No drive-by reformatting.