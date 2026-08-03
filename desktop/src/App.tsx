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

// ponytail: a 200px text rail, not the 60px icon rail in qa-ui.jsx — qa-icons.jsx is 222 lines
// of SVG for screens that do not exist yet. Port the icon rail when the screens do.
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

export default function App() {
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
