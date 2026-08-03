import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import App, {
  SCREENS,
  WorkspaceShell,
  workspaceSwitchRefusal,
  type Account,
} from '../App';

afterEach(clearMocks);

function account(overrides: Partial<Account> = {}): Account {
  return {
    user: { id: 'user-1', display_name: 'Kevin', email: 'kevin@example.com' },
    memberships: [{ workspace_id: 'ws-1', name: 'Alpha', role: 'admin', status: 'active' }],
    offline_grace_until: '2026-10-03T10:00:00Z',
    can_start_new_session: true,
    ...overrides,
  };
}

/** Routes each Tauri command to a handler, defaulting to a signed-out desktop. */
function ipc(handlers: Record<string, (args: unknown) => unknown>) {
  const command = vi.fn((name: string, args: unknown) =>
    name in handlers ? handlers[name](args) : undefined,
  );
  mockIPC(command as Parameters<typeof mockIPC>[0]);
  return command;
}

test('every screen in the rail is reachable and marked current', async () => {
  const user = userEvent.setup();
  ipc({ cached_account: () => account() });
  render(<App />);

  for (const s of SCREENS) {
    await user.click(await screen.findByRole('button', { name: s.label }));
    expect(screen.getAllByRole('button', { current: 'page' })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(s.label);
  }
});

test('starts Google sign-in through the Rust command and reports failures', async () => {
  const user = userEvent.setup();
  const command = ipc({
    cached_account: () => null,
    sign_in_with_google: () => {
      throw new Error('Google sign-in is not configured');
    },
  });
  render(<App />);

  await user.click(await screen.findByRole('button', { name: 'Sign in with Google' }));

  expect(command).toHaveBeenCalledWith('sign_in_with_google', {});
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Google sign-in is not configured',
  );
});

