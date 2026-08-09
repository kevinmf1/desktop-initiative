import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { groupRows, logRow, type Entry, type Frame } from './LogInspector';
import { SEVERITIES, STATUSES, type Bug, type TestSession } from './Runner';
import type { TestCase } from './TestCases';
import { t } from './tokens';

/** The triage patch `bug.rs::BugEdit` takes. Absent means "leave it" — one control, one field. */
export type BugPatch = Partial<{
  title: string;
  description: string;
  severity: Bug['severity'];
  status: Bug['status'];
  test_case_id: string;
  window_seconds: number;
}>;

const SEVERITY_COLOR: Record<Bug['severity'], string> = {
  P0: t.fail,
  P1: t.warn,
  P2: t.text2,
  P3: t.text3,
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString();

/** What `sync.rs::drain` reports back. Offline is a state, not a failure (FR-035, SC-005). */
type SyncReport = {
  queued: number;
  applied: number;
  duplicate: number;
  rejected: string[];
  offline: boolean;
  detail: string;
};

type MediaReport = {
  queued: number;
  uploaded: number;
  offline: boolean;
  detail: string;
};

/** FR-044: a bug-attached capture, as `capture.rs` stores it. `received`/`total_size` are the
 *  transfer, `uploaded_at` is the backend — a capture is "pending upload" until the second one. */
export type Capture = {
  id: string;
  bug_id: string;
  content_type: string;
  total_size: number;
  received: number;
  verified: boolean;
  uploaded_at: string | null;
};

/** FR-044a: evidence-in-transit is shown as itself. A capture is never invisible just because its
 *  bytes have not reached the backend — that would read as "no evidence was taken". */
export function captureState(capture: Capture): string {
  if (capture.uploaded_at) return 'Uploaded';
  if (capture.verified) return 'Pending upload';
  const share = capture.total_size > 0 ? Math.floor((capture.received / capture.total_size) * 100) : 0;
  return `Receiving ${share}%`;
}

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

/** FR-031/FR-032: the excerpt is *derived* from the window, never stored with the bug. A frame the
 *  contract gave no timestamp to cannot be placed in the window, so it is left out rather than
 *  guessed into the evidence. */
export function withinWindow(entries: Entry[], bug: Bug): Entry[] {
  const from = Date.parse(bug.window_start);
  const to = Date.parse(bug.window_end);
  return entries.filter(({ row }) => {
    const at = Date.parse(row.at);
    return Number.isFinite(at) && at >= from && at <= to;
  });
}

/** FR-031's "the User Actions that preceded it" — inside the window, up to the marker. What came
 *  *after* the click is in the excerpt below but is not what the tester was doing beforehand. */
export function precedingActions(entries: Entry[], bug: Bug): Entry[] {
  const marked = Date.parse(bug.marked_at);
  return withinWindow(entries, bug).filter(
    ({ row }) => row.kind === 'user_action' && Date.parse(row.at) <= marked,
  );
}

const field: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 4,
  padding: '7px 9px',
  border: `1px solid ${t.border}`,
  borderRadius: t.rSm,
  fontFamily: t.font,
  fontSize: 13,
  color: t.text,
  background: t.surface,
};
const label: React.CSSProperties = { display: 'block', fontSize: 12, color: t.text2, marginBottom: 10 };
const listHeader: React.CSSProperties = {
  height: 34,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  flexShrink: 0,
  background: t.surface2,
  borderBottom: `1px solid ${t.border}`,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: t.text3,
  fontFamily: t.mono,
};
const sectionTitle: React.CSSProperties = {
  margin: '18px 0 8px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: t.text3,
};

