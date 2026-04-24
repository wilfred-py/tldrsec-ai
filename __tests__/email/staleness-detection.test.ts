import { StalenessDetector } from '@/lib/validation/staleness-detector';

describe('StalenessDetector', () => {
  describe('isStale', () => {
    it('should return false for filing from today', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-12'), now);
      expect(result.isStale).toBe(false);
    });

    it('should return false for filing from 5 days ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-07'), now);
      expect(result.isStale).toBe(false);
    });

    it('should return true for filing from 8 days ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-04'), now);
      expect(result.isStale).toBe(true);
      expect(result.daysOld).toBe(8);
    });

    it('should return true for filing from 3 months ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2025-11-01'), now);
      expect(result.isStale).toBe(true);
      expect(result.daysOld).toBeGreaterThan(90);
    });

    it('should return severity "warning" for 7-30 days old', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-01-25'), now);
      expect(result.severity).toBe('warning');
    });

    it('should return severity "critical" for 30+ days old', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2025-12-01'), now);
      expect(result.severity).toBe('critical');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format "Filed today" for same-day', () => {
      expect(StalenessDetector.formatRelativeTime(0)).toBe('Filed today');
    });

    it('should format "Filed 1 day ago" for yesterday', () => {
      expect(StalenessDetector.formatRelativeTime(1)).toBe('Filed 1 day ago');
    });

    it('should format "Filed 2 weeks ago" for 14 days', () => {
      expect(StalenessDetector.formatRelativeTime(14)).toBe('Filed 2 weeks ago');
    });

    it('should format "Filed 3 months ago" for 90 days', () => {
      expect(StalenessDetector.formatRelativeTime(90)).toBe('Filed 3 months ago');
    });
  });
});

/**
 * Post-restructure positional regression — the StalenessBanner was moved from
 * BELOW the old header to ABOVE the new EmailLeadHeader (plan Step 6). These
 * tests lock in that position: when a filing is stale, the banner appears
 * FIRST in the visible body, before the logo/headline block.
 */
describe('StalenessBanner position (above EmailLeadHeader)', () => {
  // Dynamic require keeps the existing pure-logic tests above from paying the
  // React/jsdom import cost when run in isolation.
  const React = require('react') as typeof import('react');
  const { render } = require('@testing-library/react') as typeof import('@testing-library/react');
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
