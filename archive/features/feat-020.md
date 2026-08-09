# feat-020 — Bug record + evidence

**FRs:** FR-030 (per-bug field set), FR-030a (severity P0–P3), FR-030b (status Open / In Progress /
Resolved / Closed / Won't Fix, default Open), FR-031 (attached evidence: marker, log excerpt,
preceding User Actions, screenshots/recordings), FR-032 (configurable time-based window, ±30s default)
**Depends on:** feat-019 ("Bug Occurred" marker) ✅
**By:** kevin-malik · **Closed:** 2026-08-10

## What landed

feat-019's marker grew into the record it bookmarks, plus the Bugs screen that shows it.

- **`bug.rs` — the record.** `Bug` gains `description`, `severity` (`Severity` P0–P3),
  `status` (`Status`, wire-spelled `"In Progress"` / `"Won't Fix"` exactly as the spec writes them),
  `test_case_id`, `test_plan_id`, `build_version`, `environment`, `window_seconds`. `summary` became
  `title` with `#[serde(alias = "summary")]`.
- **Capture vs triage.** Marking stays *one field* (FR-013 is unchanged): everything already true of
  the run — plan, build version, environment — is **copied off the session** at mark time, and the
  judgement fields (severity, status, description, related case) are set afterwards through the new
  `edit` / `update_bug`. A fresh marker is `Open` / `P2`: recorded, not yet judged.
- **The observation is not editable.** `BugEdit` has no field that can reach `marked_at`,
  `test_session_id`, `device_id` or `build_version`. A record whose observation can be rewritten is
  not evidence, so that is enforced by the shape of the patch rather than by the UI.
- **FR-032 — the window is the configuration.** `window_seconds` is per-bug (1…3600, default 30) and
  `window_start`/`window_end` are always recomputed from `marked_at`, never from the previous
  bounds, so repeated edits cannot drift the window off the moment it is centred on. Because the
  window is a bookmark, widening it **re-reads** the session's frames — nothing is re-captured.
- **FR-031 — evidence is derived, never stored.** `Bugs.tsx` resolves frames by `device_id` (the
  device names the WS session — CONSTITUTION 2026-08-10 — so a bug, which knows the *desktop's*
  session id, narrows by device and by time), then `withinWindow` selects the excerpt and
  `precedingActions` the User Actions up to the marker. The excerpt is rendered through the Log
  Inspector's own `logRow` + `groupRows` (feat-018), so an excerpt reads exactly like the live view
  it was cut from — there is no second idea of what a record looks like.
- **A frame with no timestamp is left out**, not guessed into the window: the contract gave it no
  place in time, and inventing one would put a record in evidence that may not belong there.

Backwards compatible: a `bugs.json` written by feat-019 loads as a valid untriaged record
(`serde(default)` on every new field, `alias = "summary"`), covered by a test that parses the exact
JSON feat-019 wrote.

## Deliberate simplifications

- **No new Rust command for evidence.** The existing `device_sessions` + `session_records` already
  return the frames; the window filter is three lines of TypeScript next to the `logRow` that
  already knows which key a frame's timestamp lives under. A Rust-side resolver would have had to
  re-implement that per-record-type timestamp lookup.
- **Evidence is loaded on select, not polled.** A marked moment is in the past; the Log Inspector is
  where a live run is watched.
- **Text fields commit on blur, selects immediately.** A keystroke-per-write would rewrite the whole
  JSON store per character. Upgrade path is the same one `test_session.rs` has.
- **Attachments are named, not faked.** FR-031 lists screenshots/recordings; FR-044 (feat-021) is
  what moves the binary off the device. The Attached captures section says so rather than showing an
  empty area that reads as "none were taken".
- **Records still live only in memory** (capped 500/session, `ws::server::Sessions`), so an excerpt
  for a bug marked before a restart is empty and says why. feat-023 is what makes it survive.

## Evidence

`./verify.sh build` → `HARNESS_VERIFY: PASS (build)` · `./verify.sh test` →
`HARNESS_VERIFY: PASS (test)` (2026-08-10). Vitest 66/66 (4 new in `Bugs.test.tsx`), Rust 73/73
(3 new in `bug.rs`).

Rust: window recomputed from `marked_at` on repeated edits, refusals for a foreign workspace / blank
title / out-of-range window, `"Won't Fix"` and `"In Progress"` round-trip, and a feat-019 `bugs.json`
loading as Open/P2.
Webview: the window selects the excerpt and excludes both an out-of-window frame and an
untimestamped one; preceding actions stop at the marker; the detail shows the copied run facts,
grouped excerpt and Active-only case picker; triage sends a one-field patch and reports the Rust
refusal.

## Follow-ups

- feat-021 (capture relay) attaches screenshots/recordings to these records — FR-044a's "pending
  upload" state is what the Attached captures section becomes.
- feat-022 (reporting) reads `severity` / `status` / `environment` for "bugs by environment".
- feat-023 makes the frames an excerpt is cut from survive a restart.
