import {
  getAnalysisDepthScore,
  ANALYSIS_DEPTH_BONUSES,
  ANALYSIS_DEPTH_TEXT_THRESHOLD,
} from '@/lib/onboarding/analysis-depth';

describe('getAnalysisDepthScore', () => {
  const baseInput = {
    summaryJSON: null,
    summaryText: null,
    smartSubject: null,
  };

  describe('null and malformed inputs return 0', () => {
    it('null summaryJSON + null fields → 0', () => {
      expect(getAnalysisDepthScore(baseInput)).toBe(0);
    });

    it('summaryJSON as array (not object) → ignored, no JSON bonuses', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: ['not', 'an', 'object'],
        })
      ).toBe(0);
    });

    it('summaryJSON as primitive string → ignored', () => {
      expect(
        getAnalysisDepthScore({ ...baseInput, summaryJSON: 'not an object' })
      ).toBe(0);
    });

    it('summaryJSON as number → ignored', () => {
      expect(getAnalysisDepthScore({ ...baseInput, summaryJSON: 42 })).toBe(0);
    });

    it('financials with wrong type (not array) → ignored', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { financials: 'not an array' },
        })
      ).toBe(0);
    });

    it('xSentiment with wrong direction value → no xSentiment bonus', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { xSentiment: { direction: 'unknown_value' } },
        })
      ).toBe(0);
    });
  });

  describe('individual signals fire correctly', () => {
    it('xSentiment with valid direction → +xSentiment', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { xSentiment: { direction: 'bullish' } },
        })
      ).toBe(ANALYSIS_DEPTH_BONUSES.xSentiment);
    });

    it('xSentiment.direction = no_signal still counts (it ran)', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { xSentiment: { direction: 'no_signal' } },
        })
      ).toBe(ANALYSIS_DEPTH_BONUSES.xSentiment);
    });

    it('non-empty financials array → +financials', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { financials: [{ label: 'Revenue', value: '$100M' }] },
        })
      ).toBe(ANALYSIS_DEPTH_BONUSES.financials);
    });

    it('empty financials array → no bonus', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { financials: [] },
        })
      ).toBe(0);
    });

    it('dealTerms object → +dealTermsOrTranches', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { dealTerms: { counterparty: 'Acme' } },
        })
      ).toBe(ANALYSIS_DEPTH_BONUSES.dealTermsOrTranches);
    });

    it('tranches array → +dealTermsOrTranches', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { tranches: [{ amountDisplay: '$1B', currency: 'USD' }] },
        })
      ).toBe(ANALYSIS_DEPTH_BONUSES.dealTermsOrTranches);
    });

    it('both dealTerms AND tranches → only one bonus (not stacked)', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: {
            dealTerms: { counterparty: 'Acme' },
            tranches: [{ amountDisplay: '$1B', currency: 'USD' }],
          },
        })
      ).toBe(ANALYSIS_DEPTH_BONUSES.dealTermsOrTranches);
    });

    it('non-empty transactions array → +transactions', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: {
            transactions: [{ shares: 100, code: 'P' }],
          },
        })
      ).toBe(ANALYSIS_DEPTH_BONUSES.transactions);
    });

    it('smartSubject string → +smartSubject (independent of summaryJSON)', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          smartSubject: 'NVDA beat by $0.20',
        })
      ).toBe(ANALYSIS_DEPTH_BONUSES.smartSubject);
    });

    it('empty smartSubject string → no bonus', () => {
      expect(
        getAnalysisDepthScore({ ...baseInput, smartSubject: '' })
      ).toBe(0);
    });

    it('summaryText > threshold → +longSummaryText', () => {
      const longText = 'x'.repeat(ANALYSIS_DEPTH_TEXT_THRESHOLD + 1);
      expect(
        getAnalysisDepthScore({ ...baseInput, summaryText: longText })
      ).toBe(ANALYSIS_DEPTH_BONUSES.longSummaryText);
    });

    it('summaryText exactly at threshold → no bonus (strict >)', () => {
      const atThreshold = 'x'.repeat(ANALYSIS_DEPTH_TEXT_THRESHOLD);
      expect(
        getAnalysisDepthScore({ ...baseInput, summaryText: atThreshold })
      ).toBe(0);
    });

    it('summaryText one over threshold → bonus fires', () => {
      const overThreshold = 'x'.repeat(ANALYSIS_DEPTH_TEXT_THRESHOLD + 1);
      expect(
        getAnalysisDepthScore({ ...baseInput, summaryText: overThreshold })
      ).toBe(ANALYSIS_DEPTH_BONUSES.longSummaryText);
    });
  });

  describe('cap at 100', () => {
    it('all signals firing → exactly 100 (sum is 25+20+20+15+10+10 = 100)', () => {
      expect(
        getAnalysisDepthScore({
          summaryJSON: {
            xSentiment: { direction: 'bullish' },
            financials: [{ label: 'r' }],
            dealTerms: { counterparty: 'X' },
            tranches: [{ amountDisplay: '$1' }],
            transactions: [{ shares: 1 }],
          },
          summaryText: 'x'.repeat(ANALYSIS_DEPTH_TEXT_THRESHOLD + 1),
          smartSubject: 'subject',
        })
      ).toBe(100);
    });
  });

  describe('combinations and ordering', () => {
    it('smartSubject + financials but no xSentiment → sum of those two', () => {
      expect(
        getAnalysisDepthScore({
          ...baseInput,
          summaryJSON: { financials: [{ label: 'r' }] },
          smartSubject: 'subject',
        })
      ).toBe(
        ANALYSIS_DEPTH_BONUSES.financials + ANALYSIS_DEPTH_BONUSES.smartSubject
      );
    });

    it('order of fields in summaryJSON does not affect score', () => {
      const a = getAnalysisDepthScore({
        ...baseInput,
        summaryJSON: {
          xSentiment: { direction: 'bullish' },
          financials: [{ label: 'r' }],
        },
      });
      const b = getAnalysisDepthScore({
        ...baseInput,
        summaryJSON: {
          financials: [{ label: 'r' }],
          xSentiment: { direction: 'bullish' },
        },
      });
      expect(a).toBe(b);
    });
  });
});
