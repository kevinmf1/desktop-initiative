# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-024 closed; nothing 🔵)
- **Status:** feat-024 complete. `TESTLAB_DEV_AUTH=1` now opens debug builds as `Local Developer`
  with two active local workspaces at the Rust auth boundary; it needs no Google/backend and release
  builds always return no development account. Detail: [archive](../archive/features/feat-024.md).
- **Last verify:** 2026-08-06 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`; release
  all-target check passed; Vitest 41/41, Rust 55/55.

## Next step

**feat-015** is ready (feat-013 ✅): bind `ws::pairing::WS_PORT` (8787) and implement the
`device-desktop-ws` server with at least two concurrent visible sessions, isolated by device and
session ID. At each handshake: check `device::reconnects(...)`; otherwise call
`ws::pairing::authorize()`; then `device::register(...)` and `device::admits(...)` before any record
reaches a viewer or store. Fill `device::Observation.platform` / `os_version` when reported.

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
  (Devices included) is verified in jsdom, not in the running app.
  `TESTLAB_OFFLINE_GRACE_DAYS` optionally overrides the 30-day default.

## Changes

_feat-009 … feat-024: rotated to [archive](../archive/features/). Latest session:
[2026-08-06-feat-024.md](../archive/sessions/2026-08-06-feat-024.md)._
