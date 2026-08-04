// FR-008: bulk import of Test Cases from a delimited file, validated row by row so the preview can
// flag bad rows *before* anything is committed. Everything here is pure — no file, no invoke — so
// the whole of FR-008's validation is testable without a render.
//
// Two file shapes reach the same row loop. CSV / TSV / semicolon-CSV are parsed here by
// `parseDelimited`; a binary `.xlsx` is decoded to the identical `string[][]` by the Rust
// `read_workbook` command (`src-tauri/src/workbook.rs`) — calamine rather than SheetJS, whose npm
// release is pinned to a version with a prototype-pollution advisory. `planTable` is where every
// *rule* about a valid row lives, and it cannot tell the two sources apart.

import { LIFECYCLES, PLATFORMS, type Lifecycle, type Platform } from './TestCases';

/** What `save_test_case` accepts (mirrors `test_case::TestCaseInput`). */
export type CaseInput = {
  title: string;
  description: string;
  platform: Platform;
  server: string;
  lifecycle: Lifecycle;
  tags: string[];
};

/** One file row. `input` is absent exactly when `errors` is non-empty — an invalid row is never
 *  committable, and a valid one carries the payload the commit sends unchanged. */
export type ImportRow = { line: number; title: string; errors: string[]; input?: CaseInput };

/** `error` is a whole-file problem (wrong file type, no header, nothing to import). When set,
 *  `rows` is empty and there is nothing to preview. */
export type ImportPlan = { rows: ImportRow[]; error?: string };

/** ponytail: `FileReader` rather than `Blob.text()`/`arrayBuffer()` — jsdom implements neither, so
 *  the modern one-liners are untestable here. `as` picks which read; both work everywhere. */
const read = (file: Blob, as: 'text' | 'dataURL'): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    as === 'text' ? reader.readAsText(file) : reader.readAsDataURL(file);
  });

export const readText = (file: Blob) => read(file, 'text');

/** Base64 for `read_workbook`, which is what a Rust command can take over the JSON IPC without a
 *  byte-array round trip. The data URL's `data:…;base64,` prefix is not part of the payload. */
export const readBase64 = async (file: Blob) =>
  (await read(file, 'dataURL')).replace(/^[^,]*,/, '');

/** Which files need the Rust decoder rather than `parseDelimited`. */
export const isWorkbook = (fileName: string) => /\.(xlsx|xlsm|xlsb|xls)$/i.test(fileName);

const COLUMNS =['title', 'description', 'platform', 'server', 'lifecycle', 'tags'] as const;

/** Excel writes comma, tab or semicolon depending on locale, so the delimiter is detected from the
 *  header line rather than assumed. */
function pickDelimiter(headerLine: string): string {
  const counts = [',', ';', '\t'].map((d) => [d, headerLine.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 1 ? counts[0][0] : ',';
}

/** RFC 4180-shaped scan: quoted fields may contain the delimiter, newlines and `""` escapes. */
export function parseDelimited(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const delim = pickDelimiter(body.split('\n')[0]);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (body[i + 1] === '"') (cell += '"'), i++;
      else quoted = false;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) (row.push(cell), (cell = ''));
    else if (ch === '\n') (row.push(cell), rows.push(row), (row = []), (cell = ''));
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length > 0) (row.push(cell), rows.push(row));
  return rows;
}

/** Case-insensitive match against a spec enum, so `ios` in a spreadsheet is not an error. */
const one = <T extends string>(options: readonly T[], raw: string): T | undefined =>
  options.find((o) => o.toLowerCase() === raw.trim().toLowerCase());

/** CSV / TSV / semicolon-CSV. `planTable` is the shared path an Excel workbook joins. */
export const planImport = (text: string): ImportPlan => planTable(parseDelimited(text));

/**
 * FR-008: validate every row, keep the invalid ones with their reasons, commit nothing.
 * Duplicate titles are deliberately not checked — neither against the file nor against the store.
 */
export function planTable(table: string[][]): ImportPlan {
  const header = table[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  if (!header.includes('title')) {
    return {
      rows: [],
      error: `The first row must be a header naming the columns. Recognised: ${COLUMNS.join(', ')} — “title” and “platform” are required.`,
    };
  }
  const at = (cells: string[], column: (typeof COLUMNS)[number]) =>
    (cells[header.indexOf(column)] ?? '').trim();

  const rows = table
    .slice(1)
    // A trailing newline, or a blank separator line, is not a row the user meant to import.
    .map((cells, i) => ({ cells, line: i + 2 }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ''))
    .map(({ cells, line }): ImportRow => {
      const title = at(cells, 'title');
      const platform = one(PLATFORMS, at(cells, 'platform'));
      const rawLifecycle = at(cells, 'lifecycle');
      const lifecycle = rawLifecycle === '' ? 'Active' : one(LIFECYCLES, rawLifecycle);
      const errors = [
        title === '' && 'Title is required.',
        !platform && `Platform must be one of ${PLATFORMS.join(', ')}.`,
        !lifecycle && `Lifecycle must be one of ${LIFECYCLES.join(', ')}.`,
      ].filter((e): e is string => typeof e === 'string');

      if (errors.length > 0 || !platform || !lifecycle) return { line, title, errors };
      return {
        line,
        title,
        errors,
        input: {
          title,
          description: at(cells, 'description'),
          platform,
          server: at(cells, 'server'),
          lifecycle,
          tags: at(cells, 'tags')
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      };
    });

  return rows.length === 0 ? { rows, error: 'That file has a header but no rows.' } : { rows };
}