// FR-052a / FR-053 / SC-022
test('a cached keychain session restores the workspace with no sign-in and no network call', async () => {
  const command = ipc({ cached_account: () => account(), list_test_cases: () => [] });
  render(<App />);

  expect(await screen.findByRole('heading', { level: 1, name: 'Test Cases' })).toBeTruthy();
  expect(screen.getByText('kevin@example.com')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  // Only the keychain read and the landing screen's own local read — no auth network call.
  expect(command.mock.calls.map(([name]) => name)).toEqual(['cached_account', 'list_test_cases']);
});

test('no cached session shows the Google-only sign-in screen', async () => {
  ipc({ cached_account: () => null });
  render(<App />);

  expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
  expect(screen.queryByLabelText(/password/i)).toBeNull();
});

// FR-053a — expiry gates a *new* session only.
test('expired offline grace still opens local data and gates only starting a new session', async () => {
  const user = userEvent.setup();
  ipc({ cached_account: () => account({ can_start_new_session: false }) });
  render(<App />);

  // Already-captured local data stays reachable on every other screen.
  for (const label of ['Test Cases', 'Bugs', 'Log Inspector']) {
    await user.click(await screen.findByRole('button', { name: label }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(label);
    expect(screen.queryByRole('status')).toBeNull();
  }

  await user.click(screen.getByRole('button', { name: 'Runner' }));
  expect((await screen.findByRole('status')).textContent).toContain(
    'Sign in again to start a new session',
  );
});

// FR-054
test('sign-out clears the local session and returns to the sign-in screen', async () => {
  const user = userEvent.setup();
  const command = ipc({ cached_account: () => account(), sign_out: () => undefined });
  render(<App />);

  await user.click(await screen.findByRole('button', { name: 'Sign out' }));

  expect(command).toHaveBeenCalledWith('sign_out', {});
  expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
});

// FR-056a — every workspace the user is in, and only those.
test('the switcher lists every active membership and no invited or removed one', async () => {
  ipc({
    cached_account: () =>
      account({
        memberships: [
          { workspace_id: 'ws-1', name: 'Alpha', role: 'admin', status: 'active' },
          { workspace_id: 'ws-2', name: 'Beta', role: 'admin', status: 'invited' },
          { workspace_id: 'ws-3', name: 'Gamma', role: 'admin', status: 'active' },
          { workspace_id: 'ws-4', name: 'Delta', role: 'admin', status: 'removed' },
        ],
      }),
  });
  render(<App />);

  const switcher = (await screen.findByLabelText('Workspace')) as HTMLSelectElement;
  expect([...switcher.options].map((o) => o.textContent)).toEqual(['Alpha', 'Gamma']);
  expect(switcher.value).toBe('ws-1');
});

// FR-001 / FR-056c
test('switching scopes the content to the new workspace without rewriting anything', async () => {
  const user = userEvent.setup();
  const command = ipc({
    cached_account: () =>
      account({
        memberships: [
          { workspace_id: 'ws-1', name: 'Alpha', role: 'admin', status: 'active' },
          { workspace_id: 'ws-3', name: 'Gamma', role: 'admin', status: 'active' },
        ],
      }),
    list_test_cases: () => [],
  });
  render(<App />);

  await user.click(await screen.findByRole('button', { name: 'Bugs' }));
  expect(screen.getByText(/Bugs in Alpha/)).toBeTruthy();

  await user.selectOptions(screen.getByLabelText('Workspace'), 'ws-3');

  expect(screen.getByText(/in Gamma/)).toBeTruthy();
  expect(screen.queryByText(/in Alpha/)).toBeNull();
  // No reattribution: a switch only re-*reads* for the workspace switched into. Nothing is
  // written, so no existing device, session, bug or capture can change workspace.
  expect(command.mock.calls.map(([name]) => name).filter((n) => n !== 'list_test_cases')).toEqual([
    'cached_account',
  ]);
});

// FR-056d
test('a switch is refused while a test session is running', async () => {
  const user = userEvent.setup();
  const signedIn = account({
    memberships: [
      { workspace_id: 'ws-1', name: 'Alpha', role: 'admin', status: 'active' },
      { workspace_id: 'ws-3', name: 'Gamma', role: 'admin', status: 'active' },
    ],
  });
  ipc({ list_test_cases: () => [] });
  render(<WorkspaceShell account={signedIn} onSignOut={() => {}} runningSessions={2} />);
  // The refusal is asserted from the Bugs screen so it is the only alert on the page.
  await user.click(screen.getByRole('button', { name: 'Bugs' }));

  await user.selectOptions(screen.getByLabelText('Workspace'), 'ws-3');

  expect((await screen.findByRole('alert')).textContent).toBe(
    'Stop the 2 running test sessions before switching workspace.',
  );
  expect((screen.getByLabelText('Workspace') as HTMLSelectElement).value).toBe('ws-1');
  expect(screen.getByText(/in Alpha/)).toBeTruthy();

  expect(workspaceSwitchRefusal(0)).toBeNull();
  expect(workspaceSwitchRefusal(1)).toContain('1 running test session before');
});

test('an account with no active membership says so instead of showing a workspace', async () => {
  ipc({
    cached_account: () =>
      account({
        memberships: [{ workspace_id: 'ws-2', name: 'Beta', role: 'admin', status: 'invited' }],
      }),
  });
  render(<App />);

  expect((await screen.findByRole('status')).textContent).toContain('No active workspace');
  expect(screen.queryByLabelText('Workspace')).toBeNull();
});

test('a sign-out that could not clear the credential stays signed in and says so', async () => {
  const user = userEvent.setup();
  ipc({
    cached_account: () => account(),
    sign_out: () => {
      throw new Error('Could not clear the session from the OS keychain');
    },
  });
  render(<App />);

  await user.click(await screen.findByRole('button', { name: 'Sign out' }));

  expect((await screen.findByRole('alert')).textContent).toContain('Could not clear the session');
  expect(screen.getByRole('heading', { level: 1, name: 'Test Cases' })).toBeTruthy();
});
