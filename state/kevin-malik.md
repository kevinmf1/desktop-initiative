# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-008 closed; nothing 🔵)
- **Status:** feat-008 is complete — workspace switcher over the `active`-only membership filter,
  content scoped to the active workspace by remount, switch refused while a session runs.
  Detail: [archive](../archive/features/feat-008.md).
- **Last verify:** 2026-08-04 · `build` → **PASS** (no warnings) · `test` → **PASS** ·
  `lint` → not configured. Evidence: `HARNESS_VERIFY: PASS (build)` and
  `HARNESS_VERIFY: PASS (test)`; Vitest 11/11, Rust 25/25.

## Next step

Two features are ready (all `Depends on` ✅):

- **feat-009** — Test Case CRUD (FR-003/003a/003b/003c). The first screen with real data, so it also
  decides where workspace-scoped records live (nothing persists app data yet — feat-007's keychain
  holds only the Auth Session). Read `design/README.md` first and attach
  `qa-tokens.jsx` + `qa-ui.jsx` + `qa-test-cases.jsx`, nothing else. Derived summary status is
  **computed on read**, never stored.
- **feat-013** — device pairing by QR / pairing code; independently ready, starts the device chain.

Wiring owed by later features:

- **feat-016** passes a real running-session count into `WorkspaceShell`'s `runningSessions` prop —
  the FR-056d guard, message and test already exist and default to `0`. feat-016 also owns
  *enforcing* `auth_session::can_start_new_session()` (FR-053a) at session start; the Runner screen
  only expresses it today.
- **feat-019** surfaces the backend's FR-056b `403` when the cached membership snapshot is stale.

## Parked

- None.

## In flight elsewhere

- Backend, iOS SDK, Android SDK are **other people's projects** — not tracked here.

## Blockers

- None. Rust toolchain is at `~/.cargo/bin` and not on a non-login shell's `PATH`; `verify.sh`
  prepends it, so no action needed.
- Two env vars are needed to run auth end-to-end against a live backend: `GOOGLE_CLIENT_ID`
  (feat-006) and `TESTLAB_API_BASE_URL` (feat-007). Both are reported as clear errors when absent,
  so their absence blocks nothing in the harness — but it does mean anything behind sign-in
  (the switcher included) is verified in jsdom, not in the running app.
  `TESTLAB_OFFLINE_GRACE_DAYS` optionally overrides the 30-day default.

## Changes

| File | Change | Why |
|------|--------|-----|
| `desktop/src/App.tsx` | `switchableWorkspaces()` — `active`-only membership filter | FR-056a; `invited`/`removed` are not workspaces the user is in |
| `desktop/src/App.tsx` | `workspaceSwitchRefusal()` + refusal alert in the shell | FR-056d, with `runningSessions` defaulting to 0 until feat-016 wires the real count |
| `desktop/src/App.tsx` | Native `<select aria-label="Workspace">` in the rail, replacing the wordmark | FR-056a switcher; no mockup exists, so platform semantics win |
| `desktop/src/App.tsx` | `activeWorkspaceId` UI state + `<main key={activeWorkspaceId}>` | FR-001 — a switch discards screen state by construction, so later screens can't leak |
| `desktop/src/App.tsx` | `role="status"` empty state when no membership is `active` | An invited-only account must say why, not show an empty workspace |
| `desktop/src/__tests__/App.test.tsx` | 4 new tests (11 total) | Covers the filter, re-scoping with zero IPC (FR-056c), the refusal, the empty state |
| `FEATURES.md` · `archive/features/feat-008.md` | feat-008 → ✅ with evidence; epic 4/20 → 5/20 | Definition of done |

_Earlier sessions: [2026-08-03-feat-006.md](../archive/sessions/2026-08-03-feat-006.md)._
