# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-017 closed; nothing 🔵)
- **Status:** feat-017 complete. The Log Inspector screen streams a session's frames flat and
  chronologically, keyed on `(device_id, session_id)` — the pair `ws::server::Sessions` files under —
  with a session rail grouped by device, a text filter and per-type chips. Parity (FR-029a) is
  structural: one pure `logRow(frame, index)` derives every row from contract fields, with no
  `platform` branch in the render path. New command: `ws::server::session_records`. The naming
  question is settled in `CONSTITUTION.md` (2026-08-10 · *The device names the WS session*): the
  device names the run, the desktop's Test Session id stays its own name for it.
  Detail: [archive](../archive/features/feat-017.md).
- **Last verify:** 2026-08-10 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`;
  Vitest 57/57, Rust 67/67.

## Next step

Three features are ready — **feat-018** is the natural continuation:

- **feat-018** (grouped log view, FR-039b–e). Everything is already in `LogInspector.tsx`: rows come
  from `logRow`, and `user_action` frames carry `action_id` while `log_event` / `app_log` carry the
  `action_id` they belong to (`null` → "Unattributed", never dropped). Group *those*, keep empty
  groups, and make the existing filter apply inside groups while hiding groups with no match.
- **feat-019** (Bug Occurred marker) is now unblocked — it needs the correlation the constitution
  defers to `test_case_push`, so read that decision first. **feat-023** (local-first store +
  `sync-api` client) is independent and is what makes captured frames survive a restart —
  `Sessions` is still in memory, capped at 500 frames per session.

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
| `desktop/src-tauri/src/ws/server.rs` | `session_records` command | FR-029a: the viewer asks for one session's frames by its `(device_id, session_id)` key |
| `desktop/src-tauri/src/lib.rs` | registered `session_records` | a command not in `invoke_handler` does not exist to the webview |
| `desktop/src/LogInspector.tsx` | **new** — the Log Inspector screen + `logRow` / `matches` | FR-029a: rows derived from contract fields only, so iOS and Android cannot diverge |
| `desktop/src/App.tsx` | `logs` renders `LogInspector`, full-bleed | the screen was a placeholder |
| `desktop/src/__tests__/LogInspector.test.tsx` | **new** — 7 tests | parity, tone thresholds, session isolation, filter-keeps-selection, three empty states |
| `desktop/src/__tests__/App.test.tsx` | assert the refusal text, not `role="status"` | the Log Inspector's empty state is a legitimate status and is not a refusal |
| `CONSTITUTION.md` | decision · the device names the WS session | two ids named the same run; only one exists when a record arrives |
| `FEATURES.md` · `archive/features/feat-017.md` | feat-017 ✅ + evidence | definition of done |
