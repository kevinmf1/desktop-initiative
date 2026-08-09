# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-016 closed; nothing 🔵)
- **Status:** feat-016 complete. The Runner screen starts a session from a plan or ad hoc cases
  (build, server, platform, registered device) with a guaranteed-unique id, and Stop *is* the
  Passed/Failed/Blocked/Incomplete prompt — nothing is written until a result is picked. Sessions
  live in `test-sessions.json` and key on the SDK's stable `device_id`, the same key
  `ws::server::Sessions` files records under. Two shell fixes came with it: FR-056d now counts real
  running sessions from the store, and FR-053a stopped blanking the whole Runner.
  Detail: [archive](../archive/features/feat-016.md).
- **Last verify:** 2026-08-10 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`;
  Vitest 50/50, Rust 67/67.

## Next step

Three features are ready — **feat-017** is the one to take:

- **feat-017** (live log viewer, FR-029a). Start in `desktop/src-tauri/src/ws/server.rs`:
  `Sessions::records(device_id, session_id)` already returns a session's raw frames and
  `device_sessions` already lists the sessions, so the screen is mostly reading. Its one real
  design question first: a `TestSession` row has no WS **session id** — the device supplies that at
  handshake, but the desktop mints its run before the device is told to start. Decide which side
  names the run before writing the viewer.
- **feat-019** (Bug Occurred marker) is unblocked once feat-017 lands; **feat-023** (local-first
  store + `sync-api` client) is independent and is what makes captured frames survive a restart —
  `Sessions` is in memory, capped at 500 frames per session.

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
[2026-08-10-feat-016.md](../archive/sessions/2026-08-10-feat-016.md)._
