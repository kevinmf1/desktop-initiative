# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-009 closed; nothing 🔵)
- **Status:** feat-009 is complete — Test Case CRUD in a Rust JSON store with no stored run status,
  the FR-003a summary derived on read in TS, Active/Archived, iOS/Android/Both as an enum, soft
  delete. Detail: [archive](../archive/features/feat-009.md).
- **Last verify:** 2026-08-04 · `build` → **PASS** (no warnings) · `test` → **PASS** ·
  `lint` → not configured. Evidence: `HARNESS_VERIFY: PASS (build)` and
  `HARNESS_VERIFY: PASS (test)`; Vitest 19/19, Rust 32/32.

## Next step

Three features are ready (all `Depends on` ✅):

- **feat-010** — Test Case list: search, filter (category/tag/status/platform/server), sort, audit
  metadata, soft delete with confirmation, reuse across plans (FR-004…007). Most of it is UI over
  the list `TestCases.tsx` already renders; the store side is done (`visible()` already hides
  soft-deleted rows, audit fields already display). Note the *status* filter filters the **derived**
  summary, which means filtering computed values, not a query.
- **feat-011** — CSV/Excel import with row-level error preview (FR-008). `test_case::upsert` is the
  commit path; duplicate titles are already allowed.
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

| File | Change | Why |
|------|--------|-----|
| `desktop/src-tauri/src/test_case.rs` | New store: `TestCase`/`Platform`/`Lifecycle`, `visible`/`upsert`/`soft_delete` + 3 commands | FR-003/003b/003c, FR-005, FR-006; enums make the platform rule a deserialization guarantee |
| `desktop/src-tauri/src/test_case.rs` | One JSON file under the app data dir, not SQLite | research.md R2's rusqlite store is feat-023's; nothing here needs it yet — ceiling + upgrade path in the module header |
| `desktop/src-tauri/src/test_case.rs` | `actor()` reads the cached Auth Session for audit fields | FR-005 — the webview must not be able to claim authorship |
| `desktop/src-tauri/src/lib.rs` | Module + `list/save/delete_test_case` in the handler | Commands must be registered to be callable |
| `desktop/src/TestCases.tsx` | New screen: `summaryStatus()`, case table with expandable instances, create/edit form, confirmed delete | FR-003a computes on read so no field can hold it; layout from `qa-test-cases.jsx`, five states per the spec not the mockup's three |
| `desktop/src/App.tsx` | `cases` renders `<TestCases>` instead of the placeholder | The first screen with real data |
| `desktop/src/tokens.ts` | Semantic status colours copied from `qa-tokens.jsx` | The derived badge needs pass/fail/blocked/skip tones |
| `desktop/src/__tests__/TestCases.test.tsx` | New, 8 tests | Precedence, expand, create payload, enum choices, archive-in-place, delete confirm, scoping, error path |
| `desktop/src/__tests__/App.test.tsx` | 4 tests updated | The landing screen now does one local read; the FR-056d refusal is asserted from Bugs so it stays the only alert |
| `FEATURES.md` · `archive/features/feat-009.md` | feat-009 → ✅ with evidence; epic 5/20 → 6/20 | Definition of done |

_Earlier sessions: [2026-08-03-feat-006.md](../archive/sessions/2026-08-03-feat-006.md)._
