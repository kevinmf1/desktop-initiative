# feat-018 — Grouped log view by User Action

**FRs:** FR-039b (groups nest records under their originating User Action, with label, timestamp,
record count and success/error summary), FR-039c ("Unattributed", never dropped), FR-039d (an action
that produced no records still appears), FR-039e (grouped ⇄ flat toggle, no data loss, filter applies
inside groups and hides groups left with nothing)
**Depends on:** feat-017 (live log viewer) ✅
**By:** kevin-malik · **Closed:** 2026-08-10

## What landed

One pure function and a toggle — no new command, no new state on the Rust side. Everything the
grouping needs was already on the wire: `user_action` frames carry `action_id`, and `log_event` /
`app_log` carry the `action_id` they belong to.

`groupRows(entries, keep, filtering)` in `desktop/src/LogInspector.tsx`:

- **Actions open groups in arrival order**, keyed on `action_id`. A record joins the group its own
  `action_id` names; anything else — `action_id: null`, an id no action declared, a `crash_report`,
  a `media_chunk`, an unknown newer-minor type — falls into **Unattributed** (FR-039c). Nothing is
  dropped, and no record is attributed to an action that did not claim it.
- **The action row is the group header**, not a row inside it, so the count means "records this
  action produced". Timestamp comes from the same `logRow` the flat view uses; the summary is the
  count plus how many of those rows are `fail`-toned.
- **An action with no records keeps its group** and renders "No records" (FR-039d).
- **`keep` is the flat view's own predicate**, applied inside groups — one definition of "matches",
  so the two views can never disagree about which records survive a filter. While anything is
  narrowing, a group with no surviving record is hidden (FR-039e), unless the action's own label
  matches the query — otherwise a group could never be found by name, since the header is not a row.
- **Grouping is a view over the same `entries`**, so toggling is lossless by construction rather
  than by re-fetching. The selected record survives the toggle: `open` is resolved against all
  entries, not the visible ones.
- `RecordRow` was extracted so a record line is literally the same component in both views — a row
  cannot read differently because it is nested.

## Deliberate simplifications

- **No sort control.** FR-039e names "search/sort/filter"; sort order is arrival order in both views
  and there is no UI to change it — the same as feat-017 shipped. A sort control is one `useState`
  and a comparator when a real bench proves chronological is not enough.
- **Groups are not collapsible** and the group header is a `div`, not a disclosure button. Nothing
  in FR-039b–e asks for collapse; add it when a session with hundreds of actions makes scrolling the
  complaint.
- The toggle is a single chip that reads as its **current** state (`Flat` → click → `Grouped`), with
  `aria-pressed`. No segmented control, since there are exactly two views.
- The mockup (`qa-log-inspector.jsx`) has no grouped-view design — its only "group" is the session
  rail by device, which already shipped. The grouped view follows the screen's existing list styling.

## Evidence

`./verify.sh build` → `HARNESS_VERIFY: PASS (build)` · `./verify.sh test` →
`HARNESS_VERIFY: PASS (test)`, Vitest **60/60** (3 new in `LogInspector.test.tsx`: nesting +
empty group + Unattributed; filter-inside-groups; the lossless toggle), Rust **67/67**.
Verified in jsdom against mocked IPC — a live device stream needs a real SDK peer, which is another
project's deliverable.
