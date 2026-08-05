# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-013 closed; nothing 🔵)
- **Status:** feat-013 complete. The Devices screen mints a pairing invite: QR (`ws_url` + token +
  contract version) plus the same token as a typable 9-digit code, live TTL countdown, Refresh.
  `ws::pairing` holds one active token in memory — single use via `consumed_at`, 5-minute TTL,
  refresh overwrites the slot, five wrong guesses burn it, and `device_id` is never the trust
  decision. Detail: [archive](../archive/features/feat-013.md).
- **Last verify:** 2026-08-06 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`; Vitest
  36/36, Rust 47/47.

## Next step

**feat-014** is ready (feat-013 ✅): device registry — display name + stable device ID,
enable/disable without deleting, persistence across restarts, `open`/`allowlist` policy (default
`allowlist`), observed platform. It owns storing and re-verifying the `reconnect_credential` that
`ws::pairing::authorize()` already mints, and the registered+enabled filter `authorize()`
deliberately does not apply. Devices has no canonical mockup (`design/README.md`); extend
`desktop/src/Devices.tsx`, which currently holds only the pairing panel.

Wiring owed by later features:

- **feat-016** passes a real running-session count into `WorkspaceShell`'s `runningSessions` prop —
  the FR-056d guard, message and test already exist and default to `0`. feat-016 also owns
  *enforcing* `auth_session::can_start_new_session()` (FR-053a) at session start.
- **feat-019** surfaces the backend's FR-056b `403` when the cached membership snapshot is stale.
- **feat-023** replaces `test_case.rs`'s `load`/`save` (one JSON file under the app data dir) with
  the rusqlite store research.md R2 specifies, migrating that file once. Ceiling of the current
  store is in the module's `ponytail:` header.

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
  (Test Cases included) is verified in jsdom, not in the running app.
  `TESTLAB_OFFLINE_GRACE_DAYS` optionally overrides the 30-day default.

## Changes

_feat-009: rotated to [archive](../archive/features/feat-009.md)._
_feat-010: rotated to [archive](../archive/features/feat-010.md)._
_feat-011: rotated to [archive](../archive/features/feat-011.md)._
_feat-012: rotated to [archive](../archive/features/feat-012.md)._

### feat-013

| File | Change | Why |
|------|--------|-----|
| `desktop/src-tauri/src/ws/pairing.rs` | new — `PairingToken`, `PairingState`, `mint`, `authorize`, `invite`, `local_ws_url`, `mint_pairing_invite` | FR-020a's whole lifecycle is pure and testable without a socket; the WS listener (feat-015) only has to call `authorize()` after `negotiate_handshake()` |
| ” | one active token in a `Mutex<Option<…>>`, overwritten by `mint` | Makes "refresh invalidates the previous" structural — the old token is gone, not flagged stale, so no later reader can forget to check |
| ” | `authorize` reads `device_id` but never gates on it; refuses when no token is presented | FR-020: the ID filters for the registry, the token is the only trust |
| ” | five wrong codes clear the slot | A 9-digit manual code must not be a brute-force oracle; the tester just refreshes |
| ” | `local_ws_url` via a connectionless `UdpSocket` | Learns the outward-routing LAN address with no dependency and nothing sent (FR-016: no IP to type) |
| `desktop/src-tauri/src/ws/mod.rs` | `HelloHandshake` gains `device_id`, `pairing_token`, `reconnect_credential`, all `#[serde(default)]` | The fields the contract's `hello` already defines; defaulted so feat-005's version negotiation and its tests are untouched |
| `desktop/src-tauri/Cargo.toml` | `qrcode` (no default features) | Follows the 2026-08-04 rule — encoded formats are produced in Rust and cross the IPC as plain data; no JS QR library, no `dangerouslySetInnerHTML` |
| `desktop/src/Devices.tsx` | new — QR as SVG `<rect>`s from the module grid, grouped code, countdown, Refresh, expired/error states | FR-016 default flow; an elapsed TTL must stop offering a code the device would be nacked for |
| `desktop/src/App.tsx` | Devices placeholder → real screen; `feature` label → `feat-013 / feat-014` | The screen exists now |
| `desktop/src/__tests__/Devices.test.tsx` | new — 5 tests | Render path + the countdown/grouping boundaries; jsdom, since the screen sits behind sign-in |
| `FEATURES.md` · `archive/features/feat-013.md` | feat-013 → ✅ with evidence; epic 9/20 → 10/20 | Definition of done |

_Session detail: [2026-08-06-feat-013.md](../archive/sessions/2026-08-06-feat-013.md). Earlier:
[2026-08-06-feat-012.md](../archive/sessions/2026-08-06-feat-012.md)._
