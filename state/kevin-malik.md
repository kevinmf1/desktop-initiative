# State — kevin-malik

> Your personal working state. One file per person (`state/<git config user.name>.md`),
> so merge / rebase / cherry-pick never conflict — nobody else ever writes here.
> Keep it small — cap ~100 lines. Finished work rotates to `archive/`.
> Team-wide view of who's doing what lives in `FEATURES.md`, not here.

## Now

- **Objective:** Build the Tauri desktop app to `specs/frontend/`.
- **Active feature:** — (feat-012 closed; nothing 🔵)
- **Status:** feat-012 complete. Test Plans persist notes, target build, environment/server, lifecycle,
  and canonical Test Case links. Create/update/archive/duplicate and add/remove are wired; duplicate
  resets new independent items to `Not Run`. Test Cases now derive summaries from real plan items.
  Detail: [archive](../archive/features/feat-012.md).
- **Last verify:** 2026-08-06 · `build` → **PASS** · `test` → **PASS** · `lint` → not
  configured. Evidence: `HARNESS_VERIFY: PASS (build)` and `HARNESS_VERIFY: PASS (test)`; Vitest
  31/31, Rust 40/40.

## Next step

**feat-013** is ready (feat-005 ✅): implement pairing by QR / short code, single-use token,
5-minute TTL, and refresh invalidation. Read `design/README.md`; Devices has no canonical mockup.

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
_feat-010: rotated to [archive](../archive/features/feat-010.md)._

### feat-011

| File | Change | Why |
|------|--------|-----|
| `desktop/src/import.ts` | new — `parseDelimited`, `planTable`, `planImport`, `readText`/`readBase64`/`isWorkbook` | FR-008's rules are pure and source-agnostic, so every one is testable without a render or a file; only the two `FileReader` helpers touch the edges |
| `desktop/src-tauri/src/workbook.rs` · `lib.rs` · `Cargo.toml` | new `read_workbook(base64) → Vec<Vec<String>>` via `calamine`, registered | FR-008's Excel half. Rust over SheetJS: the npm release is frozen on a prototype-pollution advisory, and the decoder stays off the JS bundle — now a `CONSTITUTION.md` rule |
| `desktop/src-tauri/tests/fixtures/cases.xlsx` | new — 3-row workbook incl. an *absent* title cell | Excel omits empty cells rather than writing blanks; that is the row a naive reader shifts |
| `desktop/src/TestCases.tsx` | `ImportPreview` — per-line table, errors inline, commit button offers only the valid count | FR-008/SC-009: a mixed file must be previewable and partially committable, never all-or-nothing |
| `desktop/src/TestCases.tsx` | `Import CSV / Excel` as a `<label>` over a hidden `<input type="file">`; workbook → Rust, text → `parseDelimited`, both → `planTable` | Native picker ⇒ no `plugin-dialog`, no `plugin-fs`, no capability widened; one validation path regardless of format |
| `desktop/src/TestCases.tsx` | `commitImport()` — one `save_test_case` per valid row, failures collected per line | Reuses the FR-005 audit stamping and FR-003c enum gate already in Rust; a bulk command would duplicate both |
| `desktop/src/__tests__/TestCases.test.tsx` | 5 tests added (11 → 16) | Every validation rule incl. duplicate-titles-allowed, preview-before-write, the workbook path, a decode failure, and CSV ≡ workbook |
| `CONSTITUTION.md` | Decision 2026-08-04: binary formats decode in Rust, cross the IPC as plain data | Settles where the next zip/binary parser goes, not just this one |
| `FEATURES.md` · `archive/features/feat-011.md` | feat-011 → ✅ with evidence; epic 7/20 → 8/20 | Definition of done |

_Session detail: [2026-08-06-feat-012.md](../archive/sessions/2026-08-06-feat-012.md). Earlier:
[2026-08-03-feat-006.md](../archive/sessions/2026-08-03-feat-006.md)._
