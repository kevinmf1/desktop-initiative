import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import TestCases from './TestCases';
import TestPlans from './TestPlans';
import { t } from './tokens';

// The redacted account from Rust — never carries the session or refresh token (FR-052).
export type Account = {
  user: { id: string; display_name: string; email: string; avatar_url?: string | null };
  memberships: { workspace_id: string; name: string; role?: string | null; status?: string | null }[];
  offline_grace_until: string;
  can_start_new_session: boolean;
};

// Screen list from design/README.md (the desktop-standalone.html gallery's surviving info).
// Each is a placeholder until its own feature lands — see FEATURES.md epic "Desktop app (Tauri)".
export const SCREENS = [
  { id: 'cases', label: 'Test Cases', feature: 'feat-009 / feat-010' },
  { id: 'plans', label: 'Test Plans', feature: 'feat-012' },
  { id: 'runner', label: 'Runner', feature: 'feat-016' },
  { id: 'devices', label: 'Devices', feature: 'feat-014' },
  { id: 'bugs', label: 'Bugs', feature: 'feat-020' },
  { id: 'reports', label: 'Reports', feature: 'feat-022' },
  { id: 'logs', label: 'Log Inspector', feature: 'feat-017 / feat-018' },
] as const;

type ScreenId = (typeof SCREENS)[number]['id'];
type Membership = Account['memberships'][number];

/** FR-056a: only an `active` membership is switchable. `invited`/`removed` are not workspaces the
 *  user is in, and the backend re-checks this on every request anyway (FR-056b). */
export function switchableWorkspaces(account: Account): Membership[] {
  return account.memberships.filter((m) => m.status === 'active');
}

/** FR-056d: a switch is refused while any Test Session runs — reassigning that session's data to a
 *  workspace it wasn't captured in, or orphaning it, both corrupt attribution (research.md R21). */
export function workspaceSwitchRefusal(runningSessions: number): string | null {
  if (runningSessions < 1) return null;
  return `Stop the ${runningSessions} running test session${runningSessions > 1 ? 's' : ''} before switching workspace.`;
}

