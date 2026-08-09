import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import Devices, {
  admission,
  countdown,
  groupCode,
  secondsLeft,
  sessionLabel,
  sessionState,
  type Device,
  type DeviceSession,
  type PairingInvite,
  type Registry,
} from '../Devices';

afterEach(clearMocks);

function invite(token: string, minutesLeft = 5): PairingInvite {
  return {
    token,
    ws_url: 'ws://10.0.0.4:8787',
    contract_version: '1.0.0',
    expires_at: new Date(Date.now() + minutesLeft * 60_000).toISOString(),
    qr_size: 2,
    qr_modules: [true, false, false, true],
  };
}

function device(over: Partial<Device> = {}): Device {
  return {
    id: 'dev-1',
    device_id: 'sdk-abc',
    display_name: 'Pixel 8',
    observed_platform: 'Android',
    enabled: true,
    sdk_contract_version: '1.0.0',
    os_version: '15',
    registered_at: '2026-08-06T10:00:00Z',
    ...over,
  };
}

/** The Rust side is two stores behind one screen, so the mock dispatches on the command name and
 *  the registry is stateful — a disable has to actually be visible on the next list. */
function session(over: Partial<DeviceSession> = {}): DeviceSession {
  return {
    device_id: 'sdk-abc',
    session_id: 'sess-1',
    display_name: 'Pixel 8',
    platform: 'Android',
    os_version: '15',
    contract_version: '1.0.0',
    connected: true,
    record_count: 3,
    started_at: '2026-08-10T10:00:00Z',
    last_seen_at: '2026-08-10T10:00:05Z',
    ...over,
  };
}

function ipc(
  mint: () => unknown,
  registry: Registry = { policy: 'Allowlist', devices: [] },
  sessions: DeviceSession[] = [],
) {
  const state = structuredClone(registry);
  const command = vi.fn((cmd: string, args: Record<string, never>) => {
    const target = state.devices.find((d) => d.id === (args as { id?: string }).id);
    switch (cmd) {
      case 'mint_pairing_invite':
        return mint();
      case 'list_devices':
        return state;
      case 'device_sessions':
        return sessions;
      case 'set_device_policy':
        state.policy = args.policy;
        return null;
      case 'set_device_enabled':
        target!.enabled = args.enabled;
        return null;
      case 'rename_device':
        if (!String(args.displayName).trim()) throw 'A device needs a display name.';
        target!.display_name = args.displayName;
        return null;
      case 'remove_device':
        state.devices = state.devices.filter((d) => d.id !== args.id);
        return null;
      default:
        throw `unexpected command ${cmd}`;
    }
  });
  mockIPC(command as unknown as Parameters<typeof mockIPC>[0]);
  return command;
}

const minted = (command: ReturnType<typeof ipc>) =>
  command.mock.calls.filter(([cmd]) => cmd === 'mint_pairing_invite').length;

// FR-016 — QR plus a typable code is the default flow; no IP entry anywhere on the screen.
test('shows a QR, the pairing code and its expiry without asking for an address', async () => {
  const command = ipc(() => invite('123456789'));
  render(<Devices workspaceId="ws-1" />);

  expect(await screen.findByRole('img', { name: 'Pairing QR code' })).toBeTruthy();
  expect(screen.getByLabelText('Pairing code').textContent).toBe('123 456 789');
  expect(screen.getByRole('timer').textContent).toContain('single use');
  expect(screen.getByText(/ws:\/\/10\.0\.0\.4:8787/)).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(minted(command)).toBe(1);
});

// FR-020a — refreshing mints a new token; the previous code is gone from the screen too.
test('refreshing replaces the code', async () => {
  const user = userEvent.setup();
  const tokens = ['111222333', '444555666'];
  const command = ipc(() => invite(tokens.shift()!));
  render(<Devices workspaceId="ws-1" />);

  await screen.findByText('111 222 333');
  await user.click(screen.getByRole('button', { name: 'Refresh code' }));

  expect(await screen.findByText('444 555 666')).toBeTruthy();
  expect(screen.queryByText('111 222 333')).toBeNull();
  expect(minted(command)).toBe(2);
});

// FR-020a — an elapsed TTL stops offering the code rather than showing one that will be nacked.
test('an expired token is shown as expired, with no code and no QR', async () => {
  ipc(() => invite('999888777', -1));
  render(<Devices workspaceId="ws-1" />);

  expect((await screen.findByRole('status', { name: 'Pairing status' })).textContent).toMatch(/expired/i);
  expect(screen.queryByLabelText('Pairing code')).toBeNull();
  expect(screen.queryByRole('img', { name: 'Pairing QR code' })).toBeNull();
});

test('a mint failure is surfaced instead of a blank panel', async () => {
  ipc(() => {
    throw 'Could not encode the QR';
  });
  render(<Devices workspaceId="ws-1" />);

  expect((await screen.findByRole('status', { name: 'Pairing status' })).textContent).toContain('Could not encode the QR');
});

// FR-015 / FR-022 — name, stable ID and observed platform, with "not reported yet" as a real state.
test('lists a registered device by name, stable ID and observed platform', async () => {
  ipc(() => invite('123456789'), {
    policy: 'Allowlist',
    devices: [device(), device({ id: 'dev-2', device_id: 'sdk-xyz', display_name: 'Spare', observed_platform: null, os_version: '' })],
  });
  render(<Devices workspaceId="ws-1" />);

  const name = (await screen.findByLabelText('Display name for sdk-abc')) as HTMLInputElement;
  expect(name.value).toBe('Pixel 8');
  expect(screen.getByText('sdk-abc')).toBeTruthy();
  expect(screen.getByText('Android')).toBeTruthy();
  expect(screen.getByText('Not reported yet')).toBeTruthy();
});

