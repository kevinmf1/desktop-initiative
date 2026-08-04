# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-010 closed; nothing 🔵)
- **Status:** feat-010 is complete — FR-004 lives in one pure `arrange()` in `TestCases.tsx` (search
  over title/description/tags, five filter axes, four sort keys), driven by a native-control
  `Toolbar` whose tag/server options come from the loaded data. The *category* filter **is** the tag
  filter (FR-003 defines one "category/tag" field; `data-model.md` has no `category`). The created
  half of FR-005's audit pair now shows in the expanded row. Detail:
  [archive](../archive/features/feat-010.md).
- **Last verify:** 2026-08-04 · `build` → **PASS** (no warnings) · `test` → **PASS** ·
  `lint` → not configured. Evidence: `HARNESS_VERIFY: PASS (build)` and
  `HARNESS_VERIFY: PASS (test)`; Vitest 22/22, Rust 32/32.

## Next step

Three features are ready (all `Depends on` ✅):

- **feat-011** — CSV/Excel import with row-level error preview (FR-008). `test_case::upsert` is the
  commit path; duplicate titles are already allowed. Start by deciding where parsing lives: a CSV
  parse is a few lines of TS, but Excel (`.xlsx`) is a zip + XML read, so check whether FR-008
  really needs `.xlsx` before adding a dependency for it.
- **feat-012** — Test Plan CRUD. Also the feature that finally supplies real plan instances: pass a
  real `instancesByCase` into `<TestCases>` (today `{}`, so every badge reads `Not Run`).
- **feat-013** — device pairing by QR / pairing code; independently ready, starts the device chain.

Wiring owed by later features:

- **feat-016** passes a real running-session count into `WorkspaceShell`'s `runningSessions` prop —
  the FR-056d guard, message and test already exist and default to `0`. feat-016 also owns
  *enforcing* `auth_session::can_start_new_session()` (FR-053a) at session start.
- **feat-019** surfaces the backend's FR-056b `403` when the cached membership snapshot is stale.
- **feat-023** replaces `test_case.rs`'s `load`/`save` (one JSON file under the app data dir) with
  the rusqlite store research.md R2 specifies, migrating that file once. Ceiling of the current
  store is in the module's `ponytail:` header.

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
  (Test Cases included) is verified in jsdom, not in the running app.
  `TESTLAB_OFFLINE_GRACE_DAYS` optionally overrides the 30-day default.

## Changes

_feat-009: rotated to [archive](../archive/features/feat-009.md)._


### feat-010

| File | Change | Why |
|------|--------|-----|
| `desktop/src/TestCases.tsx` | `arrange()` + `View`/`ALL_CASES`/`SORTS` — search, five filters, four sorts, all pure | FR-004; the status axis filters the **derived** FR-003a summary, so it cannot be a store query. Pure ⇒ all of FR-004 is one test |
| `desktop/src/TestCases.tsx` | `Toolbar` — native search input + five `<select>`s; tag/server options derived from the loaded rows | Native controls are a11y-correct for free; free-text axes would go stale against a fixed option list |
| `desktop/src/TestCases.tsx` | Header reads `N of M cases` when filtered; separate empty state for "no match" | A filtered-empty list must not read as "no cases yet" |
| `desktop/src/TestCases.tsx` | Expanded row shows `Created by … on …` | FR-005 wants the created half displayed too; the row already had updated |
| `desktop/src/__tests__/TestCases.test.tsx` | 3 tests added (8 → 11) | Every FR-004 axis, controls→rows wiring + filtered count, both audit halves |
| `FEATURES.md` · `archive/features/feat-010.md` | feat-010 → ✅ with evidence; epic 6/20 → 7/20 | Definition of done |

_Earlier sessions: [2026-08-03-feat-006.md](../archive/sessions/2026-08-03-feat-006.md)._
