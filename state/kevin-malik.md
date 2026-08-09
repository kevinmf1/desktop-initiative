# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-023 closed; nothing 🔵)
- **Status:** feat-023 complete. Records are durable now: every frame is appended to a per-device
  JSONL log (`frames.rs`), so a bug's excerpt survives a restart while staying *derived* — widening a
  window still re-reads rather than re-captures. Two rules carry the rest: **clearing is retention**
  (`clear_device_logs` keeps every frame inside *any* bug's window, across workspaces), and **the
  outbox is a derived view**, not a queue — every record whose `synced_at` is null, pushed in one
  `POST /v1/sync/batch` with a replay-stable `Idempotency-Key`. Unreachable/unconfigured/signed-out
  is a `SyncReport { offline, queued }`, never an error, and nothing is marked. FR-036's dedup uses
  the contract's own per-type key and its `seen` set outlives a log clear.
  Detail: [archive](../archive/features/feat-023.md). feat-020: [archive](../archive/features/feat-020.md).
- **Previously:** feat-020 complete. feat-019's marker became the full record (FR-030…032) plus a new
  **Bugs screen**. Two things carry the design: **capture vs triage** — marking still takes one
  field, the run's own facts (plan, build, environment) are *copied off the session* at mark time,
  and severity/status/description/related case are set afterwards through `edit`/`update_bug`, whose
  patch has **no field that can reach the observation** (`marked_at`, session, device, build). And
  **evidence is derived, never stored** — `window_seconds` (1…3600, default 30) is the FR-032
  configuration, `window_start`/`window_end` are always recomputed from `marked_at` so repeated
  edits cannot drift, and widening the window *re-reads* frames rather than re-capturing. The
  excerpt renders through the Log Inspector's own `logRow` + `groupRows`, so it reads exactly like
  the live view; a frame with no timestamp is left out rather than guessed into the window. A
  feat-019 `bugs.json` still loads (`serde(default)` + `alias = "summary"`), with a test that parses
  the exact JSON it wrote. Detail: [archive](../archive/features/feat-020.md).
  feat-019: [archive](../archive/features/feat-019.md).
- **Last verify:** 2026-08-10 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`;
  Vitest 67/67, Rust 82/82. (Three screen tests time out at 5s when a `cargo` build runs on the same
  machine — App, Runner, TestPlans. They pass on a quiet machine; the suite's userEvent timeout is
  tight under load, not a regression in any feature.)

## Next step

Both remaining rows are ready — pick one:

- **feat-021** (capture relay, FR-044/044a/044b) — unblocked by feat-023. The `media_chunk` control
  frame already arrives and is filed as a record; what is missing is the binary half, the
  `POST /v1/media/upload-url` → direct upload → `POST /v1/media/{id}/confirm` sequence, and the
  "pending upload" state, which is the same `synced_at`-style marker applied to a capture. It shows
  in the Bugs screen's *Attached captures* section, which currently just names the gap.
- **feat-022** (reporting, FR-033/034) — reads `severity` / `status` / `environment` off the bug
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
| `desktop/src-tauri/src/bug.rs` | `Severity`/`Status` enums, full FR-030 field set on `Bug`, `BugEdit` + `edit`, `update_bug`, 3 new tests | FR-030…032. Copied run facts + a patch that cannot reach the observation = triage without rewriting evidence |
| `desktop/src-tauri/src/lib.rs` | `bug::update_bug` registered | a command not in `generate_handler!` is invisible to the webview |
| `desktop/src/Bugs.tsx` | new screen: list, triage form, `withinWindow` / `precedingActions`, excerpt via `groupRows` | FR-031: evidence derived from the window at read time, rendered by the Log Inspector's own row logic |
| `desktop/src/Runner.tsx` | `Bug` type extended, `summary` → `title`, `SEVERITIES`/`STATUSES` | one shared shape for the record; the marker form itself is unchanged (FR-013) |
| `desktop/src/App.tsx` | `bugs` screen wired + full-bleed | the placeholder was the last thing standing between the record and the operator |
| `desktop/src/__tests__/Bugs.test.tsx` | new: 4 tests | window selection incl. the untimestamped frame, actions stop at the marker, detail render, one-field patch + refusal |
| `desktop/src/__tests__/App.test.tsx` | workspace-scoping asserts moved to the Reports placeholder | Bugs is a built screen now, so it no longer prints "… in Alpha" |
| `desktop/src/__tests__/Runner.test.tsx` | `bug()` fixture updated to the full record | `summary` no longer exists on `Bug` |
| `FEATURES.md` · `archive/features/feat-020.md` | feat-020 ✅ + evidence | definition of done |
| `desktop/src-tauri/src/frames.rs` | new: per-device JSONL log, `identity`, `occurred_at`, `retain` + 4 tests | FR-035b/FR-036. The file is the record; the map is only the live view |
| `desktop/src-tauri/src/ws/server.rs` | `Sessions` gains a store dir + `seen` set; `record` dedups and appends; `records`/`device_records` read disk; `clear`; 2 new commands + 1 test | a replay is one entry, a restart keeps the frames, clearing keeps a bug's window |
| `desktop/src-tauri/src/sync.rs` | new: outbox as a derived view, batch push, idempotency key, offline report, 60s drain + 4 tests | FR-035/FR-035b. Never on a capture path; a 503 is a non-event |
| `desktop/src-tauri/src/bug.rs` · `test_session.rs` | `synced_at` field, cleared on edit/stop; `load`/`save` `pub(crate)` | the outbox needs a dirty marker and the sync client needs the stores |
| `desktop/src-tauri/src/auth_session.rs` | `credential()`, `api_base_url` `pub(crate)` | the sync client presents the same session credential, `None` = stay queued |
| `desktop/src-tauri/src/lib.rs` | frame dir wired before the listener, `sync::start`, 3 commands | the first frame must already be written down, not only remembered |
| `desktop/src/Bugs.tsx` | one `device_records` call, sync badge + queue count + Sync now | evidence no longer needs a live session row; FR-035b made visible |
| `desktop/src/LogInspector.tsx` | Clear logs button | FR-035b's clearing clause needs something that clears |
| `desktop/src/Runner.tsx` · tests | `synced_at` on `Bug`/`TestSession`, fixtures, 1 new Bugs test | offline is a state on the screen, not a failure |
