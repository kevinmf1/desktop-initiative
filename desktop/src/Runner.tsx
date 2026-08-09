import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import type { Device, Registry } from './Devices';
import type { TestCase } from './TestCases';
import type { TestPlan } from './TestPlans';
import { t } from './tokens';

export type SessionResult = 'Passed' | 'Failed' | 'Blocked' | 'Incomplete';

// One run, from `test_session.rs`. `result` stays null until the session is stopped (FR-014).
export type TestSession = {
  id: string;
  workspace_id: string;
  test_plan_id: string | null;
  device_id: string;
  name: string;
  started_by: string;
  started_at: string;
  stopped_at: string | null;
  build_version: string;
  platform: 'iOS' | 'Android';
  server: string;
  result: SessionResult | null;
  case_ids: string[];
};

// FR-013's marker, from `bug.rs`. The window is a bookmark — it names a time range over the
// session's records rather than copying them.
export type Bug = {
  id: string;
  workspace_id: string;
  test_session_id: string;
  device_id: string;
  summary: string;
  marked_by: string;
  marked_at: string;
  window_start: string;
  window_end: string;
};

export const RESULTS: SessionResult[] = ['Passed', 'Failed', 'Blocked', 'Incomplete'];

const clock = (iso: string) => new Date(iso).toLocaleTimeString();

export const isRunning = (session: TestSession) => session.stopped_at === null;

const RESULT_COLOR: Record<SessionResult, string> = {
  Passed: t.pass,
  Failed: t.fail,
  Blocked: t.blocked,
  Incomplete: t.skip,
};

type Draft = {
  test_plan_id: string | null;
  test_case_ids: string[];
  name: string;
  build_version: string;
  server: string;
  platform: 'iOS' | 'Android';
  device_id: string;
};

const BLANK: Draft = {
  test_plan_id: null,
  test_case_ids: [],
  name: '',
  build_version: '',
  server: '',
  platform: 'iOS',
  device_id: '',
};

/** FR-012: a run is scoped by a plan **or** by ad hoc cases. Picking a plan is what makes the ad hoc
 *  checkboxes irrelevant, so the two never disagree about what is about to run. */
export function draftScope(draft: Draft, plans: TestPlan[]): string[] {
  const plan = plans.find((p) => p.id === draft.test_plan_id);
  return plan ? plan.items.map((item) => item.test_case_id) : draft.test_case_ids;
}

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
const label = { display: 'block', fontSize: 12, color: t.text2, marginBottom: 10 };
const button = (primary = false) => ({
  height: 32,
  padding: '0 12px',
  border: primary ? 0 : `1px solid ${t.border}`,
  borderRadius: t.rSm,
  background: primary ? t.accent : t.surface,
  color: primary ? '#fff' : t.text,
  fontFamily: t.font,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
});

