# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-019 closed; nothing 🔵)
- **Status:** feat-019 complete. New `bug.rs` store + a one-field marker form on the Runner's running
  session card. FR-013's three clauses are structural, not conventional: `mark(bugs, sessions, …)`
  takes `&[TestSession]` so a marker **cannot** stop a run; the bug stores `window_start`/`window_end`
  = `marked_at ± 30s` (a bookmark, so the frames it points at include the ones that arrive *after*
  the click); and it carries `(test_session_id, device_id)` — the SDK-reported id `Sessions` files
  records under, so the window resolves with no translation table. `test_session::load` is now
  `pub(crate)` so `mark_bug` validates against real sessions. Marking never calls
  `onSessionsChanged`. Detail: [archive](../archive/features/feat-019.md).
  feat-018: [archive](../archive/features/feat-018.md).
- **Last verify:** 2026-08-10 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`;
  Vitest 62/62, Rust 70/70.

## Next step

Two features are ready:

- **feat-020** (bug record + evidence, FR-030/030a/030b/031/032) — the direct continuation. It fills
  in the record `bug.rs` now creates: full field set, severity P0–P3, status Open → Won't Fix
  (default Open), and the log excerpt + preceding User Actions pulled from the window feat-019 stores.
  The ±30s is already a per-bug field pair (`WINDOW_SECONDS` is the only fixed part), so making it
  configurable is an input, not a migration. `groupRows` (feat-018) is what turns the window's frames
  into the "preceding User Actions" list.
- **feat-023** (local-first store + `sync-api` client) is independent and is what makes captured
  frames survive a restart — `Sessions` is still in memory, capped at 500 frames per session, and
  `bugs.json` / `test-sessions.json` are still whole-file rewrites.
- Not yet ready: feat-021 (needs 020 + 023), feat-022 (needs 020).

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
| `desktop/src-tauri/src/bug.rs` | new: `Bug`, `mark`, `visible`, `list_bugs`, `mark_bug`, 3 tests | FR-013: the marker store. `&[TestSession]` is what makes "keeps the session running" a type, not a promise |
| `desktop/src-tauri/src/test_session.rs` | `load` → `pub(crate)` | `mark_bug` must validate the id against real sessions, not trust the webview |
| `desktop/src-tauri/src/lib.rs` | `pub mod bug` + both commands registered | a command not in `generate_handler!` is invisible to the webview |
| `desktop/src/Runner.tsx` | `Bug` type, `BugMarker` form, marker list + bug count on the card, `mark()` | FR-013 on screen: one field, no dialog, and the window shown as what it is — a bookmark |
| `desktop/src/__tests__/Runner.test.tsx` | 2 new tests (62 total) | marker IPC + session stays running; refusal reported and no marker form on a stopped card |
| `FEATURES.md` · `archive/features/feat-019.md` | feat-019 ✅ + evidence | definition of done |
