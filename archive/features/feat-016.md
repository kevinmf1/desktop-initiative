# feat-016 — Manual test runner: start a session, stop it with a result

**FRs:** FR-012 (start from a plan or ad hoc cases; build, server, platform, device; unique session
ID) · FR-014 (stop prompts Passed / Failed / Blocked / Incomplete)
**Depends on:** feat-012 (Test Plan CRUD) ✅ · feat-015 (`device-desktop-ws` server) ✅
**By:** kevin-malik · **Closed:** 2026-08-10

## What landed

`test_session.rs` is the join between stores that already exist — it owns no cases, no plans and no
devices, only the ids of what a run was against. That is what makes a plan edited tomorrow unable to
rewrite what ran today: `case_ids` is snapshotted at start.

- **Scope is a plan *or* ad hoc cases, never neither.** A plan contributes its items in order; an ad
  hoc list is checked against what the workspace actually holds, so a stale id from the webview
  cannot silently produce an empty run. The UI enforces the same thing structurally — picking a plan
  removes the ad hoc checkboxes, so the two can never disagree.
- **`device_id` is the SDK-reported stable id, not the registry row id**, because that is what
  `ws::server::Sessions` keys its records on (FR-021). One lookup joins a session to its captured
  frames — feat-017 and feat-019 need exactly that and get it for free.
- **The unique id is a guarded clock value.** `ts-<unix_nanos>`, with a `-1`, `-2` … suffix if a
  session with that id already exists. Two starts inside one tick is the only way the clock lies,
  and FR-012 says *unique*, so the suffix settles it rather than trusting the timer.
- **Stopping *is* the result prompt** (FR-014). Stop reveals the four results in place; nothing is
  written until one is chosen, and a stopped session cannot be re-judged. A session is never stopped
  first and judged after — that is how a run ends up with no recorded outcome.
- **Start refuses before it writes:** empty build version, empty server, an unregistered device, a
  disabled device, a missing plan, a plan with no cases, an unavailable case id, an empty ad hoc
  selection. Each names the thing that is wrong.

## Two shell changes it forced

- **FR-056d finally has a real count.** `WorkspaceShell` reads `list_test_sessions` itself instead of
  taking a `runningSessions` prop that nothing ever passed. It has to: the guard applies on every
  screen, and a running session survives a restart, so the count cannot live in the screen that
  happens to display it.
- **FR-053a stopped over-blocking.** Expired offline grace used to blank the whole Runner screen —
  which would now hide the very sessions the FR says are unaffected. The refusal moved into the
  Runner, replacing the start form only; running sessions stay visible and stoppable.

## Deliberately not here

Per-case verdicts, the side-by-side device columns and the live log pane in `qa-runner.jsx` are
feat-017 / feat-018 / feat-022 work — FR-012 and FR-014 are start and stop. `Session Case Result`
(data-model) is not a stored entity yet; `case_ids` is the snapshot those rows will be built from.

## Evidence

`./verify.sh build` → `HARNESS_VERIFY: PASS (build)`
`./verify.sh test` → `HARNESS_VERIFY: PASS (test)` — Vitest 50/50, Rust 67/67 (2026-08-10).

Rust (`test_session.rs`, 5 tests): plan start snapshots cases and names the run · ad hoc needs at
least one *available* case and de-duplicates · build / server / registered / enabled device are all
required and nothing is written when one fails · two starts on one clock tick get distinct ids ·
stop records a result once, only while running, only in its own workspace.

React (`Runner.test.tsx`, 7 tests): the start payload carries plan, build, server, platform and
device · ad hoc selection, and a plan replacing that scope · a refused start reports and claims
nothing · stop prompts all four results and sends the chosen one · cancel leaves the run unjudged ·
running and stopped listed apart, each showing its session id · expired grace hides the start form
but keeps a running session stoppable. `App.test.tsx` covers the FR-056d guard from the store.

## Files

| File | What |
|---|---|
| `desktop/src-tauri/src/test_session.rs` | new — session store, start/stop rules, 3 commands, 5 tests |
| `desktop/src-tauri/src/lib.rs` | registers the module and its three commands |
| `desktop/src-tauri/src/test_case.rs` | `actor()` → `pub(crate)` so sessions record the same author |
| `desktop/src-tauri/src/test_plan.rs` | `load()` → `pub(crate)` so a start can resolve a plan |
| `desktop/src/Runner.tsx` | new — start form, running / stopped lists, stop-with-result prompt |
| `desktop/src/App.tsx` | owns the session list; real FR-056d count; FR-053a refusal moved into Runner |
| `desktop/src/__tests__/Runner.test.tsx` | new — 7 tests |
| `desktop/src/__tests__/App.test.tsx` | FR-056d now driven by the store, not a prop |
