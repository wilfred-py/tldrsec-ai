import { getPrismaClient } from '@/lib/db/prisma';

export interface SummaryPreview {
  accessionNumber: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: Date;
  secUrl: string;
  previewText: string;
  createdAt: Date;
}

/**
 * Fetch preview data for a single SEC filing by accession number.
 *
 * Keys on SecFiling (filing-scoped) rather than Summary (user-scoped through Ticker)
 * to avoid creating duplicate public pages for the same filing tracked by multiple users.
 * Selects the best available summary by quality score, then recency.
 */
export async function getSummaryPreview(
  accessionNumber: string
): Promise<SummaryPreview | null> {
  const prisma = getPrismaClient();

  const filing = await prisma.secFiling.findFirst({
    where: { accessionNumber },
    select: {
      id: true,
      formType: true,
      filingDate: true,
      secUrl: true,
      companyName: true,
      cik: true,
      accessionNumber: true,
      ticker: { select: { symbol: true, companyName: true } },
      summaries: {
        where: {
          processingStatus: 'completed',
          summaryText: { not: '' },
        },
        orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: {
          summaryText: true,
          filingType: true,
          filingDate: true,
          createdAt: true,
        },
      },
    },
  });

  if (!filing || filing.summaries.length === 0) return null;

  const summary = filing.summaries[0];
  const companyName = filing.companyName || filing.ticker.companyName;

  return {
    accessionNumber: filing.accessionNumber,
    ticker: filing.ticker.symbol,
    companyName,
    filingType: summary.filingType,
    filingDate: summary.filingDate,
    secUrl: filing.secUrl,
    previewText: truncateToWords(summary.summaryText, 75),
    createdAt: summary.createdAt,
  };
}

/**
 * List recent filings for sitemap generation.
 * Deduplicates by accession number and caps at `limit` entries.
 * Only includes filings with at least one completed, non-empty summary.
 */
export async function getRecentFilingsForSitemap(limit = 500) {
  const prisma = getPrismaClient();

  const filings = await prisma.secFiling.findMany({
    where: {
      summaries: {
        some: {
          processingStatus: 'completed',
          summaryText: { not: '' },
        },
      },
    },
    orderBy: { filingDate: 'desc' },
    take: limit,
    select: {
      accessionNumber: true,
      formType: true,
      filingDate: true,
      createdAt: true,
      ticker: { select: { symbol: true } },
    },
    distinct: ['accessionNumber'],
  });

  return filings;
}

/**
 * Truncate text to approximately N words, preferring sentence boundaries.
 */
function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;

  const truncated = words.slice(0, maxWords).join(' ');

  // Try to end at a sentence boundary for cleaner reads
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > truncated.length * 0.6) {
    return truncated.substring(0, lastPeriod + 1);
  }

  return truncated + '...';
}
