/**
 * Tests for DEF 14A (Proxy Statement) Data Extractor
 *
 * DEF 14A is the definitive proxy statement filed before shareholder meetings.
 * Key data includes meeting date, executive compensation, board proposals, and shareholder proposals.
 */

import { extractDEF14AData, FormDEF14AExtractedData } from '@/lib/email/def14a-data-extractor';

describe('extractDEF14AData', () => {
  const sampleMarkdownText = `
    **Meeting Date**: 2026-05-15
    **Meeting Type**: Annual Meeting
    **Record Date**: 2026-03-20
    **CEO Pay Ratio**: 287:1

    ## Executive Compensation
    | Name | Title | Total Compensation |
    |------|-------|-------------------|
    | John Smith | CEO | $15.2M |
    | Jane Doe | CFO | $8.5M |
    | Bob Wilson | COO | $7.8M |

    ## Board Proposals
    1. Election of Directors - Board recommends FOR
    2. Ratification of Auditor (PwC) - Board recommends FOR
    3. Say-on-Pay Advisory Vote - Board recommends FOR
    4. Approve 2026 Equity Incentive Plan - Board recommends FOR

    ## Shareholder Proposals
    5. Report on Climate Risk - Board recommends AGAINST
    6. Independent Board Chair - Board recommends AGAINST

    ## Director Nominees
    - John Smith (Independent, 5 years)
    - Mary Johnson (Independent, 3 years)
    - Robert Chen (Non-Independent, 8 years)
  `;

  const sampleProseText = `
    TechCorp is holding its Annual Meeting of Shareholders on May 15, 2026. Shareholders
    of record as of March 20, 2026 are entitled to vote.

    CEO John Smith received total compensation of $15.2 million, reflecting the company's
    strong performance. The CEO to median employee pay ratio is 287 to 1. CFO Jane Doe
    received $8.5 million.

    The board is recommending shareholders vote FOR the election of 9 directors, FOR
    ratification of PricewaterhouseCoopers as independent auditor, and FOR the advisory
    vote on executive compensation (say-on-pay).

    Two shareholder proposals have been submitted: one requesting a report on climate risk
    (Board recommends AGAINST) and one requesting an independent board chair (Board recommends
    AGAINST).

    Audit fees paid to PwC totaled $4.2 million for fiscal 2025.
  `;

  describe('Markdown format extraction', () => {
    it('should extract meetingDate', () => {
      const result = extractDEF14AData(sampleMarkdownText);
      expect(result.meetingDate).toBe('2026-05-15');
    });

    it('should extract meetingType', () => {
      const result = extractDEF14AData(sampleMarkdownText);
      expect(result.meetingType).toBe('Annual Meeting');
    });

    it('should extract recordDate', () => {
      const result = extractDEF14AData(sampleMarkdownText);
      expect(result.recordDate).toBe('2026-03-20');
    });

    it('should extract ceoPayRatio', () => {
      const result = extractDEF14AData(sampleMarkdownText);
      expect(result.ceoPayRatio).toBe('287:1');
    });

    it('should extract executiveCompensation', () => {
      const result = extractDEF14AData(sampleMarkdownText);
      expect(result.executiveCompensation.length).toBeGreaterThanOrEqual(1);
      expect(result.executiveCompensation.some(e => e.name === 'John Smith')).toBe(true);
      expect(result.executiveCompensation.some(e => e.totalCompensation === '$15.2M')).toBe(true);
    });

    it('should extract boardProposals', () => {
      const result = extractDEF14AData(sampleMarkdownText);
      expect(result.boardProposals.length).toBeGreaterThanOrEqual(2);
      expect(result.boardProposals.some(p => p.description.includes('Director') || p.description.includes('Election'))).toBe(true);
    });

    it('should extract shareholderProposals', () => {
      const result = extractDEF14AData(sampleMarkdownText);
      expect(result.shareholderProposals.length).toBeGreaterThanOrEqual(1);
      expect(result.shareholderProposals.some(p => p.description.includes('Climate'))).toBe(true);
    });

    it('should extract directorNominees', () => {
      const result = extractDEF14AData(sampleMarkdownText);
      expect(result.directorNominees.length).toBeGreaterThanOrEqual(1);
      expect(result.directorNominees.some(d => d.name.includes('John'))).toBe(true);
    });
  });

  describe('Prose format extraction', () => {
    it('should extract meetingDate from prose', () => {
      const result = extractDEF14AData(sampleProseText);
      expect(result.meetingDate).toBe('2026-05-15');
    });

    it('should extract ceoPayRatio from prose', () => {
      const result = extractDEF14AData(sampleProseText);
      expect(result.ceoPayRatio).toBe('287:1');
    });

    it('should extract executiveCompensation from prose', () => {
      const result = extractDEF14AData(sampleProseText);
      expect(result.executiveCompensation.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extractDEF14AData('');
      expect(result.meetingDate).toBeUndefined();
      expect(result.executiveCompensation).toEqual([]);
      expect(result.boardProposals).toEqual([]);
    });

    it('should handle malformed input without crashing', () => {
      const result = extractDEF14AData('Random text about meetings');
      expect(result).toBeDefined();
      expect(result.executiveCompensation).toEqual([]);
    });

    it('should handle special meeting', () => {
      const text = 'Special Meeting scheduled for August 10, 2026 to vote on merger.';
      const result = extractDEF14AData(text);
      expect(result.meetingType?.toLowerCase()).toContain('special');
    });
  });
});
