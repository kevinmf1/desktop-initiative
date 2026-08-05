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

// The registry from `device.rs`. `observed_platform` is null until the device reports it (FR-022).
export type Device = {
  id: string;
  device_id: string;
  display_name: string;
  observed_platform: 'iOS' | 'Android' | null;
  enabled: boolean;
  sdk_contract_version: string;
  os_version: string;
  registered_at: string;
};

export type Registry = { policy: 'Open' | 'Allowlist'; devices: Device[] };

/** FR-017/FR-018: what the row's state actually means for incoming records, said in the list so the
 *  operator does not have to hold the policy in their head. */
export function admission(device: Device, policy: Registry['policy']): string {
  if (!device.enabled) return 'Disabled — records rejected';
  return policy === 'Allowlist' ? 'Allowed — on the allowlist' : 'Allowed — policy is open';
}

const cell: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', verticalAlign: 'top' };

function rowButton(danger = false): React.CSSProperties {
  return {
    height: 28,
    padding: '0 10px',
    border: `1px solid ${t.border}`,
    borderRadius: t.rSm,
    background: t.surface,
    color: danger ? '#B42318' : t.text,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function Registered({
  registry,
  error,
  act,
}: {
  registry: Registry | null;
  error: string;
  act: (command: string, args: Record<string, unknown>) => void;
}) {
  return (
    <section
      aria-labelledby="registry-title"
      style={{
        width: 'min(100%, 720px)',
        padding: 24,
        boxSizing: 'border-box',
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: t.r,
        color: t.text,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <h2 id="registry-title" style={{ margin: 0, fontSize: 16, flex: 1 }}>
          Registered devices
        </h2>
        <label style={{ fontSize: 12, color: t.text2, display: 'flex', alignItems: 'center', gap: 8 }}>
          Access policy
          <select
            aria-label="Access policy"
            value={registry?.policy ?? 'Allowlist'}
            onChange={(event) => act('set_device_policy', { policy: event.target.value })}
            style={{
              height: 30,
              padding: '0 8px',
              border: `1px solid ${t.border}`,
              borderRadius: t.rSm,
              background: t.surface,
              color: t.text,
              fontFamily: t.font,
              fontSize: 12,
            }}
          >
            <option value="Allowlist">Allowlist</option>
            <option value="Open">Open</option>
          </select>
        </label>
      </div>
      <p style={{ margin: '8px 0 16px', color: t.text2, fontSize: 13, lineHeight: 1.5 }}>
        {/* FR-020: say plainly that this list is a filter, so nobody treats it as the security control. */}
        {registry?.policy === 'Open'
          ? 'Any paired device may send records. Disabled devices are still rejected.'
          : 'Only registered, enabled devices may send records.'}{' '}
        The list filters — pairing is what establishes trust.
      </p>

      {error && (
        <p role="alert" style={{ margin: '0 0 12px', color: '#B42318', fontSize: 13 }}>
          {error}
        </p>
      )}

      {registry && registry.devices.length === 0 ? (
        <div role="status" style={{ color: t.text2, fontSize: 13, padding: '12px 0' }}>
          No devices registered yet. Pair one above — it registers itself on first pairing.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: t.text2, fontSize: 11, textTransform: 'uppercase' }}>
              <th style={cell}>Name</th>
              <th style={cell}>Platform</th>
              <th style={cell}>Status</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {(registry?.devices ?? []).map((device) => (
              <tr key={device.id} style={{ borderTop: `1px solid ${t.border}` }}>
                <td style={cell}>
                  {/* FR-015: the display name is the user's; the stable device ID underneath is not. */}
                  <input
                    // Keyed on the stored name so a refused rename snaps back to what is stored,
                    // instead of leaving a name on screen that was never saved.
                    key={device.display_name}
                    aria-label={`Display name for ${device.device_id}`}
                    defaultValue={device.display_name}
                    onBlur={(event) =>
                      event.target.value !== device.display_name &&
                      act('rename_device', { id: device.id, displayName: event.target.value })
                    }
                    style={{
                      width: '100%',
                      height: 28,
                      padding: '0 8px',
                      border: `1px solid ${t.border}`,
                      borderRadius: t.rSm,
                      background: t.bg,
                      color: t.text,
                      fontFamily: t.font,
                      fontSize: 13,
                    }}
                  />
                  <div style={{ marginTop: 4, color: t.text3, fontFamily: t.mono, fontSize: 11 }}>
                    {device.device_id}
                  </div>
                </td>
                <td style={{ ...cell, color: device.observed_platform ? t.text : t.text3 }}>
                  {/* FR-022: "once available" — an unknown platform says so rather than guessing. */}
                  {device.observed_platform ?? 'Not reported yet'}
                  {device.os_version && (
                    <div style={{ color: t.text3, fontSize: 11, marginTop: 2 }}>{device.os_version}</div>
                  )}
                </td>
                <td style={{ ...cell, color: device.enabled ? t.text2 : '#B42318' }}>
                  {admission(device, registry?.policy ?? 'Allowlist')}
                </td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {/* FR-018: disable keeps the registration; remove is the one that forces a re-pair. */}
                  <button
                    type="button"
                    onClick={() =>
                      act('set_device_enabled', { id: device.id, enabled: !device.enabled })
                    }
                    style={rowButton()}
                  >
                    {device.enabled ? 'Disable' : 'Enable'}
                  </button>{' '}
                  <button
                    type="button"
                    onClick={() => act('remove_device', { id: device.id })}
                    style={rowButton(true)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function Devices({ workspaceId }: { workspaceId: string }) {
  const [invite, setInvite] = useState<PairingInvite | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [registryError, setRegistryError] = useState('');

  async function loadRegistry() {
    try {
      setRegistry(await invoke<Registry>('list_devices', { workspaceId }));
      setRegistryError('');
    } catch (reason) {
      setRegistryError(String(reason));
    }
  }

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
    void loadRegistry();
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const remaining = invite ? secondsLeft(invite.expires_at, now) : 0;
  const live = invite !== null && remaining > 0;

  return (
    <div
      style={{
        display: 'grid',
        justifyItems: 'center',
        alignContent: 'start',
        gap: 24,
        padding: 24,
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'auto',
      }}
    >
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
          <div role="status" aria-label="Pairing status" style={{ color: t.text2, fontSize: 13, minHeight: 220, display: 'grid', placeItems: 'center' }}>
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

      <Registered
        registry={registry}
        error={registryError}
        act={(command, args) => {
          invoke(command, { workspaceId, ...args }).then(loadRegistry, (reason) =>
            // Reload anyway: the refused change must not stay on screen as if it took.
            loadRegistry().finally(() => setRegistryError(String(reason))),
          );
        }}
      />
    </div>
  );
}
