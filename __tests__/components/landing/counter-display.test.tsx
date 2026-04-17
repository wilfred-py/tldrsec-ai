import React from 'react';
import { render, screen } from '@testing-library/react';

// Use the repo's existing manual mock at __mocks__/framer-motion.tsx.
jest.mock('framer-motion');

import { CounterDisplay } from '@/components/landing/counter/counter-display';

describe('CounterDisplay', () => {
  it('renders custom srLabel when provided', () => {
    render(<CounterDisplay count={42} srLabel="42 minutes saved" />);
    expect(screen.getByText('42 minutes saved')).toBeInTheDocument();
  });

  it('falls back to default waitlist sr text when srLabel is omitted', () => {
    render(<CounterDisplay count={147} />);
    expect(screen.getByText(/Current waitlist count: 147 investors/)).toBeInTheDocument();
  });

  it('renders empty sr text when srLabel is empty string (caller owns accessibility)', () => {
    const { container } = render(<CounterDisplay count={42} srLabel="" />);
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly?.textContent).toBe('');
  });

  it('omits role="status" when suppressLiveRegion is true', () => {
    render(
      <CounterDisplay count={42} srLabel="42 minutes saved" suppressLiveRegion />
    );
    // No live region on our wrapper — parent is expected to own it.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps role="status" when suppressLiveRegion is omitted (waitlist backward compat)', () => {
    render(<CounterDisplay count={42} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
