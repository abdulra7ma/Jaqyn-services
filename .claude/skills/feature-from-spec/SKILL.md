---
name: feature-from-spec
description: >-
  Turn a filled feature spec (docs/specs/SPEC-*.md) plus its linked design into
  implementation plans and a verification plan. Use this skill whenever the user
  references a feature spec, a SPEC-<area>-<NN> id, a `docs/specs/*` file, or asks to
  "plan / build / implement / verify a feature from the spec", "pull the design and plan
  it", or "generate backend and frontend plans for <feature>". Apply it proactively when
  a spec is the starting point for work — it pulls the design (Figma MCP or Claude Design
  link), cross-checks design against the spec, then emits a backend plan, a frontend plan,
  an FE↔BE contract, and a verification matrix mapping every acceptance criterion to a
  test. It defers to the rule docs `@.claude/rules/backend.md` and `@.claude/rules/frontend.md` for standards. Do NOT use it to
  author a spec from scratch (that's a writing task) or for ad-hoc code edits unrelated to
  a spec.
---

# Feature From Spec

Orchestrates: **spec + design → backend plan + frontend plan + contract + verification.**
Produces *plans and test scaffolds for review first* — not a merged implementation. The
human approves the plans before code is written, the same way the `tasks/B##`/`F##`
workflow gates work.

This skill composes others. When planning backend work, follow the rules in
**`@.claude/rules/backend.md`**; for frontend, **`@.claude/rules/frontend.md`**. These are
auto-loaded via the root `CLAUDE.md` imports — do not restate their content, defer to them.

## Inputs it expects
- A filled spec at `docs/specs/SPEC-<area>-<NN>.md` with the standard sections.
- `design.link` populated and `design.status: linked` (the design step has run).

## Phase 0 — Validate the spec (gate)
Read the spec. **STOP and ask the user** if any of these are missing — do not guess:
- §4 Workflow has ID'd steps (W1, W2, …).
- §8 Acceptance Criteria exist, are ID'd (AC-1…), and are Given/When/Then.
- §6 Data & contract names the entities and at least the endpoint shapes.
- `design.link` is set (unless the user explicitly says "plan without design yet").
- For `type: edit`, §2 has both **Current behavior** and **Desired behavior**.

A spec that fails this gate is not ready to plan. Say exactly what's missing.

## Phase 1 — Pull & reconcile the design (gate)
Pull the design from `design.link`:
- **Figma:** use the Figma MCP tools to fetch the node's context/screenshot/structure.
- **Claude Design:** read the linked artifact.

Then **cross-check design ↔ spec** and report the diff before planning:
- Every screen in §5 has a matching design frame. (Spec screen with no design → flag.)
- Every design frame maps to a spec screen. (Design with no spec coverage → flag — this is
  scope creep or a missing spec update; resolve before building.)
- Every state listed in §5 (empty/loading/error/success/…) is represented in the design.
- The primary action on each screen matches the workflow step that lands there.

If design and spec disagree, the **spec wins** — flag it and have the user update the spec
(or the design) before continuing. Never silently plan to the design over the spec.

## Phase 2 — Backend implementation plan
Follow `@.claude/rules/backend.md`. Produce a plan (not code) covering, per `target.backend_apps`:
- **Models / migrations:** new or changed fields, with migration-safety notes (nullable →
  backfill → constrain; schema and data migrations separate). Call out any large-table risk.
- **Service layer:** the services and methods that hold the §7 rules; Protocols only at real
  seams. Map each §7 rule to the service method that enforces it.
- **DRF views/serializers:** the endpoints from §6 — explicit `serializer_class`,
  `permission_classes` (from §3), `queryset`; pagination + throttle per the rules.
- **Celery:** any async work; ids-not-instances; `transaction.on_commit` for post-write side
  effects; retries/time limits.
- **Error mapping:** which domain exceptions the §8 error/permission ACs imply.

Output as a structured plan, ordered so it could become `tasks/backend/B##` entries.

## Phase 3 — Frontend implementation plan
Follow `@.claude/rules/frontend.md`. Produce a plan covering, per `target.frontend`/`packages`:
- **Routes & boundaries:** App Router routes for each §5 screen; server vs client split
  (default server; client only where interaction/QR/browser APIs require it).
- **Data layer:** `@jaqyn/api` client methods for each §6 endpoint; typed query-key factory
  entries; which calls are server-fetched vs TanStack Query on the client; mutation +
  invalidation for writes.
- **UI:** which `@jaqyn/ui` primitives cover each screen; new components named explicitly;
  every §5 state (empty/loading/error/success) has a rendering.
- **i18n:** the `@jaqyn/i18n` keys implied by all copy, in the §9 locales.
- **a11y:** the keyboard path through the §4 primary flow.

## Phase 4 — FE↔BE contract
Emit or update a `docs/<feature>-contract.md` (your existing pattern) from §6: the agreed
endpoints, request/response shapes, status codes, and error bodies. This is the artifact the
`contract-verifier` subagent later checks the code against. Both plans above must conform to it.

## Phase 5 — Verification matrix (the point of the whole thing)
Build a table that maps **every workflow step and acceptance criterion to concrete tests**,
so "test against the behavior" is mechanical, not vibes:

| ID | Behavior (from §4/§8) | Backend test | Frontend test |
|----|----------------------|--------------|---------------|
| AC-1 | … | `pytest` happy-path on <endpoint> + `django_assert_num_queries` | Playwright: <flow> |
| AC-3 | error path | service raises <DomainError> → handler returns <status> | Playwright: error state renders |
| AC-4 | permission | request as <wrong role> → 403 | UI hides/blocks action |
| W1…Wn | full workflow | — | Playwright e2e walking W1→Wn |

Rules for this phase:
- Every AC-ID and every error/permission AC gets at least one test. No AC left uncovered.
- Each generated test **names its AC-ID** in the test name or docstring, so traceability is
  bidirectional (test ↔ spec).
- Backend follows the `@.claude/rules/backend.md` test rule (auth + permission + happy path
  per endpoint, query-count assertions on lists). Frontend follows `@.claude/rules/frontend.md`
  (RTL for components, Playwright for the workflow; MSW at the network boundary).
- For `type: edit`, include **regression** tests for the §2 *current behavior* that must
  still hold, not only the new path.

Output the test files as scaffolds (signatures + docstrings + AC references, bodies stubbed
where the user prefers to fill them) unless the user asks for full implementations.

## Output & handoff
Write the artifacts to the repo for review:
- `docs/specs/<spec>.plan.backend.md`
- `docs/specs/<spec>.plan.frontend.md`
- `docs/<feature>-contract.md`
- `docs/specs/<spec>.verification.md` (the matrix)
Then flip the spec's `status` to `in-build` and summarize what needs human sign-off before
code is written. Suggest running the **explorer** subagent first if the affected apps are
unfamiliar, and the **contract-verifier** subagent after implementation to confirm code
still matches Phase 4.