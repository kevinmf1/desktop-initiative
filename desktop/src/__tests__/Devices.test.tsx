import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import Devices, { countdown, groupCode, secondsLeft, type PairingInvite } from '../Devices';

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

function ipc(handler: () => unknown) {
  const command = vi.fn(handler);
  mockIPC(command as Parameters<typeof mockIPC>[0]);
  return command;
}

// FR-016 — QR plus a typable code is the default flow; no IP entry anywhere on the screen.
test('shows a QR, the pairing code and its expiry without asking for an address', async () => {
  const command = ipc(() => invite('123456789'));
  render(<Devices />);

  expect(await screen.findByRole('img', { name: 'Pairing QR code' })).toBeTruthy();
  expect(screen.getByLabelText('Pairing code').textContent).toBe('123 456 789');
  expect(screen.getByRole('timer').textContent).toContain('single use');
  expect(screen.getByText(/ws:\/\/10\.0\.0\.4:8787/)).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(command).toHaveBeenCalledTimes(1);
});

// FR-020a — refreshing mints a new token; the previous code is gone from the screen too.
test('refreshing replaces the code', async () => {
  const user = userEvent.setup();
  const tokens = ['111222333', '444555666'];
  const command = ipc(() => invite(tokens.shift()!));
  render(<Devices />);

  await screen.findByText('111 222 333');
  await user.click(screen.getByRole('button', { name: 'Refresh code' }));

  expect(await screen.findByText('444 555 666')).toBeTruthy();
  expect(screen.queryByText('111 222 333')).toBeNull();
  expect(command).toHaveBeenCalledTimes(2);
});

// FR-020a — an elapsed TTL stops offering the code rather than showing one that will be nacked.
test('an expired token is shown as expired, with no code and no QR', async () => {
  ipc(() => invite('999888777', -1));
  render(<Devices />);

  expect((await screen.findByRole('status')).textContent).toMatch(/expired/i);
  expect(screen.queryByLabelText('Pairing code')).toBeNull();
  expect(screen.queryByRole('img', { name: 'Pairing QR code' })).toBeNull();
});

test('a mint failure is surfaced instead of a blank panel', async () => {
  ipc(() => {
    throw 'Could not encode the QR';
  });
  render(<Devices />);

  expect((await screen.findByRole('status')).textContent).toContain('Could not encode the QR');
});

test('the countdown and code grouping hold at their boundaries', () => {
  const start = new Date('2026-08-06T10:00:00Z').getTime();
  expect(secondsLeft('2026-08-06T10:05:00Z', start)).toBe(300);
  expect(secondsLeft('2026-08-06T10:00:00Z', start)).toBe(0);
  expect(secondsLeft('2026-08-06T09:59:00Z', start)).toBe(0);
  expect(countdown(300)).toBe('5:00');
  expect(countdown(9)).toBe('0:09');
  expect(groupCode('123456789')).toBe('123 456 789');
});
