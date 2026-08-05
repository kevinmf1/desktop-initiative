# feat-012 — Test Plan CRUD

- **Status:** ✅ done · closed 2026-08-06 · **Depends on:** feat-009
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-009, FR-010, FR-011 (SC-001, quickstart Scenario 1)

## Done when

- Test Plans can be created, updated, archived, and duplicated (FR-009).
- Test Cases can be added to and removed from a plan without copying their canonical content
  (FR-007/FR-010).
- A plan stores notes, target build, and environment/server target (FR-010/FR-011).
- Each linked Test Case has an independent per-plan status, and the Test Case list derives its real
  summary across those instances (FR-003a/FR-034 data model).
- Every operation is scoped to the active workspace; a deleted or foreign case cannot be newly linked.

## What landed

- `desktop/src-tauri/src/test_plan.rs`
  - `TestPlan` and `TestPlanItem` persistence in the app data directory.
  - `list_test_plans`, `save_test_plan`, `archive_test_plan`, and `duplicate_test_plan` commands.
  - Items reference `test_case_id`; retained items keep their independent status, while newly added
    and duplicated items start at `Not Run`.
  - Workspace validation refuses foreign or newly linked soft-deleted cases. An existing link to a
    later-deleted case may remain so historical references are not destroyed.
- `desktop/src/TestPlans.tsx`
  - Split list/detail plan screen following the canonical Clean Pro mockup.
  - Create/edit form for name, notes, target build, environment/server, lifecycle, and case membership.
  - Dedicated Duplicate and Archive actions, plus direct Remove and Add Cases controls.
- `desktop/src/TestCases.tsx`
  - `instancesFromPlans` turns stored plan items into the existing per-case read model.
  - The list now loads real plan items; summary badges and expanded plan/status rows no longer receive
    the pre-feature empty instance map.
- `desktop/src/App.tsx` replaces the Test Plans placeholder with the real screen.
- `desktop/src/__tests__/TestPlans.test.tsx` adds component/IPC coverage; Rust adds six domain tests.

## Evidence

| Check | Result |
|---|---|
| Create persists notes, target build, environment/server, and case ids (FR-009…011) | `TestPlans.test.tsx` › *creates a plan with notes, target build, environment and reusable case links* ✅ |
| Duplicate and archive controls reach their dedicated operations (FR-009) | `TestPlans.test.tsx` › *duplicate and archive controls call the dedicated plan operations* ✅ |
| Removing membership leaves the canonical Test Case untouched (FR-010) | `TestPlans.test.tsx` › *removing a case updates only plan membership and keeps the Test Case itself* ✅ |
| One canonical case becomes a real per-plan Test Case instance | `TestCases.test.tsx` › *plan items become real independent instances for the Test Case read model* ✅ |
| Create links ids without copying cases; duplicate ids collapse | `test_plan.rs` › `create_links_cases_without_copying_them_and_deduplicates_ids` ✅ |
| Edit preserves retained status and initializes only new membership | `test_plan.rs` › `update_adds_and_removes_links_while_preserving_retained_status` ✅ |
| Duplicate copies membership but resets independent outcomes | `test_plan.rs` › `duplicate_reuses_case_references_but_resets_independent_statuses` ✅ |
| Archive keeps the plan and membership resolvable | `test_plan.rs` › `archive_keeps_the_plan_and_its_items` ✅ |
| Foreign/deleted new links rejected; an existing deleted link may remain | Two workspace/soft-delete tests in `test_plan.rs` ✅ |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-06 |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-06; Vitest 31/31, Rust 40/40 |

The running signed-in app was not exercised because live auth still requires `GOOGLE_CLIENT_ID` and
`TESTLAB_API_BASE_URL`. The real React component tree is driven in jsdom, and persistence rules are
covered directly in Rust.

## Decisions

**Plan items reference Test Case ids; they never copy Test Case content.** This makes one case reusable
across many plans and ensures a case edit is visible everywhere, as FR-007 requires.

**Duplicating a plan resets every copied item to `Not Run`.** Membership is cloned, but outcome is an
independent property of the new plan instance. Copying a Passed/Failed result would invent execution
history for a plan that has never run.

**The binding spec wins over the mockup's stale build comment.** The visual reference says build is not
stored on a plan, while FR-010 and the Test Plan data model explicitly require `target_build`. The screen
therefore follows the mockup layout but persists the required field.

## Scope held

- Bugs and Sessions retain stable `test_plan_id` associations when their owning features land
  (feat-016 and feat-019/020); no placeholder records or fake counts were introduced here.
- Search, pass-rate aggregation, recent sessions, and Run Plan are later reporting/runner scope, not
  FR-009…011 CRUD.
- Storage remains the current small JSON-file store. Feat-023 owns the planned SQLite migration and
  sync outbox for all durable entities.
