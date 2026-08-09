# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-018 closed; nothing 🔵)
- **Status:** feat-018 complete. The Log Inspector now has a grouped view beside the flat one: one
  pure `groupRows(entries, keep, filtering)` nests records under the `user_action` whose `action_id`
  they carry, everything else lands in **Unattributed** (FR-039c), an action with no records keeps
  its empty group (FR-039d), and the *flat view's own* `keep` predicate is what filters inside groups
  — while it narrows, a group with nothing left is hidden unless the action's label matches
  (FR-039e). Toggling is lossless by construction: both views render the same `entries`, and the
  open record is resolved against all of them. No Rust change — `action_id` was already on the wire.
  Detail: [archive](../archive/features/feat-018.md). feat-017: [archive](../archive/features/feat-017.md).
- **Last verify:** 2026-08-10 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`;
  Vitest 60/60, Rust 67/67.

## Next step

Two features are ready:

- **feat-019** (Bug Occurred marker mid-session, FR-013) — the natural continuation, and the first
  consumer of the correlation `CONSTITUTION.md` (2026-08-10) defers to `test_case_push`. Read that
  decision before designing it. The activity window it bookmarks is exactly what feat-018 now groups.
- **feat-023** (local-first store + `sync-api` client) is independent and is what makes captured
  frames survive a restart — `Sessions` is still in memory, capped at 500 frames per session.
- Not yet ready: feat-020 (needs feat-019), feat-021 (needs 020 + 023), feat-022 (needs 020).

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
| `desktop/src/LogInspector.tsx` | `groupRows` + `Entry` / `LogGroup` | FR-039b–e: grouping is one pure function over the rows `logRow` already derives |
| `desktop/src/LogInspector.tsx` | `RecordRow` extracted; grouped/flat toggle chip | a record line must read identically in both views, and the toggle needs one lossless source |
| `desktop/src/__tests__/LogInspector.test.tsx` | 3 new tests (60 total) | nesting + empty group + Unattributed; filter inside groups; toggle loses nothing |
| `FEATURES.md` · `archive/features/feat-018.md` | feat-018 ✅ + evidence | definition of done |
