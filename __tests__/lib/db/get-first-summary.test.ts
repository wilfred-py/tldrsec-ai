/**
 * Tests for getFirstSummary — the post-onboarding hero card data loader.
 *
 * The interface is the test surface: we override the shared prisma mock and
 * assert on the FirstSummaryHeroSummary the function returns. Headline
 * derivation is private implementation; we observe it through `result.headline`.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// react cache() is a passthrough in test (no per-render dedupe needed). The
// global shared prisma mock from __tests__/setup.js does not declare
// `summary.findUnique`; we attach it before importing the SUT.
jest.mock('react', () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

import { getPrismaClient } from '@/lib/db/prisma';
import { getFirstSummary } from '@/lib/db/get-first-summary';

const prisma = getPrismaClient() as unknown as {
  summary: { findUnique: jest.Mock };
};
prisma.summary.findUnique = jest.fn();

const baseRow = {
  id: 'summary-1',
  filingType: '10-K',
  filingDate: new Date('2026-04-01T00:00:00Z'),
  summaryText: '',
  importance: 'high',
  ticker: { symbol: 'NVDA', companyName: 'NVIDIA Corp' },
};

describe('getFirstSummary', () => {
  beforeEach(() => {
    prisma.summary.findUnique.mockReset();
  });

  it('returns null when summaryId is null', async () => {
    const result = await getFirstSummary(null);
    expect(result).toBeNull();
    expect(prisma.summary.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when prisma finds no row', async () => {
    prisma.summary.findUnique.mockResolvedValueOnce(null);
    expect(await getFirstSummary('missing')).toBeNull();
  });

  it('returns null and logs when prisma throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    prisma.summary.findUnique.mockRejectedValueOnce(new Error('db down'));
    expect(await getFirstSummary('any')).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('serializes filingDate to ISO and surfaces ticker fields', async () => {
    prisma.summary.findUnique.mockResolvedValueOnce({
      ...baseRow,
      summaryText: 'Apple beat earnings.',
    });
    const result = await getFirstSummary('summary-1');
    expect(result).toEqual({
      id: 'summary-1',
      ticker: 'NVDA',
      companyName: 'NVIDIA Corp',
      filingType: '10-K',
      filingDate: '2026-04-01T00:00:00.000Z',
      headline: 'Apple beat earnings.',
      importance: 'high',
    });
  });

  describe('headline derivation', () => {
    async function headlineFor(summaryText: string): Promise<string> {
      prisma.summary.findUnique.mockResolvedValueOnce({ ...baseRow, summaryText });
      const result = await getFirstSummary('summary-1');
      return result!.headline;
    }

    it('strips a single leading #', async () => {
      expect(await headlineFor('# Apple beat earnings.')).toBe('Apple beat earnings.');
    });

    it('strips multiple leading ###', async () => {
      expect(await headlineFor('### Apple beat earnings.')).toBe('Apple beat earnings.');
    });

    it('takes the first sentence (terminated by ., !, ?)', async () => {
      expect(await headlineFor('Apple beat earnings. Revenue up 12%.')).toBe('Apple beat earnings.');
      expect(await headlineFor('Apple beat! Big quarter.')).toBe('Apple beat!');
      expect(await headlineFor('Apple turning a corner? Reasons follow.')).toBe(
        'Apple turning a corner?'
      );
    });

    it('returns whole text when there is no sentence terminator', async () => {
      expect(await headlineFor('A summary without punctuation')).toBe(
        'A summary without punctuation'
      );
    });

    it('truncates with an ellipsis at the 200-char cap', async () => {
      const long = 'x'.repeat(300);
      const result = await headlineFor(long);
      expect(result.length).toBe(200);
      expect(result.endsWith('…')).toBe(true);
    });

    it('does not truncate when length === 200', async () => {
      const exactly200 = 'x'.repeat(200);
      expect(await headlineFor(exactly200)).toBe(exactly200);
    });

    it('combines heading-strip, first-sentence, and truncation', async () => {
      const long = '### NVIDIA Corp (NVDA) 10-Q Analysis. ' + 'x'.repeat(300);
      const result = await headlineFor(long);
      expect(result.startsWith('NVIDIA Corp (NVDA) 10-Q Analysis.')).toBe(true);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('handles empty summaryText', async () => {
      expect(await headlineFor('')).toBe('');
    });

    it('handles input that is only a heading marker', async () => {
      expect(await headlineFor('###')).toBe('');
    });
  });
});
