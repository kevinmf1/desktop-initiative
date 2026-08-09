import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import type { DeviceSession } from '../Devices';
import LogInspector, { logRow, matches, type Frame } from '../LogInspector';

afterEach(clearMocks);

function session(over: Partial<DeviceSession> = {}): DeviceSession {
  return {
    device_id: 'sdk-abc',
    session_id: 'sess-1',
    display_name: 'Pixel 8',
    platform: 'Android',
    os_version: '15',
    contract_version: '1.0.0',
    connected: true,
    record_count: 0,
    started_at: '2026-08-10T10:00:00Z',
    last_seen_at: '2026-08-10T10:00:05Z',
    ...over,
  };
}

/** The frames the contract defines, one of each shape the viewer has to render. */
const FRAMES: Frame[] = [
  {
    type: 'user_action',
    action_id: 'a1',
    action_type: 'tap',
    label: 'Checkout',
    screen_context: 'CheckoutViewController',
    occurred_at: '2026-08-10T10:00:01Z',
  },
  {
    type: 'log_event',
    request_id: 'r1',
    action_id: 'a1',
    session_id: 'sess-1',
    phase: 'started',
    method: 'POST',
    url: 'https://api.acme.io/api/v1/orders',
    started_at: '2026-08-10T10:00:02Z',
  },
  {
    type: 'log_event',
    request_id: 'r1',
    session_id: 'sess-1',
    phase: 'completed',
    method: 'POST',
    url: 'https://api.acme.io/api/v1/orders',
    status_code: 500,
    duration_ms: 1203,
    started_at: '2026-08-10T10:00:02Z',
  },
  {
    type: 'app_log',
    log_id: 'l1',
    session_id: 'sess-1',
    level: 'error',
    tag: 'OkHttp',
    message: 'order submit failed',
    source: 'facade',
    logged_at: '2026-08-10T10:00:03Z',
  },
  // FR-000d: a type this contract minor never heard of is still a visible row.
  { type: 'invented_by_a_newer_minor', payload: 1 },
];

function ipc(sessions: DeviceSession[], records: Record<string, Frame[]> = {}) {
  mockIPC(((cmd: string, args: Record<string, string>) => {
    switch (cmd) {
      case 'device_sessions':
        return sessions;
      case 'session_records':
        return records[`${args.deviceId} ${args.sessionId}`] ?? [];
      default:
        throw `unexpected command ${cmd}`;
    }
  }) as unknown as Parameters<typeof mockIPC>[0]);
}

// FR-029a — the parity requirement, asserted rather than promised: the same frames sent by an iOS
// SDK and an Android SDK derive byte-identical rows, because no row depends on the platform.
test('renders a record identically whichever platform sent it', () => {
  const rows = FRAMES.map(logRow);
  // The two SDKs' frames differ only in which platform sent them, and a row is derived from
  // contract fields alone — so tagging the same frame either way changes nothing about it.
  for (const platform of ['iOS', 'Android']) {
    expect(FRAMES.map((frame, index) => logRow({ ...frame, platform }, index))).toEqual(rows);
  }

  expect(rows[1]).toMatchObject({
    kind: 'log_event',
    title: 'POST https://api.acme.io/api/v1/orders',
    detail: 'started',
    tone: 'muted',
  });
  expect(rows[2]).toMatchObject({ detail: '500 · 1203ms', tone: 'fail' });
  expect(rows[3]).toMatchObject({ title: 'OkHttp: order submit failed', detail: 'error · facade', tone: 'fail' });
  expect(rows[0]).toMatchObject({ title: 'Checkout', tone: 'pass' });
  expect(rows[4]).toMatchObject({ kind: 'invented_by_a_newer_minor', title: 'invented_by_a_newer_minor' });
});

test('filters on what the row shows, and 4xx is a warning while 5xx is a failure', () => {
  const rows = FRAMES.map(logRow);
  expect(rows.filter((row) => matches(row, 'okhttp'))).toHaveLength(1);
  expect(rows.filter((row) => matches(row, '/api/v1/orders'))).toHaveLength(2);
  expect(rows.filter((row) => matches(row, ''))).toHaveLength(FRAMES.length);
  expect(logRow({ type: 'log_event', status_code: 422 }, 0).tone).toBe('warn');
  expect(logRow({ type: 'log_event', status_code: 200 }, 0).tone).toBe('pass');
  expect(logRow({ type: 'log_event', status_code: 200, error: 'socket closed' }, 0).tone).toBe('fail');
});

test('streams the picked session and never shows another session’s records', async () => {
  ipc(
    [
      session({ record_count: FRAMES.length }),
      session({ device_id: 'sdk-ios', session_id: 'sess-2', display_name: "Marco's iPhone", platform: 'iOS', record_count: 1 }),
    ],
    {
      'sdk-abc sess-1': FRAMES,
      'sdk-ios sess-2': [{ type: 'app_log', tag: 'Only', message: 'on the iPhone', level: 'info' }],
    },
  );
  render(<LogInspector workspaceId="ws-1" />);

  expect(await screen.findByText('OkHttp: order submit failed')).toBeTruthy();
  expect(screen.queryByText('Only: on the iPhone')).toBeNull();
  expect(screen.getByText(/5 of 5 records · 2 devices/)).toBeTruthy();

  // FR-021: switching to the other device's session swaps the records, it does not merge them.
  await userEvent.click(screen.getByText('sess-2'));
  expect(await screen.findByText('Only: on the iPhone')).toBeTruthy();
  expect(screen.queryByText('OkHttp: order submit failed')).toBeNull();
});

test('a filter narrows the list without losing the record it points at', async () => {
  ipc([session({ record_count: FRAMES.length })], { 'sdk-abc sess-1': FRAMES });
  render(<LogInspector workspaceId="ws-1" />);

  await userEvent.type(await screen.findByLabelText('Filter records'), 'okhttp');
  expect(screen.getByText(/1 of 5 records/)).toBeTruthy();

  // The surviving row still opens its own frame — filtering must not shift the selection.
  await userEvent.click(screen.getByText('OkHttp: order submit failed'));
  expect(screen.getByLabelText('Raw frame').textContent).toContain('"log_id": "l1"');
});

test('says no device is connected rather than showing an empty log', async () => {
  ipc([]);
  render(<LogInspector workspaceId="ws-1" />);
  expect(await screen.findByText('No device connected')).toBeTruthy();
});

test('a connected device with no records yet is a session, not an empty screen', async () => {
  ipc([session({ session_id: '' })]);
  render(<LogInspector workspaceId="ws-1" />);
  expect(await screen.findByText('No session started')).toBeTruthy();
  expect(screen.getByText('This session has not streamed a record yet.')).toBeTruthy();
});

test('polling stops when the screen unmounts', () => {
  vi.useFakeTimers();
  try {
    ipc([session()]);
    const view = render(<LogInspector workspaceId="ws-1" />);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
