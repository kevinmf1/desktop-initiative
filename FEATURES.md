# Features

> Scope backbone, grouped by epic (one epic = one PRD = one ID prefix).
> Status: 🟡 not started · 🔵 in progress · ✅ done · 🔴 blocked · 🟠 needs verification
> **One feature is active at a time per person** (see `state/<name>.md`) — the backlog may span epics.
> `By` = who actually did the work, from `git config user.name` on the machine that ran it.
> Completed feature detail → `archive/features/`. Completed *epics* → `archive/epics/`, listed under Shipped.

| Epic | Progress | Active / open |
|------|:--------:|---------------|
| Harness setup | 1/1 | — |
| Desktop app (Tauri) | 12/21 | feat-015 … feat-023 (all 🟡) |

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

## Epic · Desktop app (Tauri)

Build the desktop client the frontend spec describes: Tauri 2.x shell, `device-desktop-ws` server,
`sync-api` client, and the test-management / session / bug surfaces on top.

**PRD:** [specs/frontend/spec.md](specs/frontend/spec.md) · **Prefix:** `feat-`
**Started:** 2026-08-03 · **Started by:** kevin-malik

**Done when**, for every row below: each FR it names is satisfied as written in
`specs/frontend/spec.md`, and `./verify.sh build` passes. The FRs *are* the acceptance criteria —
they are all `MUST` statements. Write `archive/features/<id>.md` when a row closes; while a row is
🔵 its detail lives in the owner's `state/<name>.md`.

> `verify.sh` compiles `desktop/` as of feat-004 — `build` runs `tsc && vite build` +
> `cargo check --all-targets`, `test` runs `vitest run` + `cargo test`.

| ID | Feature | Status | By | Depends on | Evidence |
|----|---------|:------:|----|------------|----------|
| feat-004 | Tauri 2.x shell + navigation, independently buildable/releasable — FR-000; adds a real compile step to `verify.sh` | ✅ | kevin-malik | — | [archive](archive/features/feat-004.md) |
| feat-005 | Contract version + capability handshake: same-major connects, major mismatch refuses and names the stale peer, unknown fields ignored, missing capability shown *unavailable-because-out-of-date* — FR-000c, FR-000d, FR-000e | ✅ | kevin-malik | feat-004 | [archive](archive/features/feat-005.md) |
| feat-006 | Google SSO in the system browser — PKCE + `127.0.0.1` loopback, no embedded webview, no client secret — FR-001b, FR-051a | ✅ | kevin-malik | feat-004 | [archive](archive/features/feat-006.md) |
| feat-007 | Session credential in the OS keychain, cached membership list, 30-day offline grace (expiry never interrupts a running session), sign-out clears local only — FR-052a, FR-053, FR-053a, FR-054 | ✅ | kevin-malik | feat-006 | [archive](archive/features/feat-007.md) |
| feat-008 | Workspace switcher: every membership listed, all data scoped to the active workspace, no reattribution on switch, switch blocked while a session runs — FR-001, FR-056a, FR-056c, FR-056d | ✅ | kevin-malik | feat-007 | [archive](archive/features/feat-008.md) |
| feat-009 | Test Case CRUD — derived summary status (`Has Fail → Blocked → In Progress → All Passed → Not Run`, computed on read), Active/Archived flag, platform iOS/Android/Both — FR-003, FR-003a, FR-003b, FR-003c | ✅ | kevin-malik | feat-008 | [archive](archive/features/feat-009.md) |
| feat-010 | Test Case list: search, filter (category/tag/status/platform/server), sort, audit metadata, soft delete with confirmation, reuse across plans — FR-004, FR-005, FR-006, FR-007 | ✅ | kevin-malik | feat-009 | [archive](archive/features/feat-010.md) |
| feat-011 | CSV/Excel import with row-level error preview before commit; duplicate titles allowed — FR-008 | ✅ | kevin-malik | feat-009 | [archive](archive/features/feat-011.md) |
| feat-012 | Test Plan CRUD: create/update/archive/duplicate, add/remove cases, plan notes, target build, environment/server — FR-009, FR-010, FR-011 | ✅ | kevin-malik | feat-009 | [archive](archive/features/feat-012.md) |
| feat-013 | Pairing by QR / pairing code as the default flow; single-use token, 5-minute TTL, refresh invalidates the previous one; device ID is a filter, not auth — FR-016, FR-020, FR-020a | ✅ | kevin-malik | feat-005 | [archive](archive/features/feat-013.md) |
| feat-014 | Device registry: display name + stable device ID, enable/disable without deleting, persists across restarts, access policy `open`/`allowlist` (default `allowlist`), observed platform shown — FR-015, FR-017, FR-018, FR-019, FR-022 | ✅ | kevin-malik | feat-013 | [archive](archive/features/feat-014.md) |
| feat-015 | `device-desktop-ws` server with ≥2 concurrent visible device sessions, state and logs isolated per device + session ID — FR-021 | 🟡 | — | feat-013 | — |
| feat-016 | Manual test runner: start from a plan or ad-hoc cases (build, server, platform, device) producing a unique session ID; stop prompts Passed/Failed/Blocked/Incomplete — FR-012, FR-014 | 🟡 | — | feat-012, feat-015 | — |
| feat-017 | Live log viewer, behaviour identical for iOS and Android devices — FR-029a | 🟡 | — | feat-015 | — |
| feat-018 | Grouped log view by User Action (label, timestamp, record count, success/error summary), "Unattributed" group, empty groups kept, grouped ⇄ flat toggle with search/sort/filter inside groups — FR-039b, FR-039c, FR-039d, FR-039e | 🟡 | — | feat-017 | — |
| feat-019 | "Bug Occurred" marker mid-session: creates the bug, bookmarks the activity window, session keeps running — FR-013 | 🟡 | — | feat-016, feat-017 | — |
| feat-020 | Bug record + evidence: full field set, severity P0–P3, status Open/In Progress/Resolved/Closed/Won't Fix (default Open), attached marker + log excerpt + preceding User Actions, configurable ±30s window — FR-030, FR-030a, FR-030b, FR-031, FR-032 | 🟡 | — | feat-019 | — |
| feat-021 | Capture relay: receive the binary from the device, upload to backend storage, queue + retry when unreachable, "pending upload" state, metadata syncs independently of the binary — FR-044, FR-044a, FR-044b | 🟡 | — | feat-020, feat-023 | — |
| feat-022 | Reporting: session history, pass/fail rate by plan, failed cases by build, bugs by environment, API error patterns by session/device, per-plan result for a shared Test Case — FR-033, FR-034 | 🟡 | — | feat-016, feat-020 | — |
| feat-023 | Local-first store + `sync-api` client: session keeps capturing while the backend is down, bugs and evidence sync later, clearing logs never drops bug evidence, malformed messages discarded with a diagnostic, duplicates de-duplicated — FR-035, FR-035b, FR-036 | 🟡 | — | feat-015 | — |
| feat-024 | Debug-only local authentication for manual frontend testing: no Google/backend required, two active workspaces, normal auth unchanged when disabled, unavailable in release builds | ✅ | kevin-malik | feat-007 | [archive](archive/features/feat-024.md) |

---

## Shipped

Completed epics, rotated to `archive/epics/`. One line each.

_None yet._

## Retired IDs

Never reuse a retired ID — an old reference to it must not resolve to different work.

- **feat-001** (derive `specs/backend/`) and **feat-002** (derive `specs/ios/`) — withdrawn
  2026-08-03. Both were out of scope: this repo delivers the frontend only. Neither is a gap.
