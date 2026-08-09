import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import type { Device } from '../Devices';
import Runner, { draftScope, isRunning, type Bug, type TestSession } from '../Runner';
import type { TestCase } from '../TestCases';
import type { TestPlan } from '../TestPlans';

afterEach(clearMocks);

const testCase = (id = 'tc-1', title = 'User login'): TestCase => ({
  id,
  workspace_id: 'ws-1',
  title,
  description: '',
  platform: 'Both',
  server: 'staging',
  lifecycle: 'Active',
  tags: [],
  created_by: 'Kevin',
  created_at: '2026-08-10T10:00:00Z',
  updated_by: 'Kevin',
  updated_at: '2026-08-10T10:00:00Z',
  deleted_at: null,
});

const testPlan = (items: string[] = ['tc-1']): TestPlan => ({
  id: 'tp-1',
  workspace_id: 'ws-1',
  name: 'Regression',
  notes: '',
  target_build: '2.4.0',
  environment: 'staging',
  lifecycle: 'Active',
  created_at: '2026-08-10T10:00:00Z',
  updated_at: '2026-08-10T10:00:00Z',
  items: items.map((test_case_id, index) => ({
    id: `tpi-${index}`,
    test_case_id,
    instance_status: 'Not Run',
    updated_at: '2026-08-10T10:00:00Z',
  })),
});

const device = (overrides: Partial<Device> = {}): Device => ({
  id: 'dev-row-1',
  device_id: 'dev-a',
  display_name: 'Pixel 8',
  observed_platform: 'Android',
  enabled: true,
  sdk_contract_version: '3.0.0',
  os_version: '14',
  registered_at: '2026-08-10T09:00:00Z',
  ...overrides,
});

const session = (overrides: Partial<TestSession> = {}): TestSession => ({
  id: 'ts-1',
  workspace_id: 'ws-1',
  test_plan_id: 'tp-1',
  device_id: 'dev-a',
  name: 'Regression',
  started_by: 'Kevin',
  started_at: '2026-08-10T10:00:00Z',
  stopped_at: null,
  build_version: '2.4.1',
  platform: 'Android',
  server: 'staging',
  result: null,
  case_ids: ['tc-1'],
  synced_at: null,
  ...overrides,
});

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

function ipc(handlers: Record<string, (args: any) => unknown> = {}) {
  const defaults: Record<string, (args: any) => unknown> = {
    list_test_plans: () => [testPlan()],
    list_test_cases: () => [testCase(), testCase('tc-2', 'Password reset')],
    list_devices: () => ({ policy: 'Allowlist', devices: [device()] }),
    list_bugs: () => [],
  };
  const command = vi.fn((name: string, args: unknown) =>
    name in handlers ? handlers[name](args) : defaults[name]?.(args),
  );
  mockIPC(command as Parameters<typeof mockIPC>[0]);
  return command;
}

function mount(props: Partial<Parameters<typeof Runner>[0]> = {}) {
  return render(
    <Runner
      workspaceId="ws-1"
      sessions={[]}
      onSessionsChanged={() => {}}
      canStartNewSession
      offlineGraceUntil="2026-10-03T10:00:00Z"
      {...props}
    />,
  );
}

// FR-012
test('starting from a plan sends the plan, build, server, platform and device', async () => {
  const user = userEvent.setup();
  const command = ipc({ start_test_session: () => session() });
  const onSessionsChanged = vi.fn();
  mount({ onSessionsChanged });

  await user.selectOptions(await screen.findByLabelText('Test Plan'), 'tp-1');
  await user.type(screen.getByLabelText('Build version'), '2.4.1');
  await user.type(screen.getByLabelText('Server'), 'staging');
  await user.selectOptions(screen.getByLabelText('Platform'), 'Android');
  await user.selectOptions(screen.getByLabelText('Target device'), 'dev-a');
  await user.click(screen.getByRole('button', { name: 'Start Session' }));

  expect(command).toHaveBeenCalledWith('start_test_session', {
    workspaceId: 'ws-1',
    input: {
      test_plan_id: 'tp-1',
      test_case_ids: [],
      name: '',
      build_version: '2.4.1',
      server: 'staging',
      platform: 'Android',
      device_id: 'dev-a',
    },
  });
  expect(onSessionsChanged).toHaveBeenCalled();
});

