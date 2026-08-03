import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import App, { SCREENS } from '../App';

// ponytail: one check for the only logic in the shell — every screen is reachable and
// exactly one is current. Screen content gets its own tests when the screens get built.
test('every screen in the rail is reachable and marked current', async () => {
  const user = userEvent.setup();
  render(<App />);

  for (const s of SCREENS) {
    await user.click(screen.getByRole('button', { name: s.label }));
    expect(screen.getAllByRole('button', { current: 'page' })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(s.label);
  }
});
