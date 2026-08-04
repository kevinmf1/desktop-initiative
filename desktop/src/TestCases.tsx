import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { t } from './tokens';

// Layout follows design/desktop-qa/uploads/QA-Tools (1)/qa-test-cases.jsx — table of cases,
// expandable per-plan instances, single roll-up badge. Where the mockup and the spec disagree the
// spec wins: the mockup rolls up to three states, FR-003a defines five with a precedence order.

export const PLATFORMS = ['iOS', 'Android', 'Both'] as const;
export const LIFECYCLES = ['Active', 'Archived'] as const;

/** FR-003c — enforced again in Rust (`test_case::Platform`), which is the real gate. */
export type Platform = (typeof PLATFORMS)[number];
export type Lifecycle = (typeof LIFECYCLES)[number];

/** Mirrors `test_case::TestCase`. No run-status field exists to mirror (FR-003/FR-003a). */
export type TestCase = {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  platform: Platform;
  server: string;
  lifecycle: Lifecycle;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  deleted_at: string | null;
};

/** One Test Plan Item's status for this case. Owned by feat-012; until it lands every case has
 *  zero instances, which FR-003a's last precedence rung already covers as `Not Run`. */
export type PlanInstance = { plan: string; status: 'Not Run' | 'Passed' | 'Failed' | 'Blocked' };

export const SUMMARY = ['Has Fail', 'Blocked', 'In Progress', 'All Passed', 'Not Run'] as const;
export type Summary = (typeof SUMMARY)[number];

/** FR-003a: computed on read across this case's plan instances, in the given precedence order.
 *  Never stored — a stored copy is stale the moment any plan instance moves. */
export function summaryStatus(instances: PlanInstance[]): Summary {
  if (instances.some((i) => i.status === 'Failed')) return 'Has Fail';
  if (instances.some((i) => i.status === 'Blocked')) return 'Blocked';
  const passed = instances.filter((i) => i.status === 'Passed').length;
  if (passed > 0 && passed < instances.length) return 'In Progress';
  if (passed > 0) return 'All Passed';
  return 'Not Run';
}

export const SORTS = ['Recently updated', 'Title', 'Status', 'Platform'] as const;
export type Sort = (typeof SORTS)[number];

/** FR-004. There is no separate `category` field to filter on: FR-003 defines the axis as
 *  "category/tag" and the store keeps it as `tags`, so the category filter *is* the tag filter.
 *  An empty string on a filter means "any". */
export type View = {
  query: string;
  tag: string;
  status: Summary | '';
  platform: Platform | '';
  server: string;
  sort: Sort;
};

export const ALL_CASES: View = {
  query: '',
  tag: '',
  status: '',
  platform: '',
  server: '',
  sort: 'Recently updated',
};

/** FR-004: search, filter and sort in one pass. Pure, so the whole of FR-004 is testable without
 *  a render, and it takes `instancesByCase` because the status axis filters and sorts the
 *  **derived** summary (FR-003a) — there is no status column to query. */
