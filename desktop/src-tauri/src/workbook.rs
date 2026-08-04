//! FR-008's Excel half: decode a workbook to plain cells and hand them back to the webview, which
//! already owns the validation and the row-level preview (`src/import.ts`).
//!
//! Decoding happens here rather than in the webview because `.xlsx` is a zip of XML: in Rust that is
//! `calamine`, maintained and off the JS bundle; in the webview it is SheetJS, whose npm release is
//! frozen at a version with a known prototype-pollution advisory. The split keeps every *rule* about
//! what a valid row is in one pure TS function — this module only turns bytes into `string[][]`.

use std::io::Cursor;

use base64::{engine::general_purpose::STANDARD, Engine};
use calamine::{open_workbook_auto_from_rs, Reader};

/// The first worksheet as rows of trimmed cell text — the same shape `parseDelimited` produces for
/// a CSV, so the TS side cannot tell the two apart.
///
/// ponytail: base64 over the IPC boundary because `base64` is already a dependency and a JSON array
/// of bytes is ~4x the payload. Ceiling: the whole workbook is held in memory twice (encoded +
/// decoded); an import is spreadsheet-sized, and the upgrade path is `plugin-fs` + a path if someone
/// ever imports something that does not fit.
///
/// Only the **first** sheet is read. A multi-sheet workbook silently importing sheet 2 would be
/// worse than not reading it at all; FR-008 says nothing about sheet selection.
#[tauri::command]
pub fn read_workbook(base64: String) -> Result<Vec<Vec<String>>, String> {
    let bytes = STANDARD
        .decode(base64)
        .map_err(|e| format!("That file could not be read: {e}"))?;
    let mut workbook = open_workbook_auto_from_rs(Cursor::new(bytes))
        .map_err(|e| format!("That is not a readable Excel workbook: {e}"))?;
    let first = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or("That workbook has no sheets.")?;
    let range = workbook
        .worksheet_range(&first)
        .map_err(|e| format!("Sheet “{first}” could not be read: {e}"))?;
    Ok(range
        .rows()
        .map(|row| row.iter().map(|c| c.to_string().trim().into()).collect())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    // A three-row sheet: header, a full row, and a row whose title cell is *absent* rather than
    // empty — which is what Excel writes, and the case a naive reader turns into a shifted row.
    const CASES_XLSX: &[u8] = include_bytes!("../tests/fixtures/cases.xlsx");

    #[test]
    fn a_workbook_decodes_to_the_same_shape_a_csv_does() {
        let rows = read_workbook(STANDARD.encode(CASES_XLSX)).expect("the fixture is a workbook");

        assert_eq!(rows[0], ["Title", "Platform", "Tags"]);
        assert_eq!(rows[1], ["Checkout with saved card", "iOS", "Payments"]);
        // The missing cell stays a blank in column A, so `title` reads empty and the row is flagged
        // by `planImport` — not silently filled from the next column.
        assert_eq!(rows[2], ["", "Both", ""]);
    }

    #[test]
    fn a_file_that_is_not_a_workbook_is_an_error_and_not_a_panic() {
        assert!(read_workbook("not base64 at all!!".into()).is_err());
        assert!(read_workbook(STANDARD.encode("Title,Platform\nA CSV,Both\n")).is_err());
    }
}
