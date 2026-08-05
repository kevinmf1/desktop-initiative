import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import type { TestCase } from '../TestCases';
import TestPlans, { type TestPlan } from '../TestPlans';

afterEach(clearMocks);

function testCase(id = 'tc-1', title = 'User login'): TestCase {
  return {
    id,
    workspace_id: 'ws-1',
    title,
    description: '',
    platform: 'Both',
    server: 'staging',
    lifecycle: 'Active',
    tags: [],
    created_by: 'Kevin',
    created_at: '2026-08-06T10:00:00Z',
    updated_by: 'Kevin',
    updated_at: '2026-08-06T10:00:00Z',
    deleted_at: null,
  };
}

function testPlan(overrides: Partial<TestPlan> = {}): TestPlan {
  return {
    id: 'tp-1',
    workspace_id: 'ws-1',
    name: 'Regression',
    notes: 'Release checks',
    target_build: '2.4.0',
    environment: 'staging',
    lifecycle: 'Active',
    created_at: '2026-08-06T10:00:00Z',
    updated_at: '2026-08-06T10:00:00Z',
    items: [],
    ...overrides,
  };
}

function ipc(handlers: Record<string, (args: any) => unknown>) {
  const command = vi.fn((name: string, args: unknown) =>
    name in handlers ? handlers[name](args) : undefined,
  );
  mockIPC(command as Parameters<typeof mockIPC>[0]);
  return command;
}

// FR-009 / FR-010 / FR-011
test('creates a plan with notes, target build, environment and reusable case links', async () => {
  const user = userEvent.setup();
  const sent: any[] = [];
  const saved = testPlan({
    name: 'Smoke',
    notes: 'Critical path',
    target_build: '3.0.0',
    environment: 'qa.example.com',
    items: [{ id: 'tpi-1', test_case_id: 'tc-1', instance_status: 'Not Run', updated_at: '2026-08-06T10:00:00Z' }],
  });
  ipc({
    list_test_plans: () => (sent.length ? [saved] : []),
    list_test_cases: () => [testCase()],
    save_test_plan: (args) => (sent.push(args), saved),
  });
  render(<TestPlans workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'New Plan' }));
  const form = screen.getByRole('form', { name: 'New Test Plan' });
  await user.type(within(form).getByLabelText('Name'), 'Smoke');
  await user.type(within(form).getByLabelText('Plan notes'), 'Critical path');
  await user.type(within(form).getByLabelText('Target build'), '3.0.0');
  await user.type(within(form).getByLabelText('Environment / Server'), 'qa.example.com');
  await user.click(within(form).getByRole('checkbox', { name: 'User login' }));
  await user.click(within(form).getByRole('button', { name: 'Save Plan' }));

  expect(sent).toEqual([{
    workspaceId: 'ws-1',
    input: {
      name: 'Smoke',
      notes: 'Critical path',
      target_build: '3.0.0',
      environment: 'qa.example.com',
      lifecycle: 'Active',
      test_case_ids: ['tc-1'],
    },
  }]);
  expect(await screen.findByRole('heading', { name: 'Smoke' })).toBeTruthy();
  expect(screen.getByText(/Target build:/).parentElement?.textContent).toContain('3.0.0');
});

test('duplicate and archive controls call the dedicated plan operations', async () => {
  const user = userEvent.setup();
  let plans = [testPlan()];
  const command = ipc({
    list_test_plans: () => plans,
    list_test_cases: () => [],
    duplicate_test_plan: () => {
      const copy = testPlan({ id: 'tp-2', name: 'Regression Copy' });
      plans = [...plans, copy];
      return copy;
    },
    archive_test_plan: ({ id }) => {
      plans = plans.map((plan) => plan.id === id ? { ...plan, lifecycle: 'Archived' as const } : plan);
    },
  });
  render(<TestPlans workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'Duplicate' }));
  expect(await screen.findByRole('heading', { name: 'Regression Copy' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Archive' }));

  expect(command).toHaveBeenCalledWith('duplicate_test_plan', { workspaceId: 'ws-1', id: 'tp-1' });
  expect(command).toHaveBeenCalledWith('archive_test_plan', { workspaceId: 'ws-1', id: 'tp-2' });
  expect((await screen.findByText('Lifecycle:')).parentElement?.textContent).toBe('Lifecycle: Archived');
});

test('removing a case updates only plan membership and keeps the Test Case itself', async () => {
  const user = userEvent.setup();
  const linked = testPlan({
    items: [{ id: 'tpi-1', test_case_id: 'tc-1', instance_status: 'Passed', updated_at: '2026-08-06T10:00:00Z' }],
  });
  let plans = [linked];
  const sent: any[] = [];
  ipc({
    list_test_plans: () => plans,
    list_test_cases: () => [testCase()],
    save_test_plan: ({ input }) => {
      sent.push(input);
      plans = [{ ...linked, items: [] }];
      return plans[0];
    },
  });
  render(<TestPlans workspaceId="ws-1" />);

  await user.click(await screen.findByRole('button', { name: 'Remove User login' }));

  expect(sent[0].test_case_ids).toEqual([]);
  expect(sent[0].target_build).toBe('2.4.0');
  expect(await screen.findByText('No Test Cases in this plan.')).toBeTruthy();
});
