# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-015 closed; nothing 🔵)
- **Status:** feat-015 complete. The desktop is now a WS server on `0.0.0.0:8787`, up from
  `.setup()`. Every handshake runs the gate in order (disabled → reconnect credential → pairing
  token → register → access policy) and every record is filed under `(device_id, session_id)`, so
  two devices — or one device in two sessions — never share state. Devices screen shows the live
  sessions. Detail: [archive](../archive/features/feat-015.md).
- **Last verify:** 2026-08-10 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`;
  Vitest 43/43, Rust 62/62.

## Next step

Two features are ready now that feat-015 is ✅ — pick one:

- **feat-017** (log viewer, FR-029a) is the shorter hop: `ws::server::Sessions::records(device_id,
  session_id)` already returns the raw frames per session, and `device_sessions` already lists the
  sessions. It needs a screen that reads one session's records and renders them identically for iOS
  and Android.
- **feat-023** (local-first store + `sync-api` client) is what makes those sessions survive a
  restart — today `Sessions` is in memory, capped at 500 frames per session.

Either way, start from `desktop/src-tauri/src/ws/server.rs` — its module doc says what it owns and
what it deliberately leaves to those two features.

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
[2026-08-10-feat-015.md](../archive/sessions/2026-08-10-feat-015.md)._
