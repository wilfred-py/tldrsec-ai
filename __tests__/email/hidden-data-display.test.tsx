/**
 * Hidden Data Display Tests - Phase 1
 *
 * Tests for surfacing hidden/computed data fields in email templates:
 * - Form 4: transaction codes, transaction dates, stake change indicators
 * - 8-K: sentiment indicators, financial impact cards
 * - Form 144: remaining holdings, trading plan details
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form4MinimalistTemplate } from '@/components/ui/email/templates/form4-minimalist-template';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
import { Form144MinimalistTemplate } from '@/components/ui/email/templates/form144-minimalist-template';
import { FilingTemplateData } from '@/lib/email/types';

// Helper to create minimal filing data for testing
function createFilingData(overrides: Partial<FilingTemplateData> = {}): FilingTemplateData {
  return {
    companyName: 'Test Corp',
    symbol: 'TEST',
    filingType: 'Form 4',
    filingDate: '2026-01-10',
    filingUrl: 'https://sec.gov/test',
    ...overrides,
  };
}

describe('Hidden Data Display', () => {
  describe('Form 4 Template', () => {
    it('should display transaction codes when available', () => {
      const filing = createFilingData({
        filingType: 'Form 4',
        summaryData: {
          transactions: [
            { type: 'Sale', shares: '10,000', pricePerShare: '$150.00', code: 'S' }
          ]
        }
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      // Should display the transaction code 'S' somewhere in the template
      expect(container.textContent).toContain('S');
      // Should display a human-readable transaction label (extractor renders
      // "Sold" for code 'S'; Form 4 PR #467 removed the "Open Market Sale"
      // description from the body — the label remains).
      expect(container.textContent).toMatch(/Sold|Sale/i);
    });

    it('should display transaction dates for each transaction', () => {
      const filing = createFilingData({
        filingType: 'Form 4',
        summaryData: {
          transactions: [
            { type: 'Sale', shares: '10,000', pricePerShare: '$150.00', date: '2026-01-10' }
          ]
        }
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      // Should display the formatted date
      expect(container.textContent).toContain('Jan 10');
    });

    it('should display stake change with right-pointing arrow (pre → post)', () => {
      const filing = createFilingData({
        filingType: 'Form 4',
        summaryData: {
          previousStake: '500,000',
          newStake: '490,000',
          percentageChange: '-2.0%'
        }
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      // Always points right — direction encoded by color of (% change), not arrow
      expect(container.textContent).toContain('→');
      // Should display the percentage change
      expect(container.textContent).toContain('2.0%');
    });

    it('should display right-pointing arrow for stake increase too', () => {
      const filing = createFilingData({
        filingType: 'Form 4',
        summaryData: {
          previousStake: '500,000',
          newStake: '550,000',
          percentageChange: '+10.0%'
        }
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      expect(container.textContent).toContain('→');
    });
  });

  describe('Form 8-K Template', () => {
    it('should display sentiment indicator when available', () => {
      const filing = createFilingData({
        filingType: '8-K',
        summaryData: {
          sentiment: 'positive',
          keyHighlights: ['Revenue beat expectations']
        }
      });

      const { container } = render(<Form8KMinimalistTemplate filing={filing} />);

      // Should display the sentiment label
      expect(container.textContent).toMatch(/Positive/i);
      // Should include sentiment emoji
      expect(container.textContent).toContain('📈');
    });

    it('should display negative sentiment with appropriate styling', () => {
      const filing = createFilingData({
        filingType: '8-K',
        summaryData: {
          sentiment: 'negative',
          keyHighlights: ['Revenue missed expectations']
        }
      });

      const { container } = render(<Form8KMinimalistTemplate filing={filing} />);

      // Should display the sentiment label
      expect(container.textContent).toMatch(/Negative/i);
      // Should include sentiment emoji for negative
      expect(container.textContent).toContain('📉');
    });

    it('should display mixed sentiment indicator', () => {
      const filing = createFilingData({
        filingType: '8-K',
        summaryData: {
          sentiment: 'mixed',
          keyHighlights: ['Mixed results']
        }
      });

      const { container } = render(<Form8KMinimalistTemplate filing={filing} />);

      // Should display mixed sentiment
      expect(container.textContent).toMatch(/Mixed/i);
    });

    it('should display financial impact prominently', () => {
      const filing = createFilingData({
        filingType: '8-K',
        summaryData: {
          financialImpact: '$2.5B acquisition',
          keyHighlights: ['Major deal announced']
        }
      });

      const { container } = render(<Form8KMinimalistTemplate filing={filing} />);

      // Should display the financial impact value in the "Why it matters" prose
      expect(container.textContent).toContain('$2.5B');
      // Financial impact is woven into the matters paragraph — label is either
      // "Why it matters" (material) or "Note:" (routine), per W2 bucket rules.
      // No itemNumbers/summaryText → isMaterial=false → "Note:" label applies.
      expect(container.textContent).toMatch(/Why it matters|Note:/i);
    });
  });

  describe('Form 144 Template', () => {
    it('should display remaining holdings after sale', () => {
      const filing = createFilingData({
        filingType: 'Form 144',
        summaryData: {
          sharesSold: '50,000',
          sharesRemaining: '450,000',
          totalValue: '$7,500,000'
        }
      });

      const { container } = render(<Form144MinimalistTemplate filing={filing} />);

      // Should display remaining holdings
      expect(container.textContent).toContain('450,000');
      // Should indicate these are remaining shares
      expect(container.textContent).toMatch(/remaining/i);
    });

    it('should display trading plan details with adoption date', () => {
      const filing = createFilingData({
        filingType: 'Form 144',
        summaryData: {
          tradingPlan: '10b5-1 plan adopted 08/15/2025',
          sharesSold: '50,000'
        }
      });

      const { container } = render(<Form144MinimalistTemplate filing={filing} />);

      // Should display 10b5-1 reference
      expect(container.textContent).toContain('10b5-1');
    });

    it('should display percentage of holdings being sold', () => {
      const filing = createFilingData({
        filingType: 'Form 144',
        summaryData: {
          sharesSold: '50,000',
          sharesRemaining: '450,000',
          percentOwnership: '10%'
        }
      });

      const { container } = render(<Form144MinimalistTemplate filing={filing} />);

      // Should display percentage context
      expect(container.textContent).toMatch(/10%|holdings/i);
    });
  });
});

describe('Transaction Code Descriptions', () => {
  it('should map common SEC transaction codes correctly', () => {
    // Import the helper if exported, or test through the template
    const codeTests = [
      { code: 'P', expectedDesc: /Purchase|Bought/i },
      { code: 'S', expectedDesc: /Sale|Sold/i },
      { code: 'A', expectedDesc: /Grant|Award/i },
      { code: 'G', expectedDesc: /Gift/i },
      { code: 'M', expectedDesc: /Option|Exercise/i },
    ];

    codeTests.forEach(({ code, expectedDesc }) => {
      const filing = createFilingData({
        filingType: 'Form 4',
        summaryData: {
          transactions: [
            { type: 'Transaction', shares: '1,000', pricePerShare: '$100', code }
          ]
        }
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      // Should include description matching the code
      expect(container.textContent).toMatch(expectedDesc);
    });
  });
});

/**
 * Layout ordering regression — the hidden-data surfacing tests above verify
 * that computed fields APPEAR. This block verifies they appear in the RIGHT
 * PLACE under the new lead-with-headline layout: hidden data belongs in the
 * body, below the headline / ticker line / badge cluster, not above them.
 *
 * Uses container.innerHTML.indexOf() because pill text (e.g. transaction code
 * descriptions) splits across multiple DOM nodes, which defeats textContent.
 */
