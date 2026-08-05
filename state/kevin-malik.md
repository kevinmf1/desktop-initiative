# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-014 closed; nothing 🔵)
- **Status:** feat-014 complete. `device.rs` is the registry: `devices.json` under the app data dir,
  `AccessPolicy` defaulting to `Allowlist`, `register()` (operator's name/enabled/registered_at kept
  across a re-pair), `admits()` (disabled rejects under *either* policy), `reconnects()` (SHA-256 of
  the credential `authorize()` minted — never the plaintext), plus rename/enable/remove commands.
  The Devices screen gained a *Registered devices* panel under the pairing panel. Detail:
  [archive](../archive/features/feat-014.md).
- **Last verify:** 2026-08-06 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`; Vitest
  41/41, Rust 54/54.

## Next step

**feat-015** is ready (feat-013 ✅): the `device-desktop-ws` server — ≥2 concurrent visible device
sessions, state and logs isolated per device + session ID (FR-021). It is the **only** place the
feat-014 registry gets wired, in this order (documented on `pairing::Authorized`):

1. `hello.reconnect_credential` present → `device::reconnects(...)`; true means back in without a
   token and `authorize()` is not called.
2. `ws::pairing::authorize()` — the trust gate.
3. `device::register(...)` then `device::admits(...)` — record the pairing, then apply the
   `open`/`allowlist` filter *before* any record reaches a viewer or store (SC-008).

It also fills `device::Observation.platform` / `os_version`, which is what makes FR-022 show
something other than "Not reported yet". Bind `ws::pairing::WS_PORT` (8787) — the QR already
advertises it. `desktop/src-tauri/src/ws/mod.rs` holds `negotiate_handshake()` from feat-005.

Wiring owed by later features:

- **feat-016** passes a real running-session count into `WorkspaceShell`'s `runningSessions` prop —
  the FR-056d guard, message and test already exist and default to `0`. feat-016 also owns
  *enforcing* `auth_session::can_start_new_session()` (FR-053a) at session start.
- **feat-019** surfaces the backend's FR-056b `403` when the cached membership snapshot is stale.
- **feat-023** replaces `test_case.rs` / `test_plan.rs` / `device.rs`'s `load`/`save` (one JSON file
  each under the app data dir) with the rusqlite store research.md R2 specifies, migrating those
  files once. `crate::store_path(app, file)` in `lib.rs` is the single place the paths come from.

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

_feat-009 … feat-013: rotated to [archive](../archive/features/)._

### feat-014

| File | Change | Why |
|------|--------|-----|
| `desktop/src-tauri/src/device.rs` | new — `Registry`/`Device`/`AccessPolicy`/`ObservedPlatform`, `register`, `admits`, `reconnects`, `rename`, `set_enabled`, `remove`, five commands, 7 tests | FR-015/017/018/019/022; the policy half is pure, so feat-015 only has to call it at the gate |
| ” | `admits` checks the row before the policy | Reading `open` as "admits everyone" would make disabling a no-op the moment somebody flips the policy (FR-018) |
| ” | `register` keeps display name, `enabled`, `registered_at` | Otherwise a device undoes its own disabling just by pairing again |
| ” | credential stored as SHA-256, never plaintext | The desktop only needs to *recognise* a returning device, never replay its secret (FR-020) |
| ” | policy is app-wide, marked `ponytail:` | FR-017 asks for "a device access policy"; one desktop is one bench. Per-workspace column when that changes |
| `desktop/src-tauri/src/lib.rs` | `store_path(app, file)` hoisted; `device::*` commands registered | Two byte-identical private copies existed; `device.rs` would have been the third |
| `desktop/src-tauri/src/test_case.rs` · `test_plan.rs` | use `crate::store_path` | Same hoist — one function for feat-023 to replace |
| `desktop/src-tauri/src/ws/pairing.rs` | `Authorized` doc names the three calls feat-015 owes, in order | The gate can be wired half-way; the order (reconnect → authorize → register+admit) is the part that matters |
| `desktop/src/Devices.tsx` | *Registered devices* panel: policy select, name/ID/platform/status rows, Disable/Enable, Remove, empty state; `workspaceId` prop | FR-015/017/018/022 in one place under the pairing panel; the copy says the list filters and pairing is what establishes trust |
| `desktop/src/App.tsx` | passes `workspaceId`, Devices owns its scrolling | The screen is now taller than the viewport |
| `desktop/src/__tests__/Devices.test.tsx` | stateful IPC mock + 5 new tests | The screen drives two stores now; a disable must be visible on the next list |
| `desktop/src/__tests__/App.test.tsx` | call-order assertion wrapped in `waitFor` | It raced the landing screen's reads — passed alone, failed under a fuller suite |
| `FEATURES.md` · `archive/features/feat-014.md` | feat-014 → ✅ with evidence; epic 10/20 → 11/20 | Definition of done |

_Session detail: [2026-08-06-feat-014.md](../archive/sessions/2026-08-06-feat-014.md). Earlier:
[2026-08-06-feat-013.md](../archive/sessions/2026-08-06-feat-013.md)._
