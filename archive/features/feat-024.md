# feat-024 — Debug-only local authentication

- **Status:** ✅ done · closed 2026-08-06 · **Depends on:** feat-007
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Purpose:** Manual validation of authenticated standalone desktop features without Google or a
  backend; this is development tooling, not a product-auth requirement.

## Done when

- `TESTLAB_DEV_AUTH=1` gives a debug Tauri build a stable local user and two active workspaces.
- The account originates at the Rust auth boundary, so the webview and Rust audit metadata observe
  the same identity.
- The mode requires neither `GOOGLE_CLIENT_ID` nor `TESTLAB_API_BASE_URL` and makes no auth network
  request.
- Without the flag, cached-session and Google/backend authentication remain unchanged.
- Release builds cannot enable the bypass.
- The launch command and the limits of this mode are documented.

## What landed

- `desktop/src-tauri/src/auth_session.rs`
  - `cached_account()` returns `Local Developer` only when the runtime flag is exactly `1`.
  - The local account owns `Local Workspace Alpha` and `Local Workspace Beta`, both active/admin, so
    local CRUD, workspace isolation and switching can be exercised manually.
  - The runtime branch that reads the flag is guarded by `cfg(debug_assertions)`; the release
    implementation of `development_account()` always returns `None`.
  - Local sign-out is refused with an instruction to stop the app and unset the flag, avoiding any
    keychain or backend access and preventing a misleading signed-out state that reverts on restart.
  - A pure unit test covers explicit opt-in, account identity, both memberships and the new-session
    gate without mutating process-wide environment variables.
- `specs/frontend/quickstart.md` documents macOS/Linux and PowerShell launch commands and clearly
  separates standalone proof from Google/backend/SDK integration proof.
- `CONSTITUTION.md` records the debug-only exception while preserving Google SSO as the sole product
  authentication path.

## Evidence

| Check | Result |
|---|---|
| No implicit enable; only value `1` opts in | `auth_session::tests::debug_local_auth_is_explicit_and_supplies_two_active_workspaces` ✅ |
| Stable local user + two active workspaces + new sessions allowed | same Rust unit test ✅ |
| Release targets compile with the runtime bypass fixed to `None` | `cargo check --release --all-targets --manifest-path desktop/src-tauri/Cargo.toml` ✅ |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-06 |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-06; Vitest 41/41, Rust 55/55 |

## Decisions

**The bypass lives in Rust, not React.** Test Case audit metadata reads `cached_account()` inside
Rust. Mocking only the component tree would show an authenticated shell while privileged commands
still saw no user.

**The flag is explicit and debug-only.** A `.env` file or default-on development identity could
silently make integration testing exercise the wrong auth path. Exact `TESTLAB_DEV_AUTH=1` plus
`cfg(debug_assertions)` makes both opt-ins visible.

**Two workspaces are part of the fixture.** One workspace would unblock CRUD but could not manually
exercise the already-shipped workspace switcher and storage isolation.

## Scope held

- No fake backend, fake Google token, session token or keychain entry was introduced.
- This is not evidence for OAuth, backend session minting, `401`/`403`, sync, upload or SDK traffic.
- No production UI or product specification was changed; Google SSO remains the only release path.
