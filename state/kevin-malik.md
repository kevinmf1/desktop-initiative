# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** none — feat-021 ✅.
- **Status:** Capture relay complete. Validated, resumable WebSocket chunks are persisted and ACKed;
  verified bytes retry through upload-url → object PUT → confirm on an outbox independent from Bug
  metadata. The Bugs screen shows Receiving / Pending upload / Uploaded, and concurrent record/media
  drains cannot overwrite a newer `remote_ref`. Detail: [archive](../archive/features/feat-021.md).
- **Last verify:** 2026-08-10 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`;
  Vitest 68/68, Rust 91/91.

## Next step

- **feat-022** (reporting, FR-033/034) is the sole remaining row. It reads `severity` / `status` /
  `environment` off the bug
  record plus `Session Case Result` for pass/fail by plan. Every figure is computed locally
  (SC-007); the contract's `/v1/reports/*` routes are the cross-device version, not needed here.

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

| File | What | Why |
|------|------|-----|
| `desktop/src-tauri/src/capture.rs` | validated resumable store, checksum gate, media outbox, IPC commands, 5 tests | FR-044/044a: durable local receipt and confirmed backend upload with retry |
| `desktop/src-tauri/src/ws/server.rs` · `lib.rs` | binary/control pairing, ACK/NACK, capture dir + timer wiring, WS test | the first chunk is durable and resumable from app startup |
| `desktop/src-tauri/src/sync.rs` | capture metadata records plus race-safe confirmation merge, 3 tests | FR-044b: Bug metadata never waits for or overwrites binary state |
| `desktop/src/Bugs.tsx` · tests | attached list, three transfer states, independent Sync now | evidence-in-transit is visible rather than absent |
| `archive/features/feat-021.md` · `FEATURES.md` | feat-021 evidence archived and row closed | definition of done |
