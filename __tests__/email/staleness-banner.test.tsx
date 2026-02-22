import React from 'react';
import { render } from '@testing-library/react';
import { StalenessBanner } from '@/components/ui/email/templates/sections/StalenessBanner';

// Review Decision #10: Use fixed dates, inject `now` prop for deterministic tests
describe('StalenessBanner', () => {
  const FIXED_NOW = new Date('2026-02-12T12:00:00Z');

  it('should not render when filing is fresh', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-02-12')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('should render warning banner for stale filing', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-01-13')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toContain('delayed');
    // Verify banner renders with content (not empty)
    expect(container.innerHTML.length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain('days ago');
  });
});
