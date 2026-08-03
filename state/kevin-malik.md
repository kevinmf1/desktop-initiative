# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-007 closed; nothing 🔵)
- **Status:** feat-007 is complete — Auth Session cached in the OS keychain, membership snapshot,
  configurable 30-day offline grace, sign-out clearing local only.
  Detail: [archive](../archive/features/feat-007.md).
- **Last verify:** 2026-08-04 · `build` → **PASS** (no warnings) · `test` → **PASS** ·
  `lint` → not configured. Evidence: `HARNESS_VERIFY: PASS (build)` and
  `HARNESS_VERIFY: PASS (test)`; Vitest 7/7, Rust 25/25.

## Next step

Two features are ready (all `Depends on` ✅):

- **feat-008** — workspace switcher, and the natural continuation: the membership snapshot
  feat-007 caches is already returned to the webview on `Account.memberships`, unused. Needs the
  `active`-only filter (FR-056a), workspace-scoped data, no reattribution on switch, and a switch
  refused while a Test Session is running (FR-056d — no session state exists yet, so that guard
  lands with feat-016 or as a predicate feat-016 calls).
- **feat-013** — device pairing by QR / pairing code; independently ready, starts the device chain.

Note for feat-016: `auth_session::can_start_new_session()` is the FR-053a gate. It is *expressed*
on the Runner screen but not yet *enforced* at session start — that enforcement is feat-016's.

## Parked

- None.

## In flight elsewhere

- Backend, iOS SDK, Android SDK are **other people's projects** — not tracked here.

## Blockers

- None. Rust toolchain is at `~/.cargo/bin` and not on a non-login shell's `PATH`; `verify.sh`
  prepends it, so no action needed.
- Two env vars are needed to run auth end-to-end against a live backend: `GOOGLE_CLIENT_ID`
  (feat-006) and `TESTLAB_API_BASE_URL` (feat-007). Both are reported as clear errors when absent,
  so their absence blocks nothing in the harness. `TESTLAB_OFFLINE_GRACE_DAYS` optionally overrides
  the 30-day default.

## Changes

| File | Change | Why |
|------|--------|-----|
| `desktop/src-tauri/src/auth_session.rs` | New module: keychain-cached Auth Session, membership snapshot, offline grace, sign-out | feat-007 core — FR-052a/053/053a/054 |
| `desktop/src-tauri/src/auth.rs` | `sign_in_with_google` returns `Account`, consumes the proof via the existing Rust-only handoff | Chains feat-006 into the backend exchange without exposing the ID token to the webview |
| `desktop/src-tauri/src/lib.rs` | Registers `cached_account` + `sign_out` | New commands must be invocable |
| `desktop/src-tauri/Cargo.toml` | Adds `keyring` 4 and `time` (`serde-well-known`) | OS keychain (FR-052a) and RFC 3339 grace arithmetic; `time` was already in the graph |
| `desktop/src/App.tsx` | Restore-from-keychain on mount, account footer + sign-out, Runner re-auth gate | Offline launch (SC-022) and the FR-053a gate made visible |
| `desktop/src/__tests__/App.test.tsx` | Rewritten to route IPC per command; 5 new tests | Covers offline restore, the grace gate, and both sign-out outcomes |
| `FEATURES.md` · `archive/features/feat-007.md` | feat-007 → ✅ with evidence; epic 3/20 → 4/20 | Definition of done |

_Earlier sessions: [2026-08-03-feat-006.md](../archive/sessions/2026-08-03-feat-006.md)._
