/**
 * Form 4 summary styling — render tests for the styling refresh:
 *   1. Transaction value cells render in near-black (#111827), not the prior config color.
 *   2. Holdings row is segmented: pre-stake gray (#6B7280), arrow → and post-stake near-black,
 *      and (% change) red/green only when non-zero.
 *   3. The arrow always points right (→).
 *   4. Body dates in YYYY-MM-DD reformat to "DD MMM YYYY".
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form4MinimalistTemplate } from '@/components/ui/email/templates/form4-minimalist-template';
import { formatDatesInText } from '@/components/ui/email/design-system';
import { FilingTemplateData } from '@/lib/email/types';

function createFilingData(overrides: Partial<FilingTemplateData> = {}): FilingTemplateData {
  return {
    companyName: 'Test Corp',
    symbol: 'TEST',
    filingType: 'Form 4',
    filingDate: '2026-04-20',
    filingUrl: 'https://sec.gov/test',
    ...overrides,
  };
}

describe('Form 4 summary styling refresh', () => {
  describe('Transaction value row color', () => {
    it('renders transaction value text in near-black (#111827), not config color (e.g. #DC2626)', () => {
      const filing = createFilingData({
        summaryData: {
          transactions: [
            { type: 'Sale', shares: '10000', pricePerShare: '150.00', code: 'S' },
          ],
        },
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      // The data value cells use text-align: right (from EmailStyles.dataValue).
      // Find the value cell matching the sale amount.
      const cells = Array.from(container.querySelectorAll('td'));
      const valueCell = cells.find((td) => {
        const style = td.getAttribute('style') || '';
        return /text-align:\s*right/i.test(style) &&
               /\$[\d.]+[KMB]?\s*\(/.test(td.textContent || '');
      });
      expect(valueCell).toBeDefined();
      // Inline color should be near-black, not the sale red
      expect(valueCell!.getAttribute('style')).toMatch(/color:\s*(rgb\(17,\s*24,\s*39\)|#111827)/i);
      expect(valueCell!.getAttribute('style')).not.toMatch(/#DC2626|rgb\(220,\s*38,\s*38\)/i);
    });
  });

  describe('Holdings row segmentation', () => {
    it('renders pre-stake in muted gray (#6B7280) and arrow pointing right', () => {
      const filing = createFilingData({
        summaryData: {
          transactions: [{ type: 'Sale', shares: '5000', pricePerShare: '100.00' }],
          previousStake: '50,000 shares',
          newStake: '45,000 shares',
          percentageChange: '-10%',
        },
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      // Pre-stake span exists with gray color
      const graySpan = Array.from(container.querySelectorAll('span')).find(
        (s) => s.textContent === '50,000 shares' &&
               /color:\s*(rgb\(107,\s*114,\s*128\)|#6B7280)/i.test(s.getAttribute('style') || '')
      );
      expect(graySpan).toBeDefined();

      // Arrow always points right (wrapped in NBSPs for Outlook Word renderer compatibility)
      const arrowSpan = Array.from(container.querySelectorAll('span')).find(
        (s) => s.textContent != null && /→/.test(s.textContent) && s.children.length === 0
      );
      expect(arrowSpan).toBeDefined();
    });

    it('renders (% change) in red when negative', () => {
      const filing = createFilingData({
        summaryData: {
          transactions: [{ type: 'Sale', shares: '5000', pricePerShare: '100.00' }],
          previousStake: '50,000 shares',
          newStake: '45,000 shares',
          percentageChange: '-10%',
        },
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);
      // Match the *innermost* span equal to "(-10.00%)" exactly. The normalizer
      // recomputes percentageChange from previousStake/newStake to 2dp, so the
      // LLM-supplied "-10%" string is overridden.
      const pctSpan = Array.from(container.querySelectorAll('span')).find(
        (s) => s.textContent === '(-10.00%)' && s.children.length === 0
      );
      expect(pctSpan).toBeDefined();
      expect(pctSpan!.getAttribute('style')).toMatch(/color:\s*(rgb\(220,\s*38,\s*38\)|#DC2626)/i);
    });

    it('renders (% change) in green when positive', () => {
      const filing = createFilingData({
        summaryData: {
          transactions: [{ type: 'Purchase', shares: '5000', pricePerShare: '100.00' }],
          previousStake: '40,000 shares',
          newStake: '45,000 shares',
          percentageChange: '12.5%',
        },
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);
      // 40,000 → 45,000 = +12.50% (recomputed from stakes to 2dp).
      const pctSpan = Array.from(container.querySelectorAll('span')).find(
        (s) => /^\(\+?12\.50%\)$/.test(s.textContent || '') && s.children.length === 0
      );
      expect(pctSpan).toBeDefined();
      // #15803D (WCAG AA-compliant green) replaces the prior #16A34A which failed AA on small text.
      expect(pctSpan!.getAttribute('style')).toMatch(/color:\s*(rgb\(21,\s*128,\s*61\)|#15803D)/i);
    });

    it('omits the (% change) parenthetical when percentage is zero', () => {
      const filing = createFilingData({
        summaryData: {
          transactions: [{ type: 'Transfer', shares: '0', pricePerShare: '0' }],
          previousStake: '50,000 shares',
          newStake: '50,000 shares',
          percentageChange: '0%',
        },
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);
      // No (0%) anywhere
      expect(container.textContent).not.toMatch(/\(0%\)/);
      // Arrow still rendered
      expect(container.textContent).toContain('→');
    });
  });

  describe('Date reformatting in body copy', () => {
    it('reformats YYYY-MM-DD dates to "DD MMM YYYY" in summary text', () => {
      const filing = createFilingData({
        summaryText: 'Filed on 2026-04-20 for the prior period.',
        summaryData: { headline: 'Insider sold on 2026-04-20.' },
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);
      const text = container.textContent || '';

      expect(text).toContain('20 Apr 2026');
      expect(text).not.toContain('2026-04-20');
    });
  });
});

describe('formatDatesInText helper', () => {
  it('reformats a single ISO date', () => {
    expect(formatDatesInText('Filed on 2026-04-20.')).toBe('Filed on 20 Apr 2026.');
  });

  it('reformats multiple ISO dates', () => {
    expect(formatDatesInText('From 2025-01-05 to 2026-12-31.')).toBe(
      'From 05 Jan 2025 to 31 Dec 2026.'
    );
  });

  it('does not match non-date numeric strings', () => {
    expect(formatDatesInText('Phone 555-12-3456 is fine.')).toBe('Phone 555-12-3456 is fine.');
  });

  it('does not match invalid month/day values', () => {
    expect(formatDatesInText('Bogus 2026-13-40 here.')).toBe('Bogus 2026-13-40 here.');
  });

  it('does not match calendar-invalid dates (Feb 30, Apr 31)', () => {
    expect(formatDatesInText('Skip 2025-02-30 and 2026-04-31 please.')).toBe(
      'Skip 2025-02-30 and 2026-04-31 please.'
    );
  });

  it('leaves hyphenated identifiers like ID-2026-04-20-001 untouched', () => {
    expect(formatDatesInText('Ref ID-2026-04-20-001 in log.')).toBe('Ref ID-2026-04-20-001 in log.');
  });

  it('returns empty string for undefined input', () => {
    expect(formatDatesInText(undefined)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(formatDatesInText('')).toBe('');
  });
});
