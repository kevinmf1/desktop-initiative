import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import App, { SCREENS, type Account } from '../App';

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
  const command = ipc({ cached_account: () => account() });
  render(<App />);

  expect(await screen.findByRole('heading', { level: 1, name: 'Test Cases' })).toBeTruthy();
  expect(screen.getByText('kevin@example.com')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  expect(command.mock.calls.map(([name]) => name)).toEqual(['cached_account']);
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