function StartForm({
  draft,
  plans,
  cases,
  devices,
  disabled,
  onChange,
  onStart,
}: {
  draft: Draft;
  plans: TestPlan[];
  cases: TestCase[];
  devices: Device[];
  disabled: boolean;
  onChange: (draft: Draft) => void;
  onStart: () => void;
}) {
  const scoped = draftScope(draft, plans);
  return (
    <form
      aria-label="Start a test session"
      onSubmit={(event) => {
        event.preventDefault();
        onStart();
      }}
      style={{ padding: 16, background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r }}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ ...label, flex: 1 }}>
          Test Plan
          <select
            style={field}
            value={draft.test_plan_id ?? ''}
            onChange={(e) => onChange({ ...draft, test_plan_id: e.target.value || null })}
          >
            <option value="">Ad hoc — pick cases below</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.items.length})
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...label, flex: 1 }}>
          Session name
          <input
            style={field}
            placeholder={plans.find((p) => p.id === draft.test_plan_id)?.name ?? 'Ad hoc session'}
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ ...label, flex: 1 }}>
          Build version
          <input style={field} value={draft.build_version} onChange={(e) => onChange({ ...draft, build_version: e.target.value })} />
        </label>
        <label style={{ ...label, flex: 1 }}>
          Server
          <input style={field} value={draft.server} onChange={(e) => onChange({ ...draft, server: e.target.value })} />
        </label>
        <label style={{ ...label, flex: 1 }}>
          Platform
          <select style={field} value={draft.platform} onChange={(e) => onChange({ ...draft, platform: e.target.value as Draft['platform'] })}>
            <option>iOS</option>
            <option>Android</option>
          </select>
        </label>
        <label style={{ ...label, flex: 1 }}>
          Target device
          <select style={field} value={draft.device_id} onChange={(e) => onChange({ ...draft, device_id: e.target.value })}>
            <option value="">Select a device…</option>
            {devices.map((device) => (
              <option key={device.id} value={device.device_id} disabled={!device.enabled}>
                {device.display_name}
                {device.enabled ? '' : ' — disabled'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {draft.test_plan_id === null && (
        <fieldset style={{ border: `1px solid ${t.border}`, borderRadius: t.rSm, margin: '0 0 12px', padding: 10, maxHeight: 180, overflowY: 'auto' }}>
          <legend style={{ fontSize: 12, color: t.text2 }}>Ad hoc Test Cases</legend>
          {cases.length === 0 ? (
            <span style={{ fontSize: 12, color: t.text3 }}>No Test Cases are available.</span>
          ) : (
            cases.map((testCase) => (
              <label key={testCase.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 13, color: t.text }}>
                <input
                  type="checkbox"
                  checked={draft.test_case_ids.includes(testCase.id)}
                  onChange={() =>
                    onChange({
                      ...draft,
                      test_case_ids: draft.test_case_ids.includes(testCase.id)
                        ? draft.test_case_ids.filter((id) => id !== testCase.id)
                        : [...draft.test_case_ids, testCase.id],
                    })
                  }
                />
                {testCase.title}
              </label>
            ))
          )}
        </fieldset>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" disabled={disabled} style={{ ...button(true), opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          Start Session
        </button>
        <span style={{ fontSize: 12, color: t.text2 }}>
          {scoped.length} case{scoped.length === 1 ? '' : 's'} in scope
        </span>
      </div>
    </form>
  );
}

/** FR-014: stopping *is* the result prompt — the session is never stopped first and judged after,
 *  which is how a run ends up with no recorded outcome. */
function StopPrompt({ onStop, onCancel }: { onStop: (result: SessionResult) => void; onCancel: () => void }) {
  return (
    <div role="group" aria-label="Session result" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: t.text2 }}>Result:</span>
      {RESULTS.map((result) => (
        <button
          key={result}
          type="button"
          onClick={() => onStop(result)}
          style={{ ...button(), color: RESULT_COLOR[result], borderColor: RESULT_COLOR[result] }}
        >
          {result}
        </button>
      ))}
      <button type="button" onClick={onCancel} style={{ ...button(), color: t.text2 }}>
        Cancel
      </button>
    </div>
  );
}

/** FR-013: marking is a one-field act *during* the run — no dialog, no stop, no result. The summary
 *  is optional because the moment is the point; feat-020 is what fills the rest of the record in. */
function BugMarker({ onMark }: { onMark: (summary: string) => Promise<void> | void }) {
  const [summary, setSummary] = useState('');
  return (
    <form
      aria-label="Mark a bug"
      onSubmit={async (event) => {
        event.preventDefault();
        await onMark(summary);
        setSummary('');
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}
    >
      <input
        aria-label="Bug summary"
        placeholder="What went wrong? (optional)"
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        style={{ ...field, flex: 1, marginTop: 0 }}
      />
      <button type="submit" style={{ ...button(), color: t.warn, borderColor: t.warnBorder, flexShrink: 0 }}>
        Bug Occurred
      </button>
    </form>
  );
}

function SessionCard({
  session,
  deviceName,
  bugs,
  stopping,
  onMark,
  onStopRequested,
  onStop,
  onCancelStop,
}: {
  session: TestSession;
  deviceName: string;
  bugs: Bug[];
  stopping: boolean;
  onMark: (summary: string) => Promise<void> | void;
  onStopRequested: () => void;
  onStop: (result: SessionResult) => void;
  onCancelStop: () => void;
}) {
  const running = isRunning(session);
  return (
    <article
      aria-label={`Session ${session.name}`}
      style={{
        padding: '14px 16px',
        marginBottom: 10,
        background: t.surface,
        border: `1px solid ${running ? t.accentBorder : t.border}`,
        borderLeft: `3px solid ${running ? t.accent : (session.result ? RESULT_COLOR[session.result] : t.border)}`,
        borderRadius: t.r,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{session.name}</div>
          {/* FR-012: the unique session id is shown, not hidden — it is how a run is matched to the
              device's records and to anything reported about it later. */}
          <div style={{ fontSize: 11, fontFamily: t.mono, color: t.text3, marginTop: 3 }}>{session.id}</div>
        </div>
        {running ? (
          stopping ? (
            <StopPrompt onStop={onStop} onCancel={onCancelStop} />
          ) : (
            <button type="button" onClick={onStopRequested} style={{ ...button(), color: t.fail, borderColor: t.failBorder }}>
              Stop
            </button>
          )
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: session.result ? RESULT_COLOR[session.result] : t.text2 }}>
            {session.result ?? '—'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: t.text2 }}>
        <span>{deviceName} · {session.platform}</span>
        <span>Build {session.build_version}</span>
        <span>{session.server}</span>
        <span>{session.case_ids.length} cases</span>
        <span>Started {new Date(session.started_at).toLocaleString()} by {session.started_by}</span>
        {session.stopped_at && <span>Stopped {new Date(session.stopped_at).toLocaleString()}</span>}
        {bugs.length > 0 && (
          <span style={{ color: t.warn, fontWeight: 700 }}>
            {bugs.length} bug{bugs.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {bugs.length > 0 && (
        <ul aria-label={`Bug markers for ${session.name}`} style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
          {bugs.map((bug) => (
            <li
              key={bug.id}
              style={{
                display: 'flex',
                gap: 10,
                padding: '6px 8px',
                marginTop: 4,
                background: t.warnLight,
                border: `1px solid ${t.warnBorder}`,
                borderRadius: t.rSm,
                fontSize: 12,
                color: t.text,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{bug.summary}</span>
              {/* The bookmark, not a copy: the window is what feat-020 reads records out of. */}
              <span style={{ fontFamily: t.mono, fontSize: 11, color: t.text2 }}>
                {clock(bug.marked_at)} · window {clock(bug.window_start)}–{clock(bug.window_end)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {running && <BugMarker onMark={onMark} />}
    </article>
  );
}

export default function Runner({
  workspaceId,
  sessions,
  onSessionsChanged,
  canStartNewSession,
  offlineGraceUntil,
}: {
  workspaceId: string;
  sessions: TestSession[];
  onSessionsChanged: () => Promise<void> | void;
  canStartNewSession: boolean;
  offlineGraceUntil: string;
}) {
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [stoppingId, setStoppingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      invoke<TestPlan[]>('list_test_plans', { workspaceId }),
      invoke<TestCase[]>('list_test_cases', { workspaceId }),
      invoke<Registry>('list_devices', { workspaceId }),
      invoke<Bug[]>('list_bugs', { workspaceId }),
    ]).then(
      ([listedPlans, listedCases, registry, listedBugs]) => {
        setPlans((listedPlans ?? []).filter((plan) => plan.lifecycle === 'Active'));
        setCases((listedCases ?? []).filter((testCase) => testCase.lifecycle === 'Active'));
        setDevices(registry?.devices ?? []);
        setBugs(listedBugs ?? []);
      },
      (reason) => setError(String(reason)),
    );
  }, [workspaceId]);

  async function start() {
    try {
      await invoke<TestSession>('start_test_session', { workspaceId, input: draft });
      setDraft(BLANK);
      setError('');
      await onSessionsChanged();
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function stop(session: TestSession, result: SessionResult) {
    try {
      await invoke('stop_test_session', { workspaceId, id: session.id, result });
      setStoppingId('');
      setError('');
      await onSessionsChanged();
    } catch (reason) {
      setError(String(reason));
    }
  }

  /** FR-013: the marker is added and the session list is left alone — nothing here stops a run. */
  async function mark(session: TestSession, summary: string) {
    try {
      const bug = await invoke<Bug>('mark_bug', { workspaceId, testSessionId: session.id, summary });
      setBugs((current) => [...current, bug]);
      setError('');
    } catch (reason) {
      setError(String(reason));
    }
  }

  const nameOf = (deviceId: string) =>
    devices.find((device) => device.device_id === deviceId)?.display_name ?? deviceId;
  const bugsOf = (session: TestSession) => bugs.filter((bug) => bug.test_session_id === session.id);
  const running = sessions.filter(isRunning);
  const finished = sessions.filter((session) => !isRunning(session));

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20, fontFamily: t.font }}>
      {error && (
        <p role="alert" style={{ margin: '0 0 12px', padding: '10px 12px', color: t.fail, background: t.failLight, borderRadius: t.rSm }}>
          {error}
        </p>
      )}
      {/* FR-053a: an expired offline grace blocks *starting* a session and nothing else — running
          sessions below stay visible and stoppable. */}
      {canStartNewSession ? (
        <StartForm
          draft={draft}
          plans={plans}
          cases={cases}
          devices={devices}
          disabled={!draft.device_id}
          onChange={setDraft}
          onStart={start}
        />
      ) : (
        <p role="status" style={{ margin: 0, padding: '14px 16px', background: t.warnLight, border: `1px solid ${t.warnBorder}`, borderRadius: t.r, fontSize: 13, color: t.text }}>
          Sign in again to start a new session — the offline grace period ended on{' '}
          {new Date(offlineGraceUntil).toLocaleDateString()}. Sessions already running are unaffected.
        </p>
      )}

      <h2 style={{ margin: '22px 0 10px', fontSize: 14, color: t.text }}>Running ({running.length})</h2>
      {running.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: t.text2 }}>No session is running.</p>
      ) : (
        running.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            deviceName={nameOf(session.device_id)}
            bugs={bugsOf(session)}
            stopping={stoppingId === session.id}
            onMark={(summary) => mark(session, summary)}
            onStopRequested={() => setStoppingId(session.id)}
            onStop={(result) => stop(session, result)}
            onCancelStop={() => setStoppingId('')}
          />
        ))
      )}

      {finished.length > 0 && (
        <>
          <h2 style={{ margin: '22px 0 10px', fontSize: 14, color: t.text }}>Stopped ({finished.length})</h2>
          {finished.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              deviceName={nameOf(session.device_id)}
              bugs={bugsOf(session)}
              stopping={false}
              onMark={() => {}}
              onStopRequested={() => {}}
              onStop={() => {}}
              onCancelStop={() => {}}
            />
          ))}
        </>
      )}
    </div>
  );
}
