# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-020 closed; nothing 🔵)
- **Status:** feat-020 complete. feat-019's marker became the full record (FR-030…032) plus a new
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
  Vitest 66/66, Rust 73/73.

## Next step

Two features are ready:

- **feat-023** (local-first store + `sync-api` client) — the one that unblocks the rest. Records are
  still in memory only (`ws::server::Sessions`, capped 500/session), so a bug's excerpt is empty
  after a restart and the screen says so; `bugs.json` / `test-sessions.json` are still whole-file
  rewrites. Start with the frame store, then the `sync-api` client.
- **feat-022** (reporting, FR-033/034) is now ready too — it reads `severity` / `status` /
  `environment` off the bug record feat-020 just landed, plus `Session Case Result` for pass/fail
  by plan.
- Not yet ready: feat-021 (needs feat-023). Its FR-044a "pending upload" state is what the Bugs
  screen's *Attached captures* section becomes.

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
