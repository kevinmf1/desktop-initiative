import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { t } from './tokens';

// Minted by `ws::pairing` in Rust. `token` is the whole secret: the QR carries it, the grouped
// digits below are the same value typed by hand (research R4).
export type PairingInvite = {
  token: string;
  ws_url: string;
  contract_version: string;
  expires_at: string;
  qr_size: number;
  qr_modules: boolean[];
};

/** FR-020a: a token is dead 5 minutes after it was minted, so the screen must say so rather than
 *  keep offering a code the device will be nacked for. */
export function secondsLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

export function countdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** 9 digits are unreadable in one run; three groups are what a tester can carry to a phone. */
export function groupCode(token: string): string {
  return token.replace(/(\d{3})(?=\d)/g, '$1 ');
}

function Qr({ invite }: { invite: PairingInvite }) {
  const { qr_size: size, qr_modules: modules } = invite;
  const quiet = 2;
  return (
    <svg
      role="img"
      aria-label="Pairing QR code"
      viewBox={`0 0 ${size + quiet * 2} ${size + quiet * 2}`}
      width={220}
      height={220}
      shapeRendering="crispEdges"
      style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: t.rSm, padding: 4 }}
    >
      {modules.map((dark, index) =>
        dark ? (
          <rect
            key={index}
            x={(index % size) + quiet}
            y={Math.floor(index / size) + quiet}
            width={1}
            height={1}
            fill={t.text}
          />
        ) : null,
      )}
    </svg>
  );
}

export default function Devices() {
  const [invite, setInvite] = useState<PairingInvite | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  async function refresh() {
    try {
      // Every call mints — which is exactly what refreshing means: the previous token dies here,
      // in Rust, not by the webview forgetting it (FR-020a).
      setInvite(await invoke<PairingInvite>('mint_pairing_invite'));
      setNow(Date.now());
      setError('');
    } catch (reason) {
      setInvite(null);
      setError(String(reason));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const remaining = invite ? secondsLeft(invite.expires_at, now) : 0;
  const live = invite !== null && remaining > 0;

  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <section
        aria-labelledby="pairing-title"
        style={{
          width: 'min(100%, 460px)',
          padding: 24,
          boxSizing: 'border-box',
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: t.r,
          textAlign: 'center',
          color: t.text,
        }}
      >
        <h2 id="pairing-title" style={{ margin: 0, fontSize: 16 }}>
          Pair a device
        </h2>
        <p style={{ margin: '8px 0 20px', color: t.text2, fontSize: 13, lineHeight: 1.5 }}>
          Scan this in the TestLab SDK on the phone. No IP address to type.
        </p>

        {live ? (
          <>
            <Qr invite={invite} />
            <div
              aria-label="Pairing code"
              style={{ marginTop: 16, fontFamily: t.mono, fontSize: 26, letterSpacing: 2 }}
            >
              {groupCode(invite.token)}
            </div>
            <div style={{ marginTop: 6, color: t.text2, fontSize: 12 }}>
              Can't scan? Enter this code on the device.
            </div>
            <div role="timer" style={{ marginTop: 14, color: t.warn, fontSize: 12, fontWeight: 600 }}>
              Expires in {countdown(remaining)} · single use
            </div>
            <div style={{ marginTop: 4, color: t.text3, fontFamily: t.mono, fontSize: 11 }}>
              {invite.ws_url} · contract {invite.contract_version}
            </div>
          </>
        ) : (
          <div role="status" style={{ color: t.text2, fontSize: 13, minHeight: 220, display: 'grid', placeItems: 'center' }}>
            {error
              ? error
              : invite
                ? 'This pairing code has expired. Refresh to mint a new one.'
                : 'Minting a pairing code…'}
          </div>
        )}

        <button
          type="button"
          onClick={refresh}
          style={{
            marginTop: 18,
            height: 36,
            padding: '0 18px',
            border: `1px solid ${t.border}`,
            borderRadius: t.rSm,
            background: t.surface,
            color: t.text,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Refresh code
        </button>
      </section>
    </div>
  );
}