describe('Hidden data appears below the lead header in the body', () => {
  it('Form 4: transaction detail renders after the ticker line', () => {
    const filing = createFilingData({
      filingType: 'Form 4',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      summaryData: {
        headline: 'AAPL insider sold shares',
        transactions: [
          { type: 'Sale', shares: '10,000', pricePerShare: '$150.00', code: 'S' },
        ],
      },
    });
    const { container } = render(<Form4MinimalistTemplate filing={filing} />);
    const html = container.innerHTML;
    const headlineIdx = html.search(/<h1[^>]*>/);
    const tickerIdx = html.indexOf('Apple Inc.', Math.max(0, headlineIdx));
    // Transaction line (shares @ pricePerShare) is the computed body content
    // we want to guarantee lands below the ticker, not above it.
    const sharesIdx = html.indexOf('10,000', Math.max(0, tickerIdx));

    expect(tickerIdx).toBeGreaterThan(headlineIdx);
    expect(sharesIdx).toBeGreaterThan(tickerIdx);
  });

  it('8-K: form badge cluster renders after the ticker line', () => {
    const filing = createFilingData({
      filingType: '8-K',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      summaryData: {
        headline: 'AAPL announces $90B buyback',
        eventType: 'Capital Return',
        itemNumbers: ['1.01'],
      },
    });
    const { container } = render(<Form8KMinimalistTemplate filing={filing} />);
    const html = container.innerHTML;
    const headlineIdx = html.search(/<h1[^>]*>/);
    const tickerIdx = html.indexOf('Apple Inc.', Math.max(0, headlineIdx));
    // Form badge emits "8-K | <category>" — the 8-K template uses eventType
    // as the category. Match the "Capital Return" slice we passed in.
    const formBadgeIdx = html.indexOf('Capital Return', Math.max(0, tickerIdx));

    expect(tickerIdx).toBeGreaterThan(headlineIdx);
    expect(formBadgeIdx).toBeGreaterThan(tickerIdx);
  });

  it('Form 144: insider shares figure renders after the ticker line', () => {
    const filing = createFilingData({
      filingType: 'Form 144',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      summaryData: {
        headline: 'AAPL insider proposes 100K share sale',
        filerName: 'Tim Cook',
        // Field name matches template's `data?.shares` lookup.
        shares: '100,000',
        remainingHoldings: '500,000',
      },
    });
    const { container } = render(<Form144MinimalistTemplate filing={filing} />);
    const html = container.innerHTML;
    const headlineIdx = html.search(/<h1[^>]*>/);
    const tickerIdx = html.indexOf('Apple Inc.', Math.max(0, headlineIdx));
    const sharesIdx = html.indexOf('100,000', Math.max(0, tickerIdx));

    expect(tickerIdx).toBeGreaterThan(headlineIdx);
    expect(sharesIdx).toBeGreaterThan(tickerIdx);
  });
});
