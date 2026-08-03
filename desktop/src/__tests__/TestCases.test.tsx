import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import TestCases, { summaryStatus, type PlanInstance, type TestCase } from '../TestCases';

afterEach(clearMocks);

function testCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 'tc-1',
    workspace_id: 'ws-1',
    title: 'User login with valid credentials',
    description: '',
    platform: 'Both',
    server: 'staging',
    lifecycle: 'Active',
    tags: ['Auth'],
    created_by: 'Kevin',
    created_at: '2026-08-04T10:00:00Z',
    updated_by: 'Kevin',
    updated_at: '2026-08-04T10:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

/** Routes each Tauri command to a handler; an unrouted command returns undefined. */
function ipc(handlers: Record<string, (args: any) => unknown>) {
  const command = vi.fn((name: string, args: unknown) =>
    name in handlers ? handlers[name](args) : undefined,
  );
  mockIPC(command as Parameters<typeof mockIPC>[0]);
  return command;
}

const inst = (plan: string, status: PlanInstance['status']): PlanInstance => ({ plan, status });

// FR-003a — the precedence order, and the fact that it is derived rather than read from a field.
test('the summary status is derived across plan instances in precedence order', () => {
  expect(summaryStatus([])).toBe('Not Run');
  expect(summaryStatus([inst('A', 'Not Run'), inst('B', 'Not Run')])).toBe('Not Run');
  expect(summaryStatus([inst('A', 'Passed'), inst('B', 'Passed')])).toBe('All Passed');
  expect(summaryStatus([inst('A', 'Passed'), inst('B', 'Not Run')])).toBe('In Progress');
  expect(summaryStatus([inst('A', 'Passed'), inst('B', 'Blocked')])).toBe('Blocked');
  // Fail outranks everything, including Blocked.
  expect(summaryStatus([inst('A', 'Blocked'), inst('B', 'Failed'), inst('C', 'Passed')])).toBe(
    'Has Fail',
  );
});

// FR-003a — the derived badge is shown per row and per-instance status on expand.
test('a row shows its derived badge and reveals per-plan status when expanded', async () => {
  const user = userEvent.setup();
  ipc({ list_test_cases: () => [testCase()] });
  render(
    <TestCases
      workspaceId="ws-1"
      instancesByCase={{ 'tc-1': [inst('Smoke Tests', 'Passed'), inst('Checkout Flow', 'Failed')] }}
    />,
  );

  const row = (await screen.findByText('User login with valid credentials')).closest('tr')!;
  expect(within(row).getByText('Has Fail')).toBeTruthy();

  await user.click(within(row).getByRole('button', { expanded: false }));
  expect(screen.getByText('Checkout Flow')).toBeTruthy();
  expect(screen.getByText('Failed')).toBeTruthy();
});

// FR-003 / FR-003c / FR-005
test('creating a case sends only spec fields and no status, then reloads the list', async () => {
  const user = userEvent.setup();
  const saved: unknown[] = [];
  const command = ipc({
    list_test_cases: () => (saved.length ? [testCase({ title: 'Password reset' })] : []),
    save_test_case: (args) => {
      saved.push(args);
      return testCase();
    },
  });
  render(<TestCases workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'New Case' }));
  const form = screen.getByRole('form', { name: 'New Test Case' });
  await user.type(within(form).getByLabelText('Title'), 'Password reset');
  await user.selectOptions(within(form).getByLabelText('Platform'), 'iOS');
  await user.type(within(form).getByLabelText('Server'), 'staging');
  await user.type(within(form).getByLabelText('Tags'), 'Auth, Regression');
  await user.click(within(form).getByRole('button', { name: 'Save' }));

  expect(saved).toEqual([
    {
      workspaceId: 'ws-1',
      input: {
        title: 'Password reset',
        description: '',
        platform: 'iOS',
        server: 'staging',
        lifecycle: 'Active',
        tags: ['Auth', 'Regression'],
      },
    },
  ]);
  // Platform is one of exactly iOS/Android/Both (FR-003c) — nothing else is offered.
  expect(command.mock.calls.filter(([name]) => name === 'list_test_cases')).toHaveLength(2);
  expect(await screen.findByText('Password reset')).toBeTruthy();
});

test('the platform and lifecycle choices are exactly the spec values', async () => {
  const user = userEvent.setup();
  ipc({ list_test_cases: () => [] });
  render(<TestCases workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'New Case' }));
  const options = (label: string) =>
    [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((o) => o.value);

  expect(options('Platform')).toEqual(['iOS', 'Android', 'Both']);
  // FR-003b — the lifecycle flag carries no run outcome.
  expect(options('Lifecycle')).toEqual(['Active', 'Archived']);
});

// FR-003b — archiving is an edit of the lifecycle flag, sent with the case's id.
test('editing a case archives it in place instead of creating a second one', async () => {
  const user = userEvent.setup();
  const saved: any[] = [];
  ipc({
    list_test_cases: () => [testCase()],
    save_test_case: (args) => {
      saved.push(args);
      return testCase({ lifecycle: 'Archived' });
    },
  });
  render(<TestCases workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  const form = screen.getByRole('form', { name: 'Edit Test Case' });
  await user.selectOptions(within(form).getByLabelText('Lifecycle'), 'Archived');
  await user.click(within(form).getByRole('button', { name: 'Save' }));

  expect(saved[0].input.id).toBe('tc-1');
  expect(saved[0].input.lifecycle).toBe('Archived');
});

// FR-006 — confirmation first; the store keeps the row (asserted in `test_case.rs`).
test('delete asks for confirmation and does nothing when declined', async () => {
  const user = userEvent.setup();
  const command = ipc({ list_test_cases: () => [testCase()], delete_test_case: () => undefined });
  const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<TestCases workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(confirmed).toHaveBeenCalled();
  expect(command.mock.calls.some(([name]) => name === 'delete_test_case')).toBe(false);

  confirmed.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(command).toHaveBeenCalledWith('delete_test_case', { workspaceId: 'ws-1', id: 'tc-1' });
  confirmed.mockRestore();
});

// FR-001 — the read is workspace-scoped, and a switch re-reads for the new workspace.
test('the list is read for the active workspace only', async () => {
  const command = ipc({ list_test_cases: () => [] });
  const { rerender } = render(<TestCases workspaceId="ws-1" />);
  await screen.findByRole('button', { name: 'New Case' });

  rerender(<TestCases workspaceId="ws-3" />);

  expect(command.mock.calls.filter(([name]) => name === 'list_test_cases')).toEqual([
    ['list_test_cases', { workspaceId: 'ws-1' }],
    ['list_test_cases', { workspaceId: 'ws-3' }],
  ]);
});

test('a store failure is reported instead of showing an empty list as success', async () => {
  ipc({
    list_test_cases: () => {
      throw new Error('test-cases.json is not readable');
    },
  });
  render(<TestCases workspaceId="ws-1" />);

  expect((await screen.findByRole('alert')).textContent).toContain('is not readable');
});