function Triage({ bug, cases, onPatch }: { bug: Bug; cases: TestCase[]; onPatch: (patch: BugPatch) => void }) {
  // Text fields commit on blur: a keystroke-per-write would make every character a disk rewrite of
  // the whole store. Selects commit immediately — there is no half-chosen severity.
  const [title, setTitle] = useState(bug.title);
  const [description, setDescription] = useState(bug.description);
  const [seconds, setSeconds] = useState(String(bug.window_seconds));

  useEffect(() => {
    setTitle(bug.title);
    setDescription(bug.description);
    setSeconds(String(bug.window_seconds));
  }, [bug.id, bug.title, bug.description, bug.window_seconds]);

  return (
    <form aria-label="Bug details" onSubmit={(event) => event.preventDefault()}>
      <label style={label}>
        Title
        <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => onPatch({ title })} />
      </label>
      <label style={label}>
        Description
        <textarea
          style={{ ...field, minHeight: 72, resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onPatch({ description })}
        />
      </label>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ ...label, flex: 1 }}>
          Severity
          <select
            style={field}
            value={bug.severity}
            onChange={(e) => onPatch({ severity: e.target.value as Bug['severity'] })}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity}>{severity}</option>
            ))}
          </select>
        </label>
        <label style={{ ...label, flex: 1 }}>
          Status
          <select style={field} value={bug.status} onChange={(e) => onPatch({ status: e.target.value as Bug['status'] })}>
            {STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label style={{ ...label, flex: 1 }}>
          Related Test Case
          <select style={field} value={bug.test_case_id ?? ''} onChange={(e) => onPatch({ test_case_id: e.target.value })}>
            <option value="">Not linked</option>
            {cases.map((testCase) => (
              <option key={testCase.id} value={testCase.id}>
                {testCase.title}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...label, flex: 1 }}>
          Evidence window (± seconds)
          <input
            style={field}
            type="number"
            min={1}
            max={3600}
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            onBlur={() => Number(seconds) !== bug.window_seconds && onPatch({ window_seconds: Number(seconds) })}
          />
        </label>
      </div>
    </form>
  );
}

/** FR-031. Grouped by User Action with the Log Inspector's own `groupRows`, so an excerpt reads
 *  exactly like the live view it was cut from — no second idea of what a record looks like. */