export function arrange(
  cases: TestCase[],
  instancesByCase: Record<string, PlanInstance[]>,
  v: View,
): TestCase[] {
  const summaryOf = (c: TestCase) => summaryStatus(instancesByCase[c.id] ?? []);
  const q = v.query.trim().toLowerCase();
  const kept = cases.filter(
    (c) =>
      (q === '' || [c.title, c.description, ...c.tags].some((s) => s.toLowerCase().includes(q))) &&
      (v.tag === '' || c.tags.includes(v.tag)) &&
      (v.status === '' || summaryOf(c) === v.status) &&
      (v.platform === '' || c.platform === v.platform) &&
      (v.server === '' || c.server === v.server),
  );
  const order: Record<Sort, (a: TestCase, b: TestCase) => number> = {
    // Parsed rather than string-compared: the store writes RFC 3339, which sorts lexically only
    // while every row carries the same UTC offset.
    'Recently updated': (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
    Title: (a, b) => a.title.localeCompare(b.title),
    Status: (a, b) => SUMMARY.indexOf(summaryOf(a)) - SUMMARY.indexOf(summaryOf(b)),
    Platform: (a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform),
  };
  return kept.sort(order[v.sort]);
}

const SUMMARY_COLOR: Record<Summary, [string, string, string]> = {
  'Has Fail': [t.fail, t.failLight, t.failBorder],
  Blocked: [t.blocked, t.blockedLight, t.blockedBorder],
  'In Progress': [t.accent, t.accentLight, t.accentBorder],
  'All Passed': [t.pass, t.passLight, t.passBorder],
  'Not Run': [t.skip, t.skipLight, t.skipBorder],
};

function Badge({ label, tone }: { label: string; tone: [string, string, string] }) {
  const [color, background, border] = tone;
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '3px 10px',
        borderRadius: t.rFull,
        background,
        border: `1px solid ${border}`,
        color,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

type Draft = {
  id?: string;
  title: string;
  description: string;
  platform: Platform;
  server: string;
  lifecycle: Lifecycle;
  tags: string;
};

const BLANK: Draft = {
  title: '',
  description: '',
  platform: 'Both',
  server: '',
  lifecycle: 'Active',
  tags: '',
};

const draftOf = (c: TestCase): Draft => ({
  id: c.id,
  title: c.title,
  description: c.description,
  platform: c.platform,
  server: c.server,
  lifecycle: c.lifecycle,
  tags: c.tags.join(', '),
});

const field = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box' as const,
  marginTop: 4,
  padding: '7px 9px',
  border: `1px solid ${t.border}`,
  borderRadius: t.rSm,
  fontFamily: t.font,
  fontSize: 13,
  color: t.text,
  background: t.surface,
};
const labelStyle = { display: 'block', fontSize: 12, color: t.text2, marginBottom: 10 };
const button = (primary: boolean) => ({
  height: 32,
  padding: '0 14px',
  border: primary ? 0 : `1px solid ${t.border}`,
  borderRadius: t.rSm,
  background: primary ? t.accent : t.surface,
  color: primary ? '#fff' : t.text,
  fontFamily: t.font,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
});

function CaseForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      aria-label={draft.id ? 'Edit Test Case' : 'New Test Case'}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{
        padding: 16,
        margin: '0 0 12px',
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: t.r,
      }}
    >
      <label style={labelStyle}>
        Title
        <input
          style={field}
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
      </label>
      <label style={labelStyle}>
        Description
        <textarea
          style={{ ...field, minHeight: 56, resize: 'vertical' }}
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </label>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ ...labelStyle, flex: 1 }}>
          Platform
          <select
            style={field}
            value={draft.platform}
            onChange={(e) => onChange({ ...draft, platform: e.target.value as Platform })}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          Server
          <input
            style={field}
            value={draft.server}
            onChange={(e) => onChange({ ...draft, server: e.target.value })}
          />
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          Lifecycle
          <select
            style={field}
            value={draft.lifecycle}
            onChange={(e) => onChange({ ...draft, lifecycle: e.target.value as Lifecycle })}
          >
            {LIFECYCLES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={labelStyle}>
        Tags
        <input
          style={field}
          value={draft.tags}
          onChange={(e) => onChange({ ...draft, tags: e.target.value })}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={button(true)}>
          Save
        </button>
        <button type="button" onClick={onCancel} style={button(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const cell = { fontSize: 13, color: t.text, padding: '10px 8px', textAlign: 'left' as const };
const head = {
  ...cell,
  fontSize: 10,
  fontWeight: 700,
  color: t.text3,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  fontFamily: t.mono,
  background: t.surface2,
  borderBottom: `1px solid ${t.border}`,
};

function CaseRow({
  c,
  instances,
  onEdit,
  onDelete,
}: {
  c: TestCase;
  instances: PlanInstance[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr style={{ borderBottom: `1px solid ${t.borderSubtle}` }}>
        <td style={cell}>
          {/* FR-003a: per-instance status is visible when the row is expanded. */}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            style={{ ...button(false), height: 24, padding: '0 8px', fontFamily: t.mono }}
          >
            {expanded ? '−' : '+'}
          </button>
        </td>
        <td style={cell}>
          <div style={{ fontWeight: 500 }}>{c.title}</div>
          {c.tags.length > 0 && (
            <div style={{ fontSize: 11, color: t.text3, marginTop: 2 }}>{c.tags.join(' · ')}</div>
          )}
        </td>
        <td style={cell}>
          <Badge label={summaryStatus(instances)} tone={SUMMARY_COLOR[summaryStatus(instances)]} />
        </td>
        <td style={cell}>{c.platform}</td>
        <td style={cell}>{c.server}</td>
        <td style={cell}>
          <Badge
            label={c.lifecycle}
            tone={
              c.lifecycle === 'Active' ? [t.text2, t.surface2, t.border] : [t.warn, t.warnLight, t.warnBorder]
            }
          />
        </td>
        {/* FR-005: audit metadata is displayed, not just stored. */}
        <td style={{ ...cell, fontSize: 11, color: t.text3 }}>
          {new Date(c.updated_at).toLocaleString()}
          <div>by {c.updated_by}</div>
        </td>
        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
          <button type="button" onClick={onEdit} style={{ ...button(false), height: 26 }}>
            Edit
          </button>{' '}
          <button type="button" onClick={onDelete} style={{ ...button(false), height: 26 }}>
            Delete
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td />
          <td colSpan={7} style={{ ...cell, background: t.accentLight, fontSize: 12 }}>
            {/* FR-007: one case, many plans. Each plan links to this row; nothing is copied, so
                editing the case here changes it for every plan that uses it. */}
            {instances.length === 0
              ? 'Not in any Test Plan yet — no per-plan status to show.'
              : instances.map((i) => (
                  <div key={i.plan} style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
                    <span style={{ flex: 1 }}>{i.plan}</span>
                    <span style={{ fontWeight: 600 }}>{i.status}</span>
                  </div>
                ))}
            {/* FR-005: the created half of the audit pair — the row shows the updated half. */}
            <div style={{ marginTop: 6, fontSize: 11, color: t.text3 }}>
              Created by {c.created_by} on {new Date(c.created_at).toLocaleString()}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** FR-004's controls. Native `<select>`/`<input type="search">` — a combobox library would buy
 *  nothing here, and the native ones are keyboard- and screen-reader-correct for free. */
function Toolbar({
  v,
  onChange,
  tags,
  servers,
}: {
  v: View;
  onChange: (v: View) => void;
  tags: string[];
  servers: string[];
}) {
  const pick = (
    label: string,
    value: string,
    any: string,
    options: readonly string[],
    set: (value: string) => void,
  ) => (
    <label style={{ fontSize: 11, color: t.text3, fontFamily: t.mono }}>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => set(e.target.value)}
        style={{ ...field, marginTop: 2, width: 'auto', fontFamily: t.font }}
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: t.text3, fontFamily: t.mono, flex: '1 1 200px' }}>
        Search cases
        <input
          type="search"
          aria-label="Search cases"
          placeholder="Title, description or tag…"
          value={v.query}
          onChange={(e) => onChange({ ...v, query: e.target.value })}
          style={{ ...field, marginTop: 2 }}
        />
      </label>
      {pick('Tag', v.tag, 'Any tag', tags, (tag) => onChange({ ...v, tag }))}
      {/* Filters the FR-003a summary computed on read, not a stored column. */}
      {pick('Status', v.status, 'Any status', SUMMARY, (s) => onChange({ ...v, status: s as Summary }))}
      {pick('Platform', v.platform, 'Any platform', PLATFORMS, (p) =>
        onChange({ ...v, platform: p as Platform }),
      )}
      {pick('Server', v.server, 'Any server', servers, (server) => onChange({ ...v, server }))}
      <label style={{ fontSize: 11, color: t.text3, fontFamily: t.mono }}>
        Sort by
        <select
          aria-label="Sort by"
          value={v.sort}
          onChange={(e) => onChange({ ...v, sort: e.target.value as Sort })}
          style={{ ...field, marginTop: 2, width: 'auto', fontFamily: t.font }}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** FR-003: full CRUD, scoped to the active workspace (FR-001). FR-004: searchable, filterable and
 *  sortable over that list. */
export default function TestCases({
  workspaceId,
  // ponytail: no Test Plan Item exists before feat-012, so every case has zero instances and
  // FR-003a's derived badge reads `Not Run`. feat-012 passes the real map in; the precedence is
  // implemented and tested now so the badge is right the moment it does.
  instancesByCase = {},
}: {
  workspaceId: string;
  instancesByCase?: Record<string, PlanInstance[]>;
}) {
  const [cases, setCases] = useState<TestCase[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<View>(ALL_CASES);
  const [error, setError] = useState('');

  async function reload() {
    try {
      const listed = await invoke<TestCase[]>('list_test_cases', { workspaceId });
      setCases(listed ?? []);
    } catch (reason) {
      setError(String(reason));
      setCases([]);
    }
  }

  // FR-001: the list is re-read per workspace, and `WorkspaceShell` remounts this screen on a
  // switch anyway, so one workspace's cases can never be shown under another's.
  useEffect(() => {
    reload();
  }, [workspaceId]);

  async function save() {
    if (!draft) return;
    const { tags, ...rest } = draft;
    try {
      await invoke('save_test_case', {
        workspaceId,
        input: {
          ...rest,
          tags: tags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      setDraft(null);
      setError('');
      await reload();
    } catch (reason) {
      setError(String(reason));
    }
  }

  // FR-006: confirmed, and soft in the store — a session or bug that references this case still
  // resolves afterwards.
  async function remove(c: TestCase) {
    if (!confirm(`Delete “${c.title}”? Sessions and bugs that reference it stay viewable.`)) return;
    try {
      await invoke('delete_test_case', { workspaceId, id: c.id });
      setError('');
      await reload();
    } catch (reason) {
      setError(String(reason));
    }
  }

  if (cases === null) return null;

  // The filter choices are the values actually present, so a stale option can never be offered.
  const values = (of: (c: TestCase) => string[]) =>
    [...new Set(cases.flatMap(of))].filter(Boolean).sort();
  const shown = arrange(cases, instancesByCase, view);

  return (
    <div style={{ padding: 20, overflowY: 'auto', fontFamily: t.font }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: t.text2 }}>
          {shown.length === cases.length
            ? `${cases.length} ${cases.length === 1 ? 'case' : 'cases'}`
            : `${shown.length} of ${cases.length} cases`}
        </span>
        <button
          type="button"
          onClick={() => setDraft(BLANK)}
          style={{ ...button(true), marginLeft: 'auto' }}
        >
          New Case
        </button>
      </div>

      {error && (
        <p role="alert" style={{ margin: '0 0 12px', color: t.fail, fontSize: 13 }}>
          {error}
        </p>
      )}

      {draft && (
        <CaseForm
          draft={draft}
          onChange={setDraft}
          onSubmit={save}
          onCancel={() => {
            setDraft(null);
            setError('');
          }}
        />
      )}

      {cases.length > 0 && (
        <Toolbar
          v={view}
          onChange={setView}
          tags={values((c) => c.tags)}
          servers={values((c) => [c.server])}
        />
      )}

      {cases.length === 0 ? (
        <p style={{ fontSize: 13, color: t.text2 }}>No Test Cases in this workspace yet.</p>
      ) : shown.length === 0 ? (
        <p style={{ fontSize: 13, color: t.text2 }}>
          No Test Case matches the current search and filters.
        </p>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: t.surface,
            border: `1px solid ${t.border}`,
            borderRadius: t.r,
          }}
        >
          <thead>
            <tr>
              <th style={head} aria-label="Expand" />
              <th style={head}>Title</th>
              <th style={head}>Status</th>
              <th style={head}>Platform</th>
              <th style={head}>Server</th>
              <th style={head}>Lifecycle</th>
              <th style={head}>Updated</th>
              <th style={head} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <CaseRow
                key={c.id}
                c={c}
                instances={instancesByCase[c.id] ?? []}
                onEdit={() => setDraft(draftOf(c))}
                onDelete={() => remove(c)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
