# feat-009 — Test Case CRUD with derived summary status

- **Status:** ✅ done · closed 2026-08-04 · **Depends on:** feat-008
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-003, FR-003a, FR-003b, FR-003c (plus FR-005 / FR-006 as far as CRUD needs them)

## Done when

- Full CRUD for Test Cases, each carrying at least title, category/tag, platform and server; no
  stored run-status and no build-version field (FR-003).
- A derived summary status per row, computed on read across the case's per-plan instances with
  precedence `Has Fail → Blocked → In Progress → All Passed → Not Run`, never persisted; per-instance
  status visible when the row is expanded (FR-003a).
- An Active/Archived lifecycle flag independent of run outcome (FR-003b).
- Platform is one of exactly iOS, Android, Both (FR-003c).

## What landed

- `desktop/src-tauri/src/test_case.rs` — new. The store and its pure core:
  - `TestCase` mirrors `data-model.md` exactly, **with no status field of any kind**;
  - `Platform` / `Lifecycle` as enums, so FR-003c and FR-003b are deserialization-level guarantees;
  - `visible()` (workspace-scoped, skips soft-deleted), `upsert()` (create/edit, FR-005 audit
    stamping), `soft_delete()` (FR-006);
  - commands `list_test_cases`, `save_test_case`, `delete_test_case`, each a thin fs wrapper so the
    logic is testable without an `AppHandle`;
  - audit `created_by`/`updated_by` come from the cached Auth Session in Rust, never from the
    webview.
- `desktop/src-tauri/src/lib.rs` — module registered, three commands added to the handler.
- `desktop/src/TestCases.tsx` — new. The screen: `summaryStatus()` (FR-003a precedence), the case
  table with expandable per-plan instances, the create/edit form, delete with confirmation.
- `desktop/src/App.tsx` — the `cases` screen renders `<TestCases>` instead of the placeholder.
- `desktop/src/tokens.ts` — the semantic status colours copied from `qa-tokens.jsx`.
- `desktop/src/__tests__/TestCases.test.tsx` — new, 8 tests.
- `desktop/src/__tests__/App.test.tsx` — 4 tests updated: the landing screen now performs one local
  read, so the two "exact IPC call list" assertions account for it, and the FR-056d refusal is
  asserted from the Bugs screen so it remains the only alert on the page.

## Evidence

| Check | Result |
|---|---|
| Create stamps audit metadata and stores no run status | `test_case.rs` › *create_stamps_audit_metadata_and_stores_no_run_status* ✅ |
| Platform outside iOS/Android/Both is rejected | `test_case.rs` › *a_platform_outside_ios_android_both_is_rejected* ✅ |
| Edit preserves `created_*`, moves `updated_*`, creates no second row | `test_case.rs` › *edit_updates_in_place_and_keeps_the_creation_record* ✅ |
| Archiving is a lifecycle change only | `test_case.rs` › *archiving_keeps_the_case_listed_and_touches_no_other_field* ✅ |
| Delete is soft and keeps the original deletion time | `test_case.rs` › *delete_is_soft_so_historical_references_still_resolve* ✅ |
| No read or write crosses a workspace boundary | `test_case.rs` › *a_case_is_invisible_and_unwritable_from_another_workspace* ✅ |
| Duplicate titles allowed, blank title refused | `test_case.rs` › *duplicate_titles_are_allowed_and_a_blank_title_is_refused* ✅ |
| FR-003a precedence, all five rungs | `TestCases.test.tsx` › *the summary status is derived across plan instances in precedence order* ✅ |
| Derived badge per row + per-instance status on expand | `TestCases.test.tsx` › *a row shows its derived badge and reveals per-plan status when expanded* ✅ |
| Create sends only spec fields, no status, then reloads | `TestCases.test.tsx` › *creating a case sends only spec fields and no status, then reloads the list* ✅ |
| Platform/lifecycle choices are exactly the spec values | `TestCases.test.tsx` › *the platform and lifecycle choices are exactly the spec values* ✅ |
| Archive is an in-place edit carrying the id | `TestCases.test.tsx` › *editing a case archives it in place instead of creating a second one* ✅ |
| Delete confirms first and honours a decline | `TestCases.test.tsx` › *delete asks for confirmation and does nothing when declined* ✅ |
| The read is scoped to the active workspace and re-reads on switch | `TestCases.test.tsx` › *the list is read for the active workspace only* ✅ |
| A store failure is reported, not shown as an empty list | `TestCases.test.tsx` › *a store failure is reported instead of showing an empty list as success* ✅ |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-04, no warnings |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-04; Vitest 19/19, Rust 32/32 |

Not verified in the running app: the screen sits behind sign-in, which needs a live
`GOOGLE_CLIENT_ID` + `TESTLAB_API_BASE_URL` (the environment gap recorded since feat-006). The jsdom
tests drive the real component tree, and the store's logic is covered directly in Rust.

## Decisions

**One JSON file under the app data dir, not SQLite — yet.** `research.md` R2 picks `rusqlite`, and
that still stands: it lands with **feat-023**, which needs what SQLite is actually for — transactional
writes behind the sync outbox, log events spilling out of the in-memory ring, and the reporting
queries of FR-033/034. None of that exists today, and a test-case list is a few hundred rows. Chosen
over adding the dependency now, which would buy schema-migration work in exchange for nothing this
feature can use. Ceiling and upgrade path are recorded in the module's `ponytail:` header: whole-file
rewrite is O(n) per save and not safe across processes; feat-023 replaces `load`/`save` with a table
and reads this file once to migrate.

**The derived status lives in TypeScript, the record lives in Rust.** FR-003a says *computed on read*.
Computing it in the webview from the instances it already renders means there is no place to
accidentally persist it — the Rust struct has no field for it, and the serialization test asserts the
string `status` never appears in a stored case.

**Platform and lifecycle are Rust enums, not strings.** FR-003c is then enforced by the deserializer
rather than by a validation function somebody can forget to call; a bad payload fails at the boundary.

**`created_by` / `updated_by` are read from the cached Auth Session in Rust.** The webview never
supplies them, so a caller cannot claim authorship of someone else's edit (FR-005).

**Delete is soft, with a native `confirm()`.** FR-006's soft delete is a three-line invariant in the
store and the wrong thing to defer; the confirmation is one platform call. feat-010 owns the richer
list-side deletion UX along with search/filter/sort.

## Scope held

- **FR-004 (search, filter, sort) is feat-010**, not here. The list renders in store order.
- **FR-005 audit metadata is stored and displayed** (updated at / by, in the row) because CRUD cannot
  be correct without it; feat-010 owns the full created/updated presentation.
- **FR-007 (a case in several plans)** is satisfied structurally — a case holds no plan reference at
  all, so nothing needs duplicating. The link is Test Plan Item's, in feat-012.
- **FR-008 (CSV/Excel import)** is feat-011. Duplicate titles are already allowed, which is the part
  of FR-008 this feature had to honour.
- **Per-plan instances are empty until feat-012.** `TestCases` takes `instancesByCase` with a `{}`
  default; feat-012 passes the real map. The precedence is implemented and tested now, so the badge
  is correct the moment instances exist — every case reads `Not Run` today, which is FR-003a's last
  rung, not a placeholder.
