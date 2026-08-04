# feat-010 — Test Case list: search, filter, sort, audit metadata

- **Status:** ✅ done · closed 2026-08-04 · **Depends on:** feat-009
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-004, FR-005, FR-006, FR-007

## Done when

- The Test Case list is searchable, filterable by category, tag, status, platform and server, and
  sortable by recently updated, title, status and platform (FR-004).
- Audit metadata (created by/at, updated by/at) is preserved and **displayed**, and updated on every
  edit (FR-005).
- Delete is confirmed and soft, so historical session references stay intact and viewable (FR-006).
- A Test Case can sit in more than one Test Plan without its core content being duplicated (FR-007).

## What landed

- `desktop/src/TestCases.tsx`
  - `arrange(cases, instancesByCase, view)` — the whole of FR-004 as one pure function: search over
    title / description / tags, the five filter axes, the four sort keys. Pure so FR-004 is testable
    without a render, and it takes `instancesByCase` because the status axis works on the **derived**
    FR-003a summary, not on a column.
  - `View` / `ALL_CASES` / `SORTS` — the control state, `''` meaning "any" on each filter.
  - `Toolbar` — native `<input type="search">` + five `<select>`s. Filter options for tag and server
    are built from the values actually present in the loaded list.
  - Header count reads `N cases` unfiltered and `N of M cases` once a filter narrows it; a filtered
    empty list says so instead of reusing the "no cases yet" message.
  - The expanded row now also shows `Created by … on …` — the created half of FR-005's pair, next to
    the per-plan instance list that is FR-007's visible proof.
- `desktop/src/__tests__/TestCases.test.tsx` — 3 tests added (8 → 11).

## Evidence

| Check | Result |
|---|---|
| Every FR-004 axis: search (title/description/tag), tag, platform, server, derived status, filter combination, all four sorts | `TestCases.test.tsx` › *the list searches, filters on every axis, and sorts on every key* ✅ |
| Controls are wired to the rendered rows; filter options come from the data; filtered count and empty state | `TestCases.test.tsx` › *searching narrows the rendered rows and reports the filtered count* ✅ |
| Both halves of the audit pair are displayed | `TestCases.test.tsx` › *audit metadata is shown for both create and update* ✅ |
| Audit metadata is stamped and preserved across an edit (FR-005, store side) | `test_case.rs` › *create_stamps_audit_metadata_and_stores_no_run_status*, *edit_updates_in_place_and_keeps_the_creation_record* ✅ (feat-009) |
| Delete confirms, and is soft in the store (FR-006) | `TestCases.test.tsx` › *delete asks for confirmation and does nothing when declined* + `test_case.rs` › *delete_is_soft_so_historical_references_still_resolve* ✅ (feat-009) |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-04, no warnings |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-04; Vitest 22/22, Rust 32/32 |

Not verified in the running app: the screen sits behind sign-in, which needs a live
`GOOGLE_CLIENT_ID` + `TESTLAB_API_BASE_URL` (the environment gap recorded since feat-006). The jsdom
tests drive the real component tree.

## Decisions

**The category filter *is* the tag filter.** FR-003 defines the axis as "category/tag" — one field —
and feat-009 stored it as `tags`. FR-004 then names both, so a naive reading adds a second `category`
column. `data-model.md` has no such field, and inventing one would put two names on one concept.
Chosen over adding a `category` string, which would have to be filtered identically and displayed
identically. Recorded in `View`'s doc comment where the next reader of FR-004 will hit it.

**Filter and sort are a pure function, not `useMemo` chains or a query.** The status axis has to work
on the FR-003a summary, which by rule is computed on read and never stored — so there is nothing to
push into the store even after feat-023 puts SQLite behind it. One function over the already-loaded
array is the honest shape, and it makes all of FR-004 assertable in a single test.

**Native `<select>` and `<input type="search">`.** The mockup draws pill-shaped filter chips with
custom dropdowns; the spec asks for filtering, not for chips. Native controls are keyboard- and
screen-reader-correct with no code, and a dependency for a combobox would be paid for on every axis.

**Filter options come from the loaded data.** Tag and server are free text, so a fixed option list
would go stale silently; deriving them means an offered filter always matches at least one row.

## Scope held

- **No lifecycle (Active/Archived) filter.** The mockup has `All / Active / Draft / Archived` tabs;
  FR-004's filter list does not include lifecycle, and there is no `Draft` state in the spec. The
  column is shown, not filtered. Add it when a requirement asks.
- **Sorting is single-key with no secondary tiebreak.** Ties keep store order. FR-004 asks for four
  sort keys, not a sort stack.
- **Search is a substring scan over the loaded array.** Ceiling: O(n) per keystroke over a few
  hundred rows, which is free. feat-023 can push it into SQL if the list ever gets large.
- **FR-007 is structural, and stays that way.** A case holds no plan reference, so nothing is
  duplicated. The expanded row lists the plans a case appears in; that list is real only once
  feat-012 passes a non-empty `instancesByCase` — today every case shows `Not Run`, FR-003a's last
  rung.
