# Features

> Scope backbone, grouped by epic (one epic = one PRD = one ID prefix).
> Status: 🟡 not started · 🔵 in progress · ✅ done · 🔴 blocked · 🟠 needs verification
> **One feature is active at a time per person** (see `state/<name>.md`) — the backlog may span epics.
> `By` = who actually did the work, from `git config user.name` on the machine that ran it.
> Completed feature detail → `archive/features/`. Completed *epics* → `archive/epics/`, listed under Shipped.

| Epic | Progress | Active / open |
|------|:--------:|---------------|
| Harness setup | 1/1 | — |

> **Scope: frontend (Tauri desktop) only.** The backend, iOS SDK and Android SDK are other
> people's projects — they get no rows here. See `CONSTITUTION.md` § *Invariants — scope*.

---

## Epic · Harness setup

Make the repo resumable across sessions: verification that runs, evidence that is recorded, and a
scope the harness actually enforces.

**PRD:** [specs/README.md](specs/README.md) · **Prefix:** `feat-`
**Started:** 2026-07-31 · **Started by:** kevin-malik

| ID | Feature | Status | By | Depends on | Evidence |
|----|---------|:------:|----|------------|----------|
| feat-003 | `git init` so attribution and diffs work | ✅ | kevin-malik | — | [archive](archive/features/feat-003.md) |

---

## Shipped

Completed epics, rotated to `archive/epics/`. One line each.

_None yet._

## Retired IDs

Never reuse a retired ID — an old reference to it must not resolve to different work.

- **feat-001** (derive `specs/backend/`) and **feat-002** (derive `specs/ios/`) — withdrawn
  2026-08-03. Both were out of scope: this repo delivers the frontend only. Neither is a gap.
