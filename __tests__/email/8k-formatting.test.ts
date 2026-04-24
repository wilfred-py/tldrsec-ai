import { formatText } from '@/components/ui/email/templates/8k-minimalist-template';

describe('8-K Formatting Consistency', () => {
  describe('Bold weight consistency', () => {
    it('should use consistent font-weight for dollar amounts', () => {
      const result = formatText('Revenue of $150M');
      expect(result).toContain('font-weight:600');
      expect(result).not.toContain('font-weight:700');
    });

    it('should use consistent font-weight for percentages', () => {
      const result = formatText('Up 25% YoY');
      expect(result).toContain('font-weight:600');
      expect(result).not.toContain('font-weight:700');
    });
  });

  describe('Bullet point handling', () => {
    it('should not produce double bullets when text starts with bullet character', () => {
      const result = formatText('• Revenue increased 25%');
      const bulletCount = (result.match(/•/g) || []).length;
      expect(bulletCount).toBeLessThanOrEqual(1);
    });

    it('should strip leading bullet/dash from highlight text', () => {
      const result = formatText('- Revenue increased 25%');
      expect(result).not.toMatch(/^[\s]*[-•*]/);
    });
  });

  /**
   * Post-restructure body-content regression — the redundant "Event" and
   * "Filed" data rows were removed from the 8-K body snapshot because the
   * form-badge row + lead-header ticker line already convey that info. If
   * anyone re-adds those rows during a refactor, this block fails loudly.
   */
  describe('redundant body rows removed (Event / Filed)', () => {
    // Dynamic require so the pure-logic tests above stay cheap when run alone.
    const React = require('react') as typeof import('react');
    const { render } = require('@testing-library/react') as typeof import('@testing-library/react');
    const { Form8KMinimalistTemplate } = require(
      '@/components/ui/email/templates/8k-minimalist-template',
    ) as typeof import('@/components/ui/email/templates/8k-minimalist-template');

    it('does not render a left-aligned "Event" or "Filed" data-row label', () => {
      const { container } = render(
        React.createElement(Form8KMinimalistTemplate, {
          filing: {
            companyName: 'Apple Inc.',
            symbol: 'AAPL',
            filingType: '8-K',
            filingDate: '2026-01-15',
            filingUrl: 'https://sec.gov',
            summaryText: '8-K summary.',
            summaryData: {
              headline: 'AAPL announces $90B buyback',
              eventType: 'Capital Return',
              itemNumbers: ['1.01'],
            },
          } as never,
        }),
      );
      // The old layout rendered these as explicit data-row labels in a left
      // <td>. Any <td> whose trimmed text is literally "Event" or "Filed"
      // means the deleted rows crept back in.
      const offendingCells = Array.from(container.querySelectorAll('td')).filter((td) => {
        const t = td.textContent?.trim();
        return t === 'Event' || t === 'Filed';
      });
      expect(offendingCells).toHaveLength(0);
    });
  });
});
