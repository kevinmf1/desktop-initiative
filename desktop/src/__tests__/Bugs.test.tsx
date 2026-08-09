import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import Bugs, { captureState, precedingActions, type Capture, withinWindow } from '../Bugs';
import { logRow, type Frame } from '../LogInspector';
import type { Bug } from '../Runner';

afterEach(clearMocks);

const bug = (overrides: Partial<Bug> = {}): Bug => ({
  id: 'bug-1',
  workspace_id: 'ws-1',
  test_session_id: 'ts-1',
  device_id: 'dev-a',
  title: 'Checkout 500s',
  description: '',
  severity: 'P2',
  status: 'Open',
  test_case_id: null,
  test_plan_id: null,
  build_version: '2.4.1',
  environment: 'staging',
  marked_by: 'Kevin',
  marked_at: '2026-08-10T10:15:00Z',
  window_seconds: 30,
  window_start: '2026-08-10T10:14:30Z',
  window_end: '2026-08-10T10:15:30Z',
  synced_at: null,
  ...overrides,
});

const entriesOf = (frames: Frame[]) => frames.map((frame, index) => ({ row: logRow(frame, index), frame }));

const action = (at: string, label: string, action_id: string): Frame => ({
  type: 'user_action',
  action_id,
  label,
  action_type: 'tap',
  started_at: at,
});

const call = (at: string, action_id: string, status_code = 500): Frame => ({
  type: 'log_event',
  action_id,
  method: 'POST',
  url: '/checkout',
  status_code,
  logged_at: at,
});

const FRAMES: Frame[] = [
  action('2026-08-10T10:13:00Z', 'Open cart', 'a-0'), // before the window
  action('2026-08-10T10:14:40Z', 'Tap Pay', 'a-1'),
  call('2026-08-10T10:14:41Z', 'a-1'),
  action('2026-08-10T10:15:20Z', 'Retry', 'a-2'), // after the marker, still in the window
  call('2026-08-10T10:16:30Z', 'a-2', 200), // after the window
  { type: 'app_log', level: 'error', message: 'no timestamp anywhere' },
];

function ipc(handlers: Record<string, (args: any) => unknown> = {}) {
  const defaults: Record<string, (args: any) => unknown> = {
    list_bugs: () => [bug()],
    list_test_cases: () => [
      { id: 'tc-1', workspace_id: 'ws-1', title: 'Checkout', lifecycle: 'Active' },
      { id: 'tc-2', workspace_id: 'ws-1', title: 'Archived case', lifecycle: 'Archived' },
    ],
    list_test_sessions: () => [{ id: 'ts-1', name: 'Regression', platform: 'Android' }],
    // FR-035b: the durable log, read by device — no live session has to exist for a bug to show
    // its evidence, which is exactly what makes it survive a restart.
    device_records: ({ deviceId }: { deviceId: string }) => (deviceId === 'dev-a' ? FRAMES : []),
    list_captures: () => [],
    upload_captures: () => ({ queued: 0, uploaded: 0, offline: false, detail: 'No capture is waiting to upload.' }),
  };
  const command = vi.fn((name: string, args: unknown) =>
    name in handlers ? handlers[name](args) : defaults[name]?.(args),
  );
  mockIPC(command as Parameters<typeof mockIPC>[0]);
  return command;
}

test('the window selects the excerpt, and a frame with no timestamp cannot be placed in it', () => {
  const entries = entriesOf(FRAMES);

  const excerpt = withinWindow(entries, bug());

  expect(excerpt.map(({ row }) => row.title)).toEqual(['Tap Pay', 'POST /checkout', 'Retry']);
  // FR-032: widening the window is a re-read of the same frames, never a re-capture.
  const wide = withinWindow(entries, bug({ window_seconds: 120, window_start: '2026-08-10T10:13:00Z', window_end: '2026-08-10T10:17:00Z' }));
  expect(wide).toHaveLength(5);
});

test('preceding User Actions stop at the marker', () => {
  const actions = precedingActions(entriesOf(FRAMES), bug());

  // 'Retry' is inside the window but *after* the click, so it did not precede the bug.
  expect(actions.map(({ row }) => row.title)).toEqual(['Tap Pay']);
});