// FR-012 — the ad hoc half.
test('an ad hoc run selects cases directly and a plan replaces that scope', async () => {
  const user = userEvent.setup();
  const command = ipc({ start_test_session: () => session({ test_plan_id: null }) });
  mount();

  await user.click(await screen.findByRole('checkbox', { name: 'Password reset' }));
  await user.type(screen.getByLabelText('Build version'), '2.4.1');
  await user.type(screen.getByLabelText('Server'), 'staging');
  await user.selectOptions(screen.getByLabelText('Target device'), 'dev-a');
  expect(screen.getByText('1 case in scope')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Start Session' }));

  expect(command.mock.calls.find(([name]) => name === 'start_test_session')?.[1]).toMatchObject({
    input: { test_plan_id: null, test_case_ids: ['tc-2'] },
  });

  // Picking a plan hides the ad hoc checkboxes, so the two can never disagree about the scope.
  await user.selectOptions(screen.getByLabelText('Test Plan'), 'tp-1');
  expect(screen.queryByRole('checkbox', { name: 'Password reset' })).toBeNull();
  expect(draftScope({ test_plan_id: 'tp-1', test_case_ids: ['tc-2'] } as never, [testPlan(['tc-1', 'tc-9'])])).toEqual([
    'tc-1',
    'tc-9',
  ]);
});

test('a refused start is reported and nothing is claimed to have started', async () => {
  const user = userEvent.setup();
  ipc({
    start_test_session: () => {
      throw new Error('A session needs a build version.');
    },
  });
  mount();

  await user.selectOptions(await screen.findByLabelText('Target device'), 'dev-a');
  await user.click(screen.getByRole('button', { name: 'Start Session' }));

  expect((await screen.findByRole('alert')).textContent).toContain('A session needs a build version.');
  expect(screen.getByText('No session is running.')).toBeTruthy();
});

// FR-014
test('stopping prompts for one of the four results and sends the chosen one', async () => {
  const user = userEvent.setup();
  const command = ipc({ stop_test_session: () => session({ stopped_at: '2026-08-10T11:00:00Z', result: 'Blocked' }) });
  const onSessionsChanged = vi.fn();
  mount({ sessions: [session()], onSessionsChanged });

  await user.click(await screen.findByRole('button', { name: 'Stop' }));

  const prompt = within(screen.getByRole('group', { name: 'Session result' }));
  for (const result of ['Passed', 'Failed', 'Blocked', 'Incomplete']) {
    expect(prompt.getByRole('button', { name: result })).toBeTruthy();
  }
  await user.click(prompt.getByRole('button', { name: 'Blocked' }));

  expect(command).toHaveBeenCalledWith('stop_test_session', {
    workspaceId: 'ws-1',
    id: 'ts-1',
    result: 'Blocked',
  });
  expect(onSessionsChanged).toHaveBeenCalled();
});

test('cancelling the prompt leaves the session running and unjudged', async () => {
  const user = userEvent.setup();
  const command = ipc();
  mount({ sessions: [session()] });

  await user.click(await screen.findByRole('button', { name: 'Stop' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(command.mock.calls.some(([name]) => name === 'stop_test_session')).toBe(false);
  expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
});

// FR-013
test('marking a bug mid-session records the marker and the session keeps running', async () => {
  const user = userEvent.setup();
  const command = ipc({ mark_bug: () => bug() });
  const onSessionsChanged = vi.fn();
  mount({ sessions: [session()], onSessionsChanged });

  await user.type(await screen.findByLabelText('Bug summary'), 'Checkout 500s');
  await user.click(screen.getByRole('button', { name: 'Bug Occurred' }));

  expect(command).toHaveBeenCalledWith('mark_bug', {
    workspaceId: 'ws-1',
    testSessionId: 'ts-1',
    summary: 'Checkout 500s',
  });
  // The run continues: nothing was stopped, no result was asked for, the card still offers Stop.
  expect(command.mock.calls.some(([name]) => name === 'stop_test_session')).toBe(false);
  expect(onSessionsChanged).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
  expect(screen.getByText('Running (1)')).toBeTruthy();

  // The marker is on the card with the window it bookmarked, and the field is clear for the next one.
  const markers = within(await screen.findByLabelText('Bug markers for Regression'));
  expect(markers.getByText('Checkout 500s')).toBeTruthy();
  expect(markers.getByText(/window/)).toBeTruthy();
  expect(screen.getByText('1 bug')).toBeTruthy();
  expect((screen.getByLabelText('Bug summary') as HTMLInputElement).value).toBe('');
});

// FR-013: a stopped run is a closed record — its markers are shown, no new one can be added.
test('a refused marker is reported, and a stopped session offers no marker at all', async () => {
  const user = userEvent.setup();
  ipc({
    list_bugs: () => [bug({ test_session_id: 'ts-0' })],
    mark_bug: () => {
      throw new Error('That session has been stopped — a bug marker needs a running session.');
    },
  });
  mount({
    sessions: [session(), session({ id: 'ts-0', name: 'Yesterday', stopped_at: '2026-08-09T12:00:00Z', result: 'Failed' })],
  });

  await user.click(await screen.findByRole('button', { name: 'Bug Occurred' }));
  expect((await screen.findByRole('alert')).textContent).toContain('needs a running session');

  // One marker form only — the running card's. The stopped card still shows its own marker.
  expect(screen.getAllByRole('button', { name: 'Bug Occurred' })).toHaveLength(1);
  expect(within(screen.getByLabelText('Bug markers for Yesterday')).getByText('Checkout 500s')).toBeTruthy();
});

// FR-012: the unique id is the join to the device's records, so it is on screen, not implied.
test('running and stopped sessions are listed apart, each showing its own session id', async () => {
  ipc();
  mount({
    sessions: [
      session(),
      session({ id: 'ts-0', name: 'Yesterday', stopped_at: '2026-08-09T12:00:00Z', result: 'Passed' }),
    ],
  });

  await waitFor(() => expect(screen.getByText('Running (1)')).toBeTruthy());
  expect(screen.getByText('Stopped (1)')).toBeTruthy();
  expect(screen.getByText('ts-1')).toBeTruthy();
  expect(screen.getByText('ts-0')).toBeTruthy();
  expect(screen.getByText('Passed')).toBeTruthy();
  expect(within(screen.getByLabelText('Session Regression')).getByText(/Pixel 8/)).toBeTruthy();
  expect(isRunning(session())).toBe(true);
  expect(isRunning(session({ stopped_at: '2026-08-09T12:00:00Z' }))).toBe(false);
});

// FR-053a — expiry gates starting a session, never a running one.
test('an expired offline grace hides the start form but keeps a running session stoppable', async () => {
  ipc();
  mount({ sessions: [session()], canStartNewSession: false });

  expect((await screen.findByRole('status')).textContent).toContain('Sign in again to start a new session');
  expect(screen.queryByRole('button', { name: 'Start Session' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
});
