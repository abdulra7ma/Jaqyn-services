---
title: Jaqyn Documentation
service: shared
type: overview
status: active
last_reviewed: 2026-06-30
---

# Jaqyn Documentation

Start at **[INDEX.md](INDEX.md)** — the generated map of every doc, grouped by service.

This `docs/` tree holds **cross-cutting** documentation only. Each deployable
keeps its own canonical docs:

- **Backend** → [`backend/docs/`](../backend/docs/README.md)
- **Frontend** → [`frontend/docs/`](../frontend/docs/README.md)
- **Landing** → [`landing/docs/`](../landing/docs/overview.md)

## What lives here

| Folder | Contents |
|---|---|
| `conventions/` | Shared engineering conventions (response envelope, errors, auth) |
| `schemas/` | Cross-cutting schema summary (canonical model docs are in `backend/docs/data-model.md`) |
| `contracts/` | API contract + cross-team feature contracts (staff scan, etc.) |
| `guides/` | How-to / workflow docs (Docker, campaign workflows) |
| `architecture/` | Repo-wide structure and architecture |
| `specs/` | **Active** plans (work not yet shipped) |
| `qa/` | Point-in-time QA / production-readiness reports (open findings) |
| `design-system.md` | UI source of truth (color, type, shape, primitives) |
| `_archive/` | Shipped plans (`status: deprecated`) + the historical design deck |
| `_audit/` | One-time docs-audit report |

## Rules

- Every doc carries YAML frontmatter (`title`, `service`, `type`, `status`,
  `last_reviewed`).
- `INDEX.md` is **generated** from that frontmatter — regenerate it after adding
  or moving a doc; never hand-edit it.
- `tasks/` is a tracker system (`B*`/`F*`/`CHECKPOINT.md`), not documentation.
- Authoritative agent guide: [`../AGENTS.md`](../AGENTS.md).
