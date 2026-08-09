import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import { sessionLabel, sessionState, type DeviceSession } from './Devices';
import { t } from './tokens';

// A frame exactly as `device-desktop-ws` put it on the wire — the Rust side hands them over
// untouched, so this screen is the only place that decides what a record looks like.
export type Frame = Record<string, unknown>;

export type LogRow = {
  key: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
  tone: 'fail' | 'warn' | 'pass' | 'muted';
};

const TONE: Record<LogRow['tone'], string> = {
  fail: t.fail,
  warn: t.warn,
  pass: t.pass,
  muted: t.text2,
};

const str = (frame: Frame, key: string) => (typeof frame[key] === 'string' ? (frame[key] as string) : '');
const num = (frame: Frame, key: string) => (typeof frame[key] === 'number' ? (frame[key] as number) : null);

/** FR-029a: a row is derived from the frame's *contract* fields only. There is deliberately no
 *  `platform` branch anywhere here — the same frame renders the same row whichever SDK sent it,
 *  which is the parity requirement rather than a promise about it. */
export function logRow(frame: Frame, index: number): LogRow {
  const kind = str(frame, 'type');
  const at =
    str(frame, 'started_at') ||
    str(frame, 'logged_at') ||
    str(frame, 'occurred_at') ||
    str(frame, 'crashed_at');
  const row = { key: `${index} ${kind}`, kind, at };

  switch (kind) {
    case 'log_event': {
      const status = num(frame, 'status_code');
      const error = str(frame, 'error');
      const duration = num(frame, 'duration_ms');
      return {
        ...row,
        title: `${str(frame, 'method') || '—'} ${str(frame, 'url')}`.trim(),
        // An in-progress request has no status yet — the phase is the honest answer (FR-025).
        detail: [status ?? str(frame, 'phase'), duration === null ? '' : `${duration}ms`, error]
          .filter(Boolean)
          .join(' · '),
        tone: error || (status ?? 0) >= 500 ? 'fail' : (status ?? 0) >= 400 ? 'warn' : status ? 'pass' : 'muted',
      };
    }
    case 'app_log': {
      const level = str(frame, 'level');
      const tag = str(frame, 'tag');
      return {
        ...row,
        title: [tag, str(frame, 'message')].filter(Boolean).join(': '),
        detail: [level, str(frame, 'source')].filter(Boolean).join(' · '),
        tone: level === 'error' ? 'fail' : level === 'warn' ? 'warn' : 'muted',
      };
    }
    case 'user_action':
      return {
        ...row,
        title: str(frame, 'label') || str(frame, 'action_type') || 'Action',
        detail: [str(frame, 'action_type'), str(frame, 'screen_context')].filter(Boolean).join(' · '),
        tone: 'pass',
      };
    case 'crash_report':
      return {
        ...row,
        title: [str(frame, 'exception_type'), str(frame, 'message')].filter(Boolean).join(': '),
        detail: `crash · ${str(frame, 'app_build')}`.trim(),
        tone: 'fail',
      };
    case 'media_chunk': {
      const total = num(frame, 'total_size');
      return {
        ...row,
        title: str(frame, 'content_type') || 'capture',
        detail: `${num(frame, 'offset') ?? 0}${total === null ? '' : `/${total}`} bytes`,
        tone: 'muted',
      };
    }
    default:
      // FR-000d: a type this minor does not know is still shown, never dropped or errored on.
      return { ...row, title: kind || 'unknown record', detail: '', tone: 'muted' };
  }
}

