import React from 'react';
import { render } from '@testing-library/react';
import { StalenessBanner } from '@/components/ui/email/templates/sections/StalenessBanner';

// Review Decision #10: Use fixed dates, inject `now` prop for deterministic tests.
describe('StalenessBanner', () => {
  const FIXED_NOW = new Date('2026-02-12T12:00:00Z');

  it('does not render when filing is fresh (same day)', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-02-12')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('does not render when filing is 5 days old (below 7-day threshold)', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-02-07')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders banner for 8-day-old filing', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-02-04')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toContain('This summary was delayed');
    expect(container.innerHTML).toContain('8 days ago');
  });

  it('renders warning-severity border for 18-day-old filing (amber)', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-01-25')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toContain('18 days ago');
    // Border hex is preserved in innerHTML (background/color are converted
    // to rgb() — see CLAUDE.md #10). Amber border = #F59E0B (warning).
    expect(container.innerHTML).toContain('#f59e0b');
  });

  it('escalates to critical-severity border at 30+ days (red)', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2025-12-01')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toContain('73 days ago');
    // Red border = #EF4444 (critical).
    expect(container.innerHTML).toContain('#ef4444');
    // The amber border MUST NOT appear in the critical banner.
    expect(container.innerHTML).not.toContain('#f59e0b');
  });

  it('flips to critical exactly at the 30-day boundary', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-01-13')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toContain('30 days ago');
    expect(container.innerHTML).toContain('#ef4444');
  });
});

/**
 * Post-restructure positional regression — the StalenessBanner was moved from
 * BELOW the old header to ABOVE the new EmailLeadHeader (plan Step 6). These
 * tests lock in that position: when a filing is stale, the banner appears
 * FIRST in the visible body, before the logo/headline block.
 */
describe('StalenessBanner position (above EmailLeadHeader)', () => {
  // Dynamic require keeps the existing pure-component tests above from paying
  // the cross-template import cost when run in isolation.
  const { Form8KMinimalistTemplate } = require(
    '@/components/ui/email/templates/8k-minimalist-template',
  ) as typeof import('@/components/ui/email/templates/8k-minimalist-template');

  it('renders stale banner before the logo + headline for an 8-day-old filing', () => {
    const { container } = render(
      React.createElement(Form8KMinimalistTemplate, {
        filing: {
          companyName: 'Apple Inc.',
          symbol: 'AAPL',
          filingType: '8-K',
          // 8 days before "now" — the component uses real Date.now(), so pick
          // a date relative to the current system clock.
          filingDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          filingUrl: 'https://sec.gov',
          summaryText: 'Stale filing.',
          summaryData: { headline: 'AAPL delayed 8-K' },
        } as never,
      }),
    );
    const html = container.innerHTML;

    const bannerIdx = html.indexOf('This summary was delayed');
    const logoIdx = html.indexOf('alt="tldrSEC"');

    expect(bannerIdx).toBeGreaterThanOrEqual(0);
    expect(logoIdx).toBeGreaterThan(bannerIdx);
  });

  it('does not render the banner for a fresh filing (< 7 days old)', () => {
    const { container } = render(
      React.createElement(Form8KMinimalistTemplate, {
        filing: {
          companyName: 'Apple Inc.',
          symbol: 'AAPL',
          filingType: '8-K',
          filingDate: new Date().toISOString(),
          filingUrl: 'https://sec.gov',
          summaryText: 'Fresh filing.',
          summaryData: { headline: 'AAPL fresh 8-K' },
        } as never,
      }),
    );
    expect(container.textContent).not.toMatch(/This summary was delayed/);
  });
});