function Evidence({ bug, entries, captures }: { bug: Bug; entries: Entry[]; captures: Capture[] }) {
  const excerpt = useMemo(() => withinWindow(entries, bug), [entries, bug]);
  const actions = useMemo(() => precedingActions(entries, bug), [entries, bug]);
  const groups = useMemo(() => groupRows(excerpt, () => true, { on: false, query: '' }), [excerpt]);

  return (
    <>
      <h3 style={sectionTitle}>Marker</h3>
      <div style={{ fontSize: 12, fontFamily: t.mono, color: t.text2 }}>
        {clock(bug.marked_at)} · window {clock(bug.window_start)}–{clock(bug.window_end)} (±{bug.window_seconds}s) ·
        device {bug.device_id}
      </div>

      <h3 style={sectionTitle}>Preceding User Actions ({actions.length})</h3>
      {actions.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: t.text2 }}>
          No User Action was streamed in the window before the marker.
        </p>
      ) : (
        <ol aria-label="Preceding User Actions" style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: t.text }}>
          {actions.map(({ row }) => (
            <li key={row.key} style={{ padding: '2px 0' }}>
              {row.title}
              <span style={{ marginLeft: 8, fontFamily: t.mono, fontSize: 11, color: t.text3 }}>
                {row.at.slice(11, 19)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <h3 style={sectionTitle}>Log excerpt ({excerpt.length} records)</h3>
      {excerpt.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: t.text2 }}>
          This device streamed no record inside the window.
        </p>
      ) : (
        <ul aria-label="Log excerpt" style={{ margin: 0, padding: 0, listStyle: 'none', border: `1px solid ${t.border}`, borderRadius: t.rSm }}>
          {groups.map((group) => (
            <li key={group.key}>
              <div style={{ display: 'flex', gap: 8, padding: '6px 10px', background: t.surface2, borderBottom: `1px solid ${t.border}`, fontSize: 12, fontWeight: 700, color: t.text }}>
                <span>{group.label}</span>
                <span style={{ marginLeft: 'auto', fontFamily: t.mono, fontSize: 11, color: group.errors ? t.fail : t.text3 }}>
                  {group.rows.length} rec{group.errors ? ` · ${group.errors} error${group.errors === 1 ? '' : 's'}` : ''}
                </span>
              </div>
              {group.rows.map(({ row }) => (
                <div key={row.key} style={{ display: 'flex', gap: 10, padding: '5px 10px 5px 20px', borderBottom: `1px solid ${t.borderSubtle}`, fontFamily: t.mono, fontSize: 11 }}>
                  <span style={{ width: 80, flexShrink: 0, color: t.text3 }}>{row.kind}</span>
                  <span style={{ flex: 1, minWidth: 0, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.title}
                  </span>
                  <span style={{ flexShrink: 0, color: row.tone === 'fail' ? t.fail : t.text2 }}>{row.detail}</span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <h3 style={sectionTitle}>Attached captures</h3>
      {captures.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: t.text2 }}>No screenshots or recordings are attached.</p>
      ) : (
        <ul aria-label="Attached captures" style={{ margin: 0, padding: 0, listStyle: 'none', border: `1px solid ${t.border}`, borderRadius: t.rSm }}>
          {captures.map((capture) => {
            const state = captureState(capture);
            return (
              <li key={capture.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${t.borderSubtle}`, fontSize: 12 }}>
                <span style={{ fontFamily: t.mono, color: t.text }}>{capture.content_type || 'capture'}</span>
                <span style={{ color: t.text3 }}>{size(capture.total_size)}</span>
                <span style={{ marginLeft: 'auto', color: state === 'Uploaded' ? t.pass : state === 'Pending upload' ? t.warn : t.text2 }}>
                  {state}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function Bugs({ workspaceId }: { workspaceId: string }) {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [pickedId, setPickedId] = useState('');
  const [error, setError] = useState('');
  const [syncNote, setSyncNote] = useState('');

  useEffect(() => {
    Promise.all([
      invoke<Bug[]>('list_bugs', { workspaceId }),
      invoke<TestCase[]>('list_test_cases', { workspaceId }),
      invoke<TestSession[]>('list_test_sessions', { workspaceId }),
    ]).then(
      ([listedBugs, listedCases, listedSessions]) => {
        setBugs(listedBugs ?? []);
        setCases((listedCases ?? []).filter((testCase) => testCase.lifecycle === 'Active'));
        setSessions(listedSessions ?? []);
      },
      (reason) => setError(String(reason)),
    );
  }, [workspaceId]);

  const picked = bugs.find((bug) => bug.id === pickedId) ?? bugs[0];

  // The device names the WS session (CONSTITUTION 2026-08-10), so a bug — which knows the *desktop's*
  // session id — resolves its frames by device and by time, not by session key. `device_records`
  // reads the durable log (FR-035b), so this works after a restart and with no device connected.
  // Loaded on selection rather than polled: a marked moment is already in the past.
  useEffect(() => {
    if (!picked) {
      setFrames([]);
      setCaptures([]);
      return;
    }
    let live = true;
    Promise.all([
      invoke<Frame[]>('device_records', { deviceId: picked.device_id }),
      invoke<Capture[]>('list_captures', { workspaceId, bugId: picked.id }),
    ]).then(
      ([listedFrames, listedCaptures]) => {
        if (live) {
          setFrames(listedFrames ?? []);
          setCaptures(listedCaptures ?? []);
        }
      },
      () => {
        if (live) {
          setFrames([]);
          setCaptures([]);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [workspaceId, picked?.id, picked?.device_id]);

  const entries = useMemo(() => frames.map((frame, index) => ({ row: logRow(frame, index), frame })), [frames]);

  // FR-035b: the backend is *later*. This button only ever asks the outbox to drain now — nothing
  // it can do or fail to do changes what is already recorded locally.
  async function syncNow() {
    try {
      // These requests are intentionally independent: a large or unreachable media upload cannot
      // hold the Bug record back (FR-044b).
      const [recordResult, mediaResult] = await Promise.allSettled([
        invoke<SyncReport>('sync_now', { workspaceId }),
        invoke<MediaReport>('upload_captures', { workspaceId }),
      ]);
      const recordNote = recordResult.status === 'fulfilled' ? recordResult.value.detail : String(recordResult.reason);
      const mediaNote = mediaResult.status === 'fulfilled' ? mediaResult.value.detail : String(mediaResult.reason);
      setSyncNote(`${recordNote} ${mediaNote}`);
      if (recordResult.status === 'fulfilled' && !recordResult.value.offline) {
        setBugs(await invoke<Bug[]>('list_bugs', { workspaceId }));
      }
      if (picked) {
        setCaptures(await invoke<Capture[]>('list_captures', { workspaceId, bugId: picked.id }));
      }
    } catch (reason) {
      setSyncNote(String(reason));
    }
  }

  async function patch(bug: Bug, change: BugPatch) {
    try {
      const updated = await invoke<Bug>('update_bug', { workspaceId, id: bug.id, patch: change });
      setBugs((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setError('');
    } catch (reason) {
      setError(String(reason));
    }
  }

  if (bugs.length === 0) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, fontFamily: t.font }}>
        <div role="status" style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: t.text }}>No bugs recorded</div>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: t.text2, lineHeight: 1.6 }}>
            Hit <strong>Bug Occurred</strong> on a running session in the Runner. The marker lands
            here with the log excerpt and the User Actions around it.
          </p>
          {error && (
            <p role="alert" style={{ marginTop: 12, fontSize: 13, color: t.fail }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  const sessionOf = (bug: Bug) => sessions.find((session) => session.id === bug.test_session_id);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', fontFamily: t.font }}>
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${t.border}`, background: t.surface }}>
        <div style={listHeader}>
          <span>Bugs · {bugs.length}</span>
          {/* FR-035b made visible: how many records are still only local, and the way to try now. */}
          <button
            type="button"
            onClick={syncNow}
            style={{
              marginLeft: 'auto',
              all: 'unset',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: t.accent,
            }}
          >
            Sync now
          </button>
        </div>
        {(syncNote || bugs.some((bug) => bug.synced_at === null)) && (
          <div role="status" style={{ padding: '6px 12px', fontSize: 11, color: t.text2, borderBottom: `1px solid ${t.borderSubtle}` }}>
            {syncNote || `${bugs.filter((bug) => bug.synced_at === null).length} not yet synced — kept locally.`}
          </div>
        )}
        <ul aria-label="Bugs" style={{ flex: 1, margin: 0, padding: 0, listStyle: 'none', overflowY: 'auto' }}>
          {bugs.map((bug) => {
            const on = picked?.id === bug.id;
            return (
              <li key={bug.id}>
                <button
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => setPickedId(bug.id)}
                  style={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    display: 'block',
                    width: '100%',
                    cursor: 'pointer',
                    padding: '9px 12px',
                    borderBottom: `1px solid ${t.borderSubtle}`,
                    borderLeft: `3px solid ${on ? t.accent : 'transparent'}`,
                    background: on ? t.accentLight : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 700, color: SEVERITY_COLOR[bug.severity] }}>
                      {bug.severity}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bug.title}
                    </span>
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11, color: t.text3 }}>
                    {bug.status} · {clock(bug.marked_at)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 20 }}>
        {error && (
          <p role="alert" style={{ margin: '0 0 12px', padding: '10px 12px', color: t.fail, background: t.failLight, borderRadius: t.rSm }}>
            {error}
          </p>
        )}
        {picked && (
          <article aria-label={`Bug ${picked.title}`}>
            {/* FR-030: the run's own facts, copied at mark time and shown as read-only — a record
                whose observation can be rewritten is not evidence. */}
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: t.text2 }}>
              <span>Session {sessionOf(picked)?.name ?? picked.test_session_id}</span>
              <span>Build {picked.build_version || '—'}</span>
              <span>{picked.environment || '—'}</span>
              <span>{sessionOf(picked)?.platform ?? '—'}</span>
              <span>Marked by {picked.marked_by}</span>
              <span style={{ color: picked.synced_at ? t.text2 : t.warn }}>
                {picked.synced_at ? `Synced ${clock(picked.synced_at)}` : 'Not yet synced'}
              </span>
            </div>
            <Triage bug={picked} cases={cases} onPatch={(change) => patch(picked, change)} />
            <Evidence bug={picked} entries={entries} captures={captures} />
          </article>
        )}
      </div>
    </div>
  );
}
