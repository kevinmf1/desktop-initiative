# feat-008 — Workspace switcher and active-workspace scoping

- **Status:** ✅ done · closed 2026-08-04 · **Depends on:** feat-007
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-001, FR-056a, FR-056c, FR-056d

## Done when

- Every workspace the user is an **active** member of is listed and switchable; `invited` and
  `removed` memberships are not (FR-056a).
- All content shown is scoped to the active workspace, with no leakage between workspaces
  (FR-001, SC-021).
- Switching never reattributes an existing device, session, bug or capture (FR-056c).
- A switch is refused, with a clear reason, while a Test Session is running (FR-056d).

## What landed

- `desktop/src/App.tsx`:
  - `switchableWorkspaces(account)` — the FR-056a `active`-only filter over the membership snapshot
    feat-007 already caches and returns;
  - `workspaceSwitchRefusal(runningSessions)` — the FR-056d predicate and its message;
  - a native `<select aria-label="Workspace">` in the rail header, replacing the static wordmark;
  - `WorkspaceShell` now holds `activeWorkspaceId` as local UI state (plan.md R21) and is exported so
    the refusal path is testable before feat-016 exists;
  - `<main key={activeWorkspaceId}>` — a switch discards every screen's state by construction;
  - a `role="status"` empty state when no membership is `active`.
- `desktop/src/__tests__/App.test.tsx` — 4 new tests (11 total).

## Evidence

| Check | Result |
|---|---|
| Only `active` memberships are listed, in order | `App.test.tsx` › *the switcher lists every active membership and no invited or removed one* ✅ |
| Content re-scopes on switch; no Rust call is made | `App.test.tsx` › *switching scopes the content to the new workspace without rewriting anything* ✅ |
| Switch refused while a session runs; selection unchanged | `App.test.tsx` › *a switch is refused while a test session is running* ✅ |
| No active membership shows a reason, not an empty workspace | `App.test.tsx` › *an account with no active membership says so instead of showing a workspace* ✅ |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-04, no warnings |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-04; Vitest 11/11, Rust 25/25 |

Not verified in the running app: reaching the switcher needs a real keychain session, which needs a
live `GOOGLE_CLIENT_ID` + `TESTLAB_API_BASE_URL` (the same environment gap recorded for feat-006 and
feat-007). The jsdom tests exercise the switcher through the real component tree instead.

## Decisions

**A native `<select>`, not a custom dropdown.** Keyboard support, focus handling, screen-reader
semantics and the platform's own popup behaviour come free; the mockups have no switcher to match
(`design/README.md` — the 60px icon rail has no workspace affordance), so there is nothing to
diverge from. A custom listbox can replace it when a design exists.

**The active workspace is in-memory UI state, not keychain-persisted.** `plan.md` R21 defines it as
local UI state, and persisting it would mean a stale workspace surviving a membership revocation
that the backend has already applied. First `active` membership on launch.

**Scoping is enforced by remount (`key`), not by convention.** Screens land in feat-009 onward, none
of which exists yet; keying `<main>` on the workspace id means a screen written later cannot leak
prior-workspace state even if its author forgets, which is cheaper than a rule nobody sees.

## Scope held

- FR-056b (the server-side membership gate) is the backend's; the desktop surfaces its `403`s when
  a request path exists — feat-019's sync work, not this one.
- FR-056d is enforced with `runningSessions`, defaulting to `0`. No Test Session state exists yet:
  **feat-016 passes the real count** into `WorkspaceShell`. The guard, its message and its test are
  in place, so the wiring is one prop.
- FR-056c is satisfied vacuously today — a switch performs no write at all, and the test asserts the
  absence of any IPC call. It becomes a real invariant to defend once records exist (feat-009+).