/** Flat search over what the row actually shows. */
export function matches(row: LogRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${row.kind} ${row.title} ${row.detail}`.toLowerCase().includes(needle);
}

export type Entry = { row: LogRow; frame: Frame };

export type LogGroup = {
  key: string;
  label: string;
  at: string;
  rows: Entry[];
  errors: number;
};

/** FR-039b–e: records nest under the User Action they were attributed to on the wire.
 *  `action_id: null` is a meaningful value, not a gap — it means "Unattributed" (FR-039c), and an
 *  action that produced nothing keeps its empty group (FR-039d). `keep` is the same predicate the
 *  flat view uses, applied *inside* groups; while it is narrowing (`filtering`), a group with no
 *  surviving record drops out unless the action's own label matches (FR-039e). */
export function groupRows(
  entries: Entry[],
  keep: (entry: Entry) => boolean,
  filtering: { on: boolean; query: string },
): LogGroup[] {
  const groups = new Map<string, LogGroup>();
  const loose: LogGroup = { key: '', label: 'Unattributed', at: '', rows: [], errors: 0 };

  for (const entry of entries) {
    if (entry.row.kind !== 'user_action') continue;
    // An action with no id cannot be referenced by a record, but it is still an action: it gets an
    // empty group under its own row key rather than disappearing.
    const key = str(entry.frame, 'action_id') || entry.row.key;
    groups.set(key, { key, label: entry.row.title, at: entry.row.at, rows: [], errors: 0 });
  }
  for (const entry of entries) {
    if (entry.row.kind === 'user_action') continue;
    (groups.get(str(entry.frame, 'action_id')) ?? loose).rows.push(entry);
  }

  const needle = filtering.query.trim().toLowerCase();
  const all = loose.rows.length > 0 ? [...groups.values(), loose] : [...groups.values()];
  return all
    .map((group) => {
      const rows = group.rows.filter(keep);
      return { ...group, rows, errors: rows.filter((entry) => entry.row.tone === 'fail').length };
    })
    .filter(
      (group) =>
        !filtering.on || group.rows.length > 0 || (needle !== '' && group.label.toLowerCase().includes(needle)),
    );
}

const KINDS = ['All', 'log_event', 'app_log', 'user_action', 'crash_report'] as const;

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

function chip(active: boolean): React.CSSProperties {
  return {
    height: 26,
    padding: '0 10px',
    border: `1px solid ${active ? t.accentBorder : t.border}`,
    borderRadius: t.rFull,
    background: active ? t.accentLight : t.surface,
    color: active ? t.accent : t.text2,
    fontFamily: t.mono,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

/** One record line. The same line in both views, so grouping cannot make a row read differently. */
function RecordRow({
  row,
  open,
  onOpen,
  indent,
}: {
  row: LogRow;
  open: boolean;
  onOpen: (key: string) => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row.key)}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        display: 'flex',
        gap: 10,
        width: '100%',
        cursor: 'pointer',
        padding: indent ? '8px 12px 8px 24px' : '8px 12px',
        borderBottom: `1px solid ${t.borderSubtle}`,
        borderLeft: `3px solid ${open ? t.accent : 'transparent'}`,
        background: open ? t.accentLight : 'transparent',
      }}
    >
      <span style={{ width: 88, flexShrink: 0, fontSize: 10, fontFamily: t.mono, color: t.text3 }}>{row.kind}</span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          fontFamily: t.mono,
          color: t.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {row.title}
      </span>
      <span style={{ flexShrink: 0, fontSize: 11, fontFamily: t.mono, color: TONE[row.tone] }}>{row.detail}</span>
    </button>
  );
}

export default function LogInspector({ workspaceId }: { workspaceId: string }) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [picked, setPicked] = useState('');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string>('All');
  const [openRow, setOpenRow] = useState('');
  const [grouped, setGrouped] = useState(false);

  // ponytail: one poll drives the whole screen, matching the Devices screen's tick. A Rust-side
  // emit is the upgrade if a busy bench makes the second-long latency visible.
  useEffect(() => {
    const load = () => {
      invoke<DeviceSession[]>('device_sessions', { workspaceId }).then(
        (listed) => setSessions(listed ?? []),
        () => {},
      );
    };
    load();
    const tick = setInterval(load, 1000);
    return () => clearInterval(tick);
  }, [workspaceId]);

  // The device names the WS session, so the key is the pair — never the desktop's Test Session id.
  const key = (session: DeviceSession) => `${session.device_id} ${session.session_id}`;
  const active = sessions.find((session) => key(session) === picked) ?? sessions[0];

  useEffect(() => {
    if (!active) {
      setFrames([]);
      return;
    }
    const load = () => {
      invoke<Frame[]>('session_records', {
        deviceId: active.device_id,
        sessionId: active.session_id,
      }).then((listed) => setFrames(listed ?? []), () => {});
    };
    load();
    const tick = setInterval(load, 1000);
    return () => clearInterval(tick);
  }, [active?.device_id, active?.session_id]);

  // The frame travels with its row, so a filtered list can still open the record it points at.
  const entries = useMemo(() => frames.map((frame, index) => ({ row: logRow(frame, index), frame })), [frames]);
  const keep = ({ row }: Entry) => (kind === 'All' || row.kind === kind) && matches(row, query);
  const rows = useMemo(() => entries.filter(keep), [entries, kind, query]);
  // FR-039e: grouping is a view over the same entries — switching back loses nothing.
  const groups = useMemo(
    () => groupRows(entries, keep, { on: kind !== 'All' || query.trim() !== '', query }),
    [entries, kind, query],
  );
  const open = entries.find(({ row }) => row.key === openRow)?.frame ?? null;

  // Grouped by device so a mid-run device switch is explicit, as the mockup's session rail is.
  const devices = [...new Map(sessions.map((s) => [s.device_id, s])).values()];

  if (sessions.length === 0) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, fontFamily: t.font }}>
        <div role="status" style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: t.text }}>No device connected</div>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: t.text2, lineHeight: 1.6 }}>
            Pair a device on the Devices screen. Its API traffic, app logs and user actions stream in
            here as they happen — the same view for iOS and Android.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', fontFamily: t.font }}>
      <div
        style={{
          height: 44,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          background: t.bg,
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <input
          aria-label="Filter records"
          placeholder="Filter by URL, method, level, label…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{
            width: 280,
            height: 28,
            padding: '0 9px',
            border: `1px solid ${t.border}`,
            borderRadius: t.rSm,
            background: t.surface,
            fontFamily: t.font,
            fontSize: 12,
            color: t.text,
          }}
        />
        {KINDS.map((option) => (
          <button key={option} type="button" onClick={() => setKind(option)} style={chip(option === kind)}>
            {option}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={grouped}
          onClick={() => setGrouped(!grouped)}
          style={{ ...chip(grouped), marginLeft: 4 }}
        >
          {grouped ? 'Grouped' : 'Flat'}
        </button>
        {/* FR-035b: clearing the general logs never touches a bug's evidence — the Rust side keeps
            every frame inside a marked window, so this is safe to offer without a warning. */}
        <button
          type="button"
          onClick={() =>
            active &&
            invoke('clear_device_logs', { deviceId: active.device_id }).then(
              () => setFrames([]),
              () => {},
            )
          }
          style={{ ...chip(false), marginLeft: 4 }}
        >
          Clear logs
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: t.text3 }}>
          {rows.length} of {frames.length} records · {devices.length} device
          {devices.length === 1 ? '' : 's'}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          style={{
            width: 220,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: `1px solid ${t.border}`,
            background: t.surface,
          }}
        >
          <div style={listHeader}>Sessions · by device</div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {devices.map((device) => (
              <div key={device.device_id}>
                <div
                  style={{
                    padding: '9px 12px 7px',
                    background: t.surface2,
                    borderBottom: `1px solid ${t.border}`,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{device.display_name}</div>
                  <div style={{ fontSize: 10, color: t.text3, fontFamily: t.mono }}>
                    {device.platform ?? 'unknown platform'} {device.os_version}
                  </div>
                </div>
                {sessions
                  .filter((session) => session.device_id === device.device_id)
                  .map((session) => {
                    const on = active && key(session) === key(active);
                    return (
                      <button
                        key={key(session)}
                        type="button"
                        aria-current={on ? 'true' : undefined}
                        onClick={() => {
                          setPicked(key(session));
                          setOpenRow('');
                        }}
                        style={{
                          all: 'unset',
                          boxSizing: 'border-box',
                          display: 'block',
                          width: '100%',
                          cursor: 'pointer',
                          padding: '8px 12px',
                          borderBottom: `1px solid ${t.borderSubtle}`,
                          borderLeft: `3px solid ${on ? t.accent : 'transparent'}`,
                          background: on ? t.accentLight : 'transparent',
                        }}
                      >
                        <div style={{ fontSize: 12, color: t.text, fontFamily: t.mono }}>
                          {sessionLabel(session)}
                        </div>
                        <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>
                          {session.record_count} rec · {sessionState(session)}
                        </div>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: `1px solid ${t.border}`,
          }}
        >
          <div style={listHeader}>{grouped ? 'Records · by user action' : 'Records · chronological'}</div>
          <ul aria-label="Records" style={{ flex: 1, margin: 0, padding: 0, listStyle: 'none', overflowY: 'auto' }}>
            {(grouped ? groups.length : rows.length) === 0 ? (
              <li style={{ padding: 14, fontSize: 13, color: t.text2 }}>
                {frames.length === 0 ? 'This session has not streamed a record yet.' : 'No record matches the filter.'}
              </li>
            ) : grouped ? (
              groups.map((group) => (
                <li key={group.key}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      padding: '8px 12px',
                      background: t.surface2,
                      borderBottom: `1px solid ${t.border}`,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{group.label}</span>
                    <span style={{ fontSize: 10, fontFamily: t.mono, color: t.text3 }}>{group.at.slice(11, 19)}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: t.mono, color: t.text3 }}>
                      {group.rows.length} rec ·{' '}
                      <span style={{ color: group.errors ? t.fail : t.pass }}>
                        {group.errors ? `${group.errors} error${group.errors === 1 ? '' : 's'}` : 'no errors'}
                      </span>
                    </span>
                  </div>
                  {group.rows.length === 0 ? (
                    // FR-039d: an action that produced nothing is still part of the story.
                    <div style={{ padding: '8px 12px 8px 24px', fontSize: 11, color: t.text3 }}>No records</div>
                  ) : (
                    group.rows.map(({ row }) => (
                      <RecordRow key={row.key} row={row} open={row.key === openRow} onOpen={setOpenRow} indent />
                    ))
                  )}
                </li>
              ))
            ) : (
              rows.map(({ row }) => (
                <li key={row.key}>
                  <RecordRow row={row} open={row.key === openRow} onOpen={setOpenRow} />
                </li>
              ))
            )}
          </ul>
        </div>

        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', background: t.surface }}>
          <div style={listHeader}>Record · raw frame</div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {open ? (
              // ponytail: the frame as it arrived. A foldable JSON tree is the mockup's polish, not
              // FR-029a — add it when a real payload proves this unreadable.
              <pre
                aria-label="Raw frame"
                style={{ margin: 0, fontFamily: t.mono, fontSize: 11.5, lineHeight: 1.6, color: t.text, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {JSON.stringify(open, null, 2)}
              </pre>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: t.text2 }}>Select a record to see the frame it came from.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