// FR-018 — disable keeps the row and flips what it means for records; enable puts it back.
test('disabling keeps the registration and says records are rejected', async () => {
  const user = userEvent.setup();
  ipc(() => invite('123456789'), { policy: 'Allowlist', devices: [device()] });
  render(<Devices workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'Disable' }));

  expect(await screen.findByText('Disabled — records rejected')).toBeTruthy();
  expect(screen.getByLabelText('Display name for sdk-abc')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Enable' }));
  expect(await screen.findByText('Allowed — on the allowlist')).toBeTruthy();
});

// FR-018 — removal is the destructive one: the row is gone and the device has to pair again.
test('removing a device drops the registration', async () => {
  const user = userEvent.setup();
  ipc(() => invite('123456789'), { policy: 'Allowlist', devices: [device()] });
  render(<Devices workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'Remove' }));

  expect(await screen.findByText(/No devices registered yet/)).toBeTruthy();
});

// FR-015 — renaming, and a refused rename snapping back rather than showing an unsaved name.
test('renames a device and refuses an empty name', async () => {
  const user = userEvent.setup();
  ipc(() => invite('123456789'), { policy: 'Allowlist', devices: [device()] });
  render(<Devices workspaceId="ws-1" />);

  const name = await screen.findByLabelText('Display name for sdk-abc');
  await user.clear(name);
  await user.type(name, 'Bench Pixel');
  await user.tab();
  expect(((await screen.findByLabelText('Display name for sdk-abc')) as HTMLInputElement).value).toBe(
    'Bench Pixel',
  );

  await user.clear(screen.getByLabelText('Display name for sdk-abc'));
  await user.tab();
  expect((await screen.findByRole('alert')).textContent).toContain('needs a display name');
  expect(((await screen.findByLabelText('Display name for sdk-abc')) as HTMLInputElement).value).toBe(
    'Bench Pixel',
  );
});

// FR-017 — allowlist is the default, and switching to open changes what the screen promises.
test('the access policy defaults to allowlist and can be set to open', async () => {
  const user = userEvent.setup();
  const command = ipc(() => invite('123456789'), { policy: 'Allowlist', devices: [device()] });
  render(<Devices workspaceId="ws-1" />);

  const policy = (await screen.findByLabelText('Access policy')) as HTMLSelectElement;
  expect(policy.value).toBe('Allowlist');
  expect(screen.getByText(/Only registered, enabled devices/)).toBeTruthy();

  await user.selectOptions(policy, 'Open');

  expect(await screen.findByText(/Any paired device may send records/)).toBeTruthy();
  expect(command).toHaveBeenCalledWith('set_device_policy', expect.objectContaining({ policy: 'Open' }));
});

// FR-021 — two devices streaming at once, each session its own row, isolated by device + session.
test('shows concurrent device sessions kept apart by device and session ID', async () => {
  vi.useFakeTimers();
  try {
    ipc(() => invite('123456789'), { policy: 'Allowlist', devices: [device()] }, [
      session(),
      // Same session ID, other device: the pair is the identity, so this is a second row.
      session({ device_id: 'sdk-xyz', display_name: 'Bench iPhone', platform: 'iOS', os_version: '17.4', record_count: 8 }),
      // Same device, second session — and a drop keeps the session rather than erasing it.
      session({ session_id: 'sess-2', connected: false, record_count: 1 }),
    ]);
    render(<Devices workspaceId="ws-1" />);
    await vi.advanceTimersByTimeAsync(1000);

    expect(screen.getAllByText('sess-1')).toHaveLength(2);
    expect(screen.getByText('sess-2')).toBeTruthy();
    expect(screen.getAllByText('Live')).toHaveLength(2);
    expect(screen.getByText('Disconnected — session kept')).toBeTruthy();
    expect(screen.getByText('sdk-xyz · iOS 17.4')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test('an empty session list says so rather than showing nothing', async () => {
  ipc(() => invite('123456789'));
  render(<Devices workspaceId="ws-1" />);

  expect(await screen.findByText(/No device has connected yet/)).toBeTruthy();
});

test('the countdown, code grouping and admission wording hold at their boundaries', () => {
  // FR-021: a connected device with no session yet is a state, not a blank cell.
  expect(sessionLabel(session({ session_id: '' }))).toBe('No session started');
  expect(sessionLabel(session())).toBe('sess-1');
  expect(sessionState(session())).toBe('Live');
  expect(sessionState(session({ connected: false }))).toBe('Disconnected — session kept');

  expect(admission(device(), 'Allowlist')).toBe('Allowed — on the allowlist');
  expect(admission(device(), 'Open')).toBe('Allowed — policy is open');
  // FR-018: disabled means rejected under either policy.
  expect(admission(device({ enabled: false }), 'Open')).toBe('Disabled — records rejected');

  const start = new Date('2026-08-06T10:00:00Z').getTime();
  expect(secondsLeft('2026-08-06T10:05:00Z', start)).toBe(300);
  expect(secondsLeft('2026-08-06T10:00:00Z', start)).toBe(0);
  expect(secondsLeft('2026-08-06T09:59:00Z', start)).toBe(0);
  expect(countdown(300)).toBe('5:00');
  expect(countdown(9)).toBe('0:09');
  expect(groupCode('123456789')).toBe('123 456 789');
});
