# feat-019 — "Bug Occurred" marker mid-session

**FRs:** FR-013 (record a "Bug Occurred" marker during an active session that creates a bug record,
captures/bookmarks a window of activity around that moment, and keeps the session running)
**Depends on:** feat-016 (manual test runner) ✅ · feat-017 (live log viewer) ✅
**By:** kevin-malik · **Closed:** 2026-08-10

## What landed

A new store module `desktop/src-tauri/src/bug.rs` plus a one-field marker form on the Runner's
running session card. Three FR-013 clauses, three deliberate design choices:

- **"keeps the session running"** — `mark(bugs, sessions, …)` takes `&[TestSession]`, never `&mut`.
  A marker *cannot* stop a run, by type, not by convention. The webview half matches: `mark()` in
  `Runner.tsx` updates only `bugs` and never calls `onSessionsChanged`, so the session list is not
  even re-fetched, let alone changed.
- **"bookmarks a window of activity"** — the bug stores `window_start` / `window_end` =
  `marked_at ± WINDOW_SECONDS` (30), not a copy of the records. The frames it points at are whatever
  the session streamed in that range, before **and** after the click — a copy taken at click time
  could only ever hold the "before" half.
- **"creates a bug record"** — the marker carries `(test_session_id, device_id)`, `device_id` copied
  off the session. That is the same SDK-reported id `ws::server::Sessions` files records under
  (CONSTITUTION 2026-08-10), so the window resolves to real frames with no translation table, and it
  survives a later rename or edit of the session row.

Refusals: a session that is not in the workspace → "That session no longer exists."; a stopped one →
"That session has been stopped — a bug marker needs a running session." The UI enforces the same
thing structurally — the marker form renders only on a running card — and still reports the Rust
error, because a session can be stopped in another window between render and click.

`test_session::load` became `pub(crate)` so `mark_bug` can validate against the real sessions rather
than trusting an id from the webview.

## Deliberate simplifications

- **No Bugs screen.** feat-020 owns the bug record (full field set, severity P0–P3, status, log
  excerpt, preceding User Actions, configurable window). This feature ships the marker and its
  window only; markers are listed inline on the session card that produced them.
- **The window is fixed at ±30s.** FR-030b's *configurable* window is feat-020's. `window_start` /
  `window_end` are already per-bug fields, so that lands as an input, not a migration.
- **The summary is optional**, defaulting to "Bug occurred" — the moment is what FR-013 asks to
  capture; the description is feat-020's field set.
- **No dialog, no confirm step.** One input and one button on the card: a marker is worth nothing if
  clicking it interrupts the run being observed.
- Same one-JSON-file store as `test_session.rs` (`bugs.json`, rewritten whole per save) — feat-023
  replaces all of them at once.
- Bug tone follows the mockup (`qa-runner.jsx` uses `warn` for its Bug badge). There is no Bugs
  mockup in any generation (`design/README.md`), so the card styling follows the Runner's own.

## Evidence

`./verify.sh build` → `HARNESS_VERIFY: PASS (build)` · `./verify.sh test` →
`HARNESS_VERIFY: PASS (test)`, Vitest **62/62** (2 new in `Runner.test.tsx`: marker sends the right
IPC, session stays running and the marker shows its window; a refused marker is reported and a
stopped card offers no marker form), Rust **70/70** (3 new in `bug.rs`: window + session untouched;
refusals; id collision + default summary). Verified in jsdom against mocked IPC and in Rust unit
tests — resolving the window against a live device stream needs a real SDK peer, which is another
project's deliverable.
