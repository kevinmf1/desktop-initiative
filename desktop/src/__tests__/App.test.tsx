import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import App, { SCREENS } from '../App';

afterEach(clearMocks);

test('every screen in the rail is reachable and marked current', async () => {
  const user = userEvent.setup();
  mockIPC(() => undefined);
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

  for (const s of SCREENS) {
    await user.click(screen.getByRole('button', { name: s.label }));
    expect(screen.getAllByRole('button', { current: 'page' })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(s.label);
  }
});

test('starts Google sign-in through the Rust command and reports failures', async () => {
  const user = userEvent.setup();
  const command = vi.fn(() => {
    throw new Error('Google sign-in is not configured');
  });
  mockIPC(command);
  render(<App />);

  await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));

  expect(command).toHaveBeenCalledWith('sign_in_with_google', {});
  expect((await screen.findByRole('alert')).textContent).toContain('Google sign-in is not configured');
});