function NavRail({
  active,
  onSelect,
  account,
  onSignOut,
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
}: {
  active: ScreenId;
  onSelect: (id: ScreenId) => void;
  account: Account;
  onSignOut: () => void;
  workspaces: Membership[];
  activeWorkspaceId: string;
  onSwitchWorkspace: (workspaceId: string) => void;
}) {
  return (
    <nav
      style={{
        width: 200,
        minWidth: 200,
        background: t.rail,
        borderRight: `1px solid ${t.railBorder}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 6px',
        gap: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 16px' }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: t.r,
            background: t.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontFamily: t.mono,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          QA
        </div>
        <select
          aria-label="Workspace"
          value={activeWorkspaceId}
          onChange={(event) => onSwitchWorkspace(event.target.value)}
          style={{
            minWidth: 0,
            flex: 1,
            background: 'transparent',
            border: 0,
            color: '#fff',
            fontFamily: t.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {workspaces.map((w) => (
            <option key={w.workspace_id} value={w.workspace_id} style={{ color: t.text }}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      {SCREENS.map((s) => {
        const isActive = s.id === active;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              height: 38,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              borderRadius: t.rSm,
              borderLeft: `2px solid ${isActive ? t.railActiveBorder : 'transparent'}`,
              background: isActive ? t.railActive : 'transparent',
              color: isActive ? t.railActiveText : t.railText,
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
            }}
          >
            {s.label}
          </button>
        );
      })}
      <div style={{ marginTop: 'auto', padding: '12px 8px 0', borderTop: `1px solid ${t.railBorder}` }}>
        <div style={{ color: t.railActiveText, fontSize: 12, fontWeight: 600 }}>
          {account.user.display_name}
        </div>
        <div
          style={{
            color: t.railText,
            fontSize: 11,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {account.user.email}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          style={{
            all: 'unset',
            marginTop: 8,
            cursor: 'pointer',
            color: t.railText,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

export function WorkspaceShell({
  account,
  onSignOut,
  // ponytail: no Test Session state exists yet — feat-016 passes the real count here, and until it
  // does the FR-056d guard is reachable but never triggers.
  runningSessions = 0,
}: {
  account: Account;
  onSignOut: () => void;
  runningSessions?: number;
}) {
  const [active, setActive] = useState<ScreenId>('cases');
  const workspaces = switchableWorkspaces(account);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(workspaces[0]?.workspace_id ?? '');
  const [refusal, setRefusal] = useState('');
  const screen = SCREENS.find((s) => s.id === active)!;
  const workspace = workspaces.find((w) => w.workspace_id === activeWorkspaceId);

  // FR-056c: switching only changes what is *shown*. Nothing is rewritten, so an existing device,
  // session, bug or capture can never be reattributed to the workspace switched into.
  function switchWorkspace(workspaceId: string) {
    const refused = workspaceSwitchRefusal(runningSessions);
    setRefusal(refused ?? '');
    if (!refused) setActiveWorkspaceId(workspaceId);
  }

  if (!workspace) {
    return (
      <main style={{ height: '100vh', display: 'grid', placeItems: 'center', fontFamily: t.font, background: t.bg, color: t.text2 }}>
        <div role="status" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: t.text }}>No active workspace membership.</div>
          <button type="button" onClick={onSignOut} style={{ all: 'unset', marginTop: 10, cursor: 'pointer', fontSize: 13, color: t.accent }}>
            Sign out
          </button>
        </div>
      </main>
    );
  }
  // FR-053a: expired offline grace gates starting a *new* session and nothing else. Every other
  // screen — all locally captured data — stays reachable, and a running session is never touched.
  const newSessionBlocked = screen.id === 'runner' && !account.can_start_new_session;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: t.font, background: t.bg }}>
      <NavRail
        active={active}
        onSelect={setActive}
        account={account}
        onSignOut={onSignOut}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchWorkspace={switchWorkspace}
      />
      {/* FR-001: keying on the workspace discards every screen's state on a switch, so one
          workspace's data can never survive into the next one's view. */}
      <main key={activeWorkspaceId} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            height: 56,
            flexShrink: 0,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            background: t.surface,
            borderBottom: `1px solid ${t.border}`,
            fontSize: 15,
            fontWeight: 600,
            color: t.text,
          }}
        >
          {screen.label}
        </h1>
        <section
          style={
            (screen.id === 'cases' || screen.id === 'plans') && !newSessionBlocked
              ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
              : { flex: 1, display: 'grid', placeItems: 'center', color: t.text2 }
          }
        >
          {newSessionBlocked ? (
            <div role="status" style={{ textAlign: 'center', maxWidth: 420 }}>
              <div style={{ fontSize: 14, color: t.text }}>
                Sign in again to start a new session.
              </div>
              <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                The offline grace period ended on{' '}
                {new Date(account.offline_grace_until).toLocaleDateString()}. Running sessions and
                everything already captured on this machine are unaffected.
              </div>
            </div>
          ) : screen.id === 'cases' ? (
            <TestCases workspaceId={workspace.workspace_id} />
          ) : screen.id === 'plans' ? (
            <TestPlans workspaceId={workspace.workspace_id} />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14 }}>
                {screen.label} in {workspace.name} is not built yet.
              </div>
              <div style={{ fontSize: 12, color: t.text3, fontFamily: t.mono, marginTop: 6 }}>
                {screen.feature}
              </div>
            </div>
          )}
        </section>
        {refusal && (
          <p role="alert" style={{ margin: 0, padding: '10px 24px', background: t.surface, borderTop: `1px solid ${t.border}`, color: '#B42318', fontSize: 13 }}>
            {refusal}
          </p>
        )}
      </main>
    </div>
  );
}

type State =
  | { phase: 'restoring' }
  | { phase: 'signed-out'; error: string }
  | { phase: 'signing-in' }
  | { phase: 'signed-in'; account: Account; error: string };

export default function App() {
  const [state, setState] = useState<State>({ phase: 'restoring' });

  // FR-052a / FR-053 / SC-022: launch reads the OS keychain and makes no network call, so a fully
  // offline desktop with a cached session goes straight into the workspace.
  useEffect(() => {
    invoke<Account | null>('cached_account').then(
      (cached) =>
        setState(cached ? { phase: 'signed-in', account: cached, error: '' } : { phase: 'signed-out', error: '' }),
      (reason) => setState({ phase: 'signed-out', error: String(reason) }),
    );
  }, []);

  async function signIn() {
    setState({ phase: 'signing-in' });
    try {
      const account = await invoke<Account>('sign_in_with_google');
      setState({ phase: 'signed-in', account, error: '' });
    } catch (reason) {
      setState({ phase: 'signed-out', error: String(reason) });
    }
  }

  async function signOut() {
    try {
      await invoke('sign_out');
      setState({ phase: 'signed-out', error: '' });
    } catch (reason) {
      // The credential was not cleared, so stay signed in rather than claim a sign-out that
      // the next launch would silently undo (FR-054).
      setState((current) =>
        current.phase === 'signed-in' ? { ...current, error: String(reason) } : current,
      );
    }
  }

  if (state.phase === 'restoring') return null;

  if (state.phase === 'signed-in') {
    return (
      <>
        <WorkspaceShell account={state.account} onSignOut={signOut} />
        {state.error && (
          <p role="alert" style={{ margin: 0, padding: '8px 24px', color: '#B42318', fontSize: 13 }}>
            {state.error}
          </p>
        )}
      </>
    );
  }

  const error = state.phase === 'signed-out' ? state.error : '';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        boxSizing: 'border-box',
        fontFamily: t.font,
        background: t.bg,
        color: t.text,
      }}
    >
      <section
        aria-labelledby="sign-in-title"
        style={{
          width: 'min(100%, 380px)',
          padding: 32,
          boxSizing: 'border-box',
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: t.r,
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            margin: '0 auto 20px',
            borderRadius: t.r,
            display: 'grid',
            placeItems: 'center',
            background: t.accent,
            color: '#fff',
            fontFamily: t.mono,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          QA
        </div>
        <h1 id="sign-in-title" style={{ margin: 0, fontSize: 22 }}>
          Sign in to TestLab
        </h1>
        <p style={{ margin: '10px 0 24px', color: t.text2, fontSize: 14, lineHeight: 1.5 }}>
          Continue with your Google account. Sign-in opens securely in your system browser.
        </p>
        <button
          type="button"
          onClick={signIn}
          disabled={state.phase === 'signing-in'}
          style={{
            width: '100%',
            height: 42,
            border: 0,
            borderRadius: t.rSm,
            background: t.accent,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: state.phase === 'signing-in' ? 'wait' : 'pointer',
            opacity: state.phase === 'signing-in' ? 0.7 : 1,
          }}
        >
          {state.phase === 'signing-in' ? 'Waiting for browser…' : 'Sign in with Google'}
        </button>
        {error && (
          <p role="alert" style={{ margin: '16px 0 0', color: '#B42318', fontSize: 13 }}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
