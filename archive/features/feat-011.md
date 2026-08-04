# feat-011 — CSV / Excel import with a row-level error preview

- **Status:** ✅ done · closed 2026-08-04 · **Depends on:** feat-009
- **Epic:** Desktop app (Tauri) · **By:** kevin-malik
- **Requirements:** FR-008 (SC-009, quickstart Scenario 13)

## Done when

- Test Cases import from **CSV and Excel** (FR-008).
- Missing required fields and invalid values are validated, and a preview shows **row-level errors
  before commit** (FR-008).
- A mixed file commits only its valid rows; the invalid ones are flagged and skipped (SC-009).
- Duplicate titles are **not** blocked and **not** flagged — neither against the file nor the store.

## What landed

- `desktop/src/import.ts` — new, and pure apart from the two `FileReader` helpers:
  - `parseDelimited` — RFC 4180-shaped scan (quoted delimiters, embedded newlines, `""` escapes).
    The delimiter is detected per file between `,`, `;` and tab, which is what Excel's *Save As*
    writes depending on locale.
  - `planTable(cells)` — the single validation path. One `ImportRow` per file line carrying either
    `input` or `errors`, never both, so an invalid row is structurally uncommittable. Required
    columns: `title`, `platform`. `lifecycle` defaults to `Active`; enum matching is
    case-insensitive (`ios` → `iOS`); unknown columns are ignored; blank lines are not rows.
    Whole-file failures (no header, header with no rows) come back as `error` with no rows.
  - `planImport(text)` — the CSV wrapper. `readText` / `readBase64` / `isWorkbook` — the file edges.
- `desktop/src-tauri/src/workbook.rs` — new. `read_workbook(base64) -> Vec<Vec<String>>`: decodes an
  `.xlsx`/`.xlsm`/`.xlsb`/`.xls` workbook with `calamine` and returns the first sheet as the same
  `string[][]` a CSV parses to. Registered in `lib.rs`.
- `desktop/src-tauri/tests/fixtures/cases.xlsx` — a hand-built three-row workbook (header, a full
  row, and a row whose title cell is *absent* rather than empty, which is what Excel writes).
- `desktop/src/TestCases.tsx`
  - `ImportPreview` — the FR-008 preview: every file line with its own errors, a `Ready` badge on
    the valid ones, and a commit button naming only the valid count.
  - `Import CSV / Excel` — a `<label>` over a hidden `<input type="file">`. A workbook goes to
    `read_workbook`, a text file to `parseDelimited`; both reach `planTable`.
  - `commitImport()` — one `save_test_case` per valid row, failures collected per line.
- `desktop/src/__tests__/TestCases.test.tsx` — 5 tests added (11 → 16).
- `desktop/src-tauri/Cargo.toml` — `calamine = "0.36"`.

## Evidence

| Check | Result |
|---|---|
| Every validation rule by line, and a duplicate title left unflagged (FR-008) | `TestCases.test.tsx` › *an import plan flags bad rows by line and never flags a duplicate title* ✅ |
| Mixed file: preview before any write, then only valid rows committed (SC-009) | `TestCases.test.tsx` › *a mixed import previews row errors before commit and commits only the valid rows* ✅ |
| Excel path: workbook → Rust decoder → same preview, sent as base64 | `TestCases.test.tsx` › *an Excel workbook is decoded by the Rust command and previewed like a CSV* ✅ |
| An undecodable workbook surfaces the decoder's reason | `TestCases.test.tsx` › *a workbook that cannot be decoded shows the reason from the decoder* ✅ |
| The two sources converge on one plan | `TestCases.test.tsx` › *a workbook table and the equivalent CSV produce the same plan* ✅ |
| Real `.xlsx` bytes decode to the expected cells, missing cell included | `workbook.rs` › *a_workbook_decodes_to_the_same_shape_a_csv_does* ✅ |
| Non-workbook bytes are an error, not a panic | `workbook.rs` › *a_file_that_is_not_a_workbook_is_an_error_and_not_a_panic* ✅ |
| Duplicate titles accepted by the store (FR-008, store side) | `test_case.rs` › *duplicate_titles_are_allowed_and_a_blank_title_is_refused* ✅ (feat-009) |
| Full build gate | `HARNESS_VERIFY: PASS (build)` — 2026-08-04, no warnings |
| Full test gate | `HARNESS_VERIFY: PASS (test)` — 2026-08-04; Vitest 27/27, Rust 34/34 |

Not verified in the running app: the screen sits behind sign-in, which needs a live
`GOOGLE_CLIENT_ID` + `TESTLAB_API_BASE_URL` (the environment gap recorded since feat-006). The jsdom
tests drive the real component tree, and the workbook decode is proven against real `.xlsx` bytes in
Rust.

## Decisions

**Excel is decoded in Rust (`calamine`), not in the webview (SheetJS).** `.xlsx` is a zip of XML, so
one of the two was unavoidable. SheetJS's npm release is frozen at `0.18.5` — the maintained versions
ship only from the vendor's own CDN — and that release carries a known prototype-pollution advisory,
which is a poor thing to point at untrusted spreadsheets. `calamine` is maintained, adds nothing to
the JS bundle, and keeps binary parsing on the side of the app that is already the trust boundary for
the file system. Also recorded in `CONSTITUTION.md` § Decisions, since it settles where binary
formats get parsed generally.

**Validation is one pure function over `string[][]`.** CSV and Excel differ only in how cells are
produced, so making the *rules* independent of the source means Excel support is a decoder and no new
rules. It also makes the whole of FR-008 assertable without a render or a file.

**An invalid row cannot carry a payload.** `ImportRow` holds `input` xor `errors`, so "commit only
the valid rows" is enforced by the type rather than by remembering to filter at the call site.

**Commit reuses `save_test_case` per row.** The FR-005 audit stamping and the FR-003c enum gate
already live there; a bulk command would duplicate both. Not atomic — the trade is deliberate and
the failures are reported per line.

**`base64` over the IPC, not a byte array or a file path.** `base64` was already a dependency, a JSON
number array is ~4x the bytes, and a path would mean adding `plugin-fs` and widening the capability
for a file the OS picker already handed us.

## Scope held

- **Only the first worksheet is read.** A multi-sheet workbook silently importing sheet 2 is worse
  than not reading it; FR-008 says nothing about sheet selection. Add a sheet picker when asked.
- **No column mapping UI.** The header row names the columns; recognised names are `title`,
  `description`, `platform`, `server`, `lifecycle`, `tags`, and anything else is ignored. FR-008 asks
  for validation and a preview, not for a mapping step.
- **Dates and formulas are read as their displayed text.** No Test Case field is a date or a number,
  so there is nothing to coerce.
- **Import is not atomic and rewrites the JSON store once per row.** Ceiling of the feat-009 store;
  feat-023's SQLite store gets one transaction. Recorded on `commitImport`.
- **No import of audit fields or ids.** `created_by`/`created_at` are stamped by the store — an
  import cannot claim authorship or resurrect an id.
