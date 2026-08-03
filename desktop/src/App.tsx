import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { t } from './tokens';

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

function NavRail({ active, onSelect }: { active: ScreenId; onSelect: (id: ScreenId) => void }) {
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
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>TestLab</span>
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
    </nav>
  );
}

function WorkspaceShell() {
  const [active, setActive] = useState<ScreenId>('cases');
  const screen = SCREENS.find((s) => s.id === active)!;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: t.font, background: t.bg }}>
      <NavRail active={active} onSelect={setActive} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
        <section style={{ flex: 1, display: 'grid', placeItems: 'center', color: t.text2 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{screen.label} is not built yet.</div>
            <div style={{ fontSize: 12, color: t.text3, fontFamily: t.mono, marginTop: 6 }}>
              {screen.feature}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<'signed-out' | 'signing-in' | 'signed-in'>('signed-out');
  const [error, setError] = useState('');

  if (status === 'signed-in') return <WorkspaceShell />;

  async function signIn() {
    setStatus('signing-in');
    setError('');
    try {
      await invoke('sign_in_with_google');
      setStatus('signed-in');
    } catch (reason) {
      setError(String(reason));
      setStatus('signed-out');
    }
  }

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
          disabled={status === 'signing-in'}
          style={{
            width: '100%',
            height: 42,
            border: 0,
            borderRadius: t.rSm,
            background: t.accent,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: status === 'signing-in' ? 'wait' : 'pointer',
            opacity: status === 'signing-in' ? 0.7 : 1,
          }}
        >
          {status === 'signing-in' ? 'Waiting for browser…' : 'Sign in with Google'}
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