test('capture state distinguishes receiving, pending upload, and uploaded', () => {
  const base: Capture = {
    id: 'cap-1',
    bug_id: 'bug-1',
    content_type: 'image/png',
    total_size: 100,
    received: 25,
    verified: false,
    uploaded_at: null,
  };

  expect(captureState(base)).toBe('Receiving 25%');
  expect(captureState({ ...base, received: 100, verified: true })).toBe('Pending upload');
  expect(captureState({ ...base, received: 100, verified: true, uploaded_at: '2026-08-10T10:20:00Z' })).toBe('Uploaded');
});

test('a bug shows its record, its excerpt and the actions that preceded it', async () => {
  ipc({
    list_captures: () => [{
      id: 'cap-1', bug_id: 'bug-1', content_type: 'image/png', total_size: 2_097_152,
      received: 2_097_152, verified: true, uploaded_at: null,
    } satisfies Capture],
  });

  render(<Bugs workspaceId="ws-1" />);

  const detail = await screen.findByLabelText('Bug Checkout 500s');
  expect(within(detail).getByText(/Build 2\.4\.1/)).toBeTruthy();
  expect(within(detail).getByText(/staging/)).toBeTruthy();
  expect(within(detail).getByText(/Session Regression/)).toBeTruthy();
  expect((within(detail).getByLabelText('Severity') as HTMLSelectElement).value).toBe('P2');
  expect((within(detail).getByLabelText('Status') as HTMLSelectElement).value).toBe('Open');

  await waitFor(() =>
    expect(within(screen.getByLabelText('Log excerpt')).getAllByText('/checkout', { exact: false })).toHaveLength(1),
  );
  expect(within(screen.getByLabelText('Preceding User Actions')).getAllByRole('listitem')).toHaveLength(1);
  // Grouped by the same User Action the live viewer groups by.
  expect(within(screen.getByLabelText('Log excerpt')).getByText('Tap Pay')).toBeTruthy();
  expect(within(screen.getByLabelText('Attached captures')).getByText('image/png')).toBeTruthy();
  expect(within(screen.getByLabelText('Attached captures')).getByText('2.0 MB')).toBeTruthy();
  expect(within(screen.getByLabelText('Attached captures')).getByText('Pending upload')).toBeTruthy();
  // Only an Active case is offerable as the related one.
  expect(within(detail).queryByText('Archived case')).toBeNull();
});

test('triage sends one field and the refusal is reported', async () => {
  const command = ipc({
    update_bug: ({ patch }: { patch: Record<string, unknown> }) => {
      if (patch.window_seconds === 9000) throw 'The evidence window must be between 1 and 3600 seconds.';
      return bug({ ...patch } as Partial<Bug>);
    },
  });
  const user = userEvent.setup();
  render(<Bugs workspaceId="ws-1" />);

  await user.selectOptions(await screen.findByLabelText('Status'), 'In Progress');

  expect(command).toHaveBeenCalledWith(
    'update_bug',
    expect.objectContaining({ workspaceId: 'ws-1', id: 'bug-1', patch: { status: 'In Progress' } }),
  );
  await waitFor(() => expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('In Progress'));

  const window = screen.getByLabelText('Evidence window (± seconds)');
  await user.clear(window);
  await user.type(window, '9000');
  await user.tab();

  expect((await screen.findByRole('alert')).textContent).toMatch(/between 1 and 3600 seconds/);
});

// FR-035, FR-035b — an unreachable backend is a state, never a failure, and never a data loss.
test('an unsynced bug says so, and syncing while offline leaves it recorded and queued', async () => {
  const command = ipc({
    sync_now: () => ({
      queued: 1,
      applied: 0,
      duplicate: 0,
      rejected: [],
      offline: true,
      detail: 'The backend is unreachable — records stay queued.',
    }),
  });
  const user = userEvent.setup();
  render(<Bugs workspaceId="ws-1" />);

  const detail = await screen.findByLabelText('Bug Checkout 500s');
  expect(within(detail).getByText('Not yet synced')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toMatch(/1 not yet synced/);

  await user.click(screen.getByText('Sync now'));

  expect(command).toHaveBeenCalledWith('sync_now', expect.objectContaining({ workspaceId: 'ws-1' }));
  expect(command).toHaveBeenCalledWith('upload_captures', expect.objectContaining({ workspaceId: 'ws-1' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/unreachable/));
  // The record and its evidence are untouched by a failed push — that is the whole promise.
  expect(within(await screen.findByLabelText('Bug Checkout 500s')).getByText('Not yet synced')).toBeTruthy();
  expect(within(screen.getByLabelText('Log excerpt')).getByText('Tap Pay')).toBeTruthy();
});
