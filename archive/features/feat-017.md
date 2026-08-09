# feat-017 — Live log viewer, identical for iOS and Android

**FRs:** FR-029a (the live log viewer behaves identically whichever platform the connected device is)
**Depends on:** feat-015 (`device-desktop-ws` server) ✅
**By:** kevin-malik · **Closed:** 2026-08-10

## What landed

The Log Inspector screen (`desktop/src/LogInspector.tsx`), plus the one command it needed:
`ws::server::session_records(device_id, session_id)` returns a session's frames **as they came off
the wire**. `Sessions::records` already existed — the command is four lines around it.

- **Parity is structural, not promised.** Every row is derived by one pure `logRow(frame, index)`
  from *contract* fields only (`method`/`url`/`status_code`/`phase`, `level`/`tag`/`message`,
  `label`/`action_type`, `exception_type`). There is no `platform` branch anywhere in the render
  path, so an identical frame cannot render differently per SDK. The test asserts exactly that: the
  same frames tagged `iOS` and tagged `Android` derive equal rows.
- **The keyed pair is `(device_id, session_id)`** — the same one `Sessions` files under, so the
  session rail groups by device and a mid-run device switch is explicit (FR-021). Switching sessions
  swaps records; it never merges them.
- **An in-progress request is a visible row.** `phase: started` has no `status_code` yet, so the
  phase is shown instead of a fabricated status (FR-025's live half).
- **An unknown record type is still a row** (FR-000d) — shown with its type as the title rather than
  dropped, which is what makes a newer-minor SDK legible instead of silently thinner.
- **Three states are distinguished**, because they mean different things: no device connected, a
  connected device with no session id yet ("No session started"), and a session with no records yet.
- Flat chronological only, with a text filter and per-type chips. **Grouping under User Action is
  feat-018**, which is where FR-039b–e live.

## The design question it had to settle first

A `TestSession` row is minted by the desktop; a `session_id` on the wire is minted by the SDK. Only
one of them exists when a record arrives, so the viewer keys on the device's. Recorded as a dated
decision in `CONSTITUTION.md` (2026-08-10 · *The device names the WS session*), including why the
desktop's id is **not** pushed down at handshake.

## Deliberate simplifications

- The raw frame is shown as `JSON.stringify(frame, null, 2)`. The mockup's foldable JSON tree,
  Request/Response tabs and header table are polish FR-029a does not ask for.
- Both lists poll once a second (the pattern the Devices screen already uses). A Rust-side emit is
  the upgrade if a busy bench makes the latency visible.
- Records are still the in-memory ring (500 per session) from feat-015 — **feat-023** is what makes
  them survive a restart.

## One pre-existing test corrected

`App.test.tsx` asserted `queryByRole('status')` was null on every not-yet-built screen, as a proxy
for "no offline-grace refusal here". The Log Inspector's empty state is a legitimate `role="status"`,
so the assertion now names the refusal text it actually meant.

## Evidence

`./verify.sh build` → `HARNESS_VERIFY: PASS (build)` · `./verify.sh test` →
`HARNESS_VERIFY: PASS (test)`, Vitest **57/57** (7 new in `LogInspector.test.tsx`), Rust **67/67**.
Verified in jsdom against mocked IPC — a live device stream needs a real SDK peer, which is another
project's deliverable.
