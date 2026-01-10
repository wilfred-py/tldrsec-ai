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
      // Should also display the code description
      expect(container.textContent).toMatch(/Open Market Sale|Sale/i);
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

    it('should display stake change with arrow indicators', () => {
      const filing = createFilingData({
        filingType: 'Form 4',
        summaryData: {
          previousStake: '500,000',
          newStake: '490,000',
          percentageChange: '-2.0%'
        }
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      // Should display downward arrow for decrease
      expect(container.textContent).toContain('↓');
      // Should display the percentage change
      expect(container.textContent).toContain('2.0%');
    });

    it('should display upward arrow for stake increase', () => {
      const filing = createFilingData({
        filingType: 'Form 4',
        summaryData: {
          previousStake: '500,000',
          newStake: '550,000',
          percentageChange: '+10.0%'
        }
      });

      const { container } = render(<Form4MinimalistTemplate filing={filing} />);

      // Should display upward arrow for increase
      expect(container.textContent).toContain('↑');
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

      // Should display the financial impact value
      expect(container.textContent).toContain('$2.5B');
      // Should have a financial impact section
      expect(container.textContent).toMatch(/Financial Impact/i);
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
