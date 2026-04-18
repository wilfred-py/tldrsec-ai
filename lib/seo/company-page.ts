import { getPrismaClient } from '@/lib/db/prisma';
import { COMPANIES, getCompanyMeta, type CompanyMeta } from './company-metadata';

/**
 * Company hub page data layer.
 *
 * IMPORTANT: `Ticker` is user-scoped (@@unique([userId, symbol])). If five users
 * track NVDA, there are five `Ticker` rows. Never query by Ticker alone — always
 * query `SecFiling` with `distinct: ['accessionNumber']` to dedupe filings across
 * users tracking the same company.
 *
 * Mirrors the pattern in lib/seo/summary-preview.ts:getRecentFilingsForSitemap.
 */

export interface CompanyFilingPreview {
  accessionNumber: string;
  formType: string;
  filingDate: Date;
  secUrl: string;
  previewText: string;
  qualityScore: number | null;
}

export interface CompanyFilingTypeCount {
  formType: string;
  count: number;
}

export interface CompanyPageData {
  meta: CompanyMeta;
  totalFilings: number;
  recentFilings: CompanyFilingPreview[];
  filingTypeCounts: CompanyFilingTypeCount[];
  relatedTickers: string[]; // other tickers in the same sector
}

/**
 * Fetch everything needed to render /companies/[ticker].
 * Returns null if the ticker is not tracked or has no summarized filings.
 */
export async function getCompanyPageData(
  ticker: string,
  recentLimit = 10,
): Promise<CompanyPageData | null> {
  const meta = getCompanyMeta(ticker);
  if (!meta) return null;

  try {
    const prisma = getPrismaClient();
    const symbol = meta.ticker;

    // Single aggregated query: distinct by accession number across all user-scoped Tickers.
    const recentRaw = await prisma.secFiling.findMany({
      where: {
        ticker: { symbol },
        summaries: {
          some: {
            processingStatus: 'completed',
            summaryText: { not: '' },
          },
        },
      },
      orderBy: { filingDate: 'desc' },
      take: recentLimit * 3, // over-fetch to survive distinct dedupe
      distinct: ['accessionNumber'],
      select: {
        accessionNumber: true,
        formType: true,
        filingDate: true,
        secUrl: true,
        summaries: {
          where: {
            processingStatus: 'completed',
            summaryText: { not: '' },
          },
          orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: { summaryText: true, qualityScore: true },
        },
      },
    });

    const recentFilings: CompanyFilingPreview[] = recentRaw
      .filter((f) => f.summaries.length > 0)
      .slice(0, recentLimit)
      .map((f) => ({
        accessionNumber: f.accessionNumber,
        formType: f.formType,
        filingDate: f.filingDate,
        secUrl: f.secUrl,
        previewText: truncateToWords(f.summaries[0].summaryText, 60),
        qualityScore: f.summaries[0].qualityScore ?? null,
      }));

    if (recentFilings.length === 0) return null;

    // Total count and per-type breakdown via groupBy (one query each, both cheap).
    const [totalFilings, grouped] = await Promise.all([
      prisma.secFiling.count({
        where: {
          ticker: { symbol },
          summaries: { some: { processingStatus: 'completed', summaryText: { not: '' } } },
        },
      }),
      prisma.secFiling.groupBy({
        by: ['formType'],
        where: {
          ticker: { symbol },
          summaries: { some: { processingStatus: 'completed', summaryText: { not: '' } } },
        },
        _count: { accessionNumber: true },
      }),
    ]);

    const filingTypeCounts: CompanyFilingTypeCount[] = grouped
      .map((g) => ({ formType: g.formType, count: g._count.accessionNumber }))
      .sort((a, b) => b.count - a.count);

    const relatedTickers = Object.values(COMPANIES)
      .filter((c) => c.sector === meta.sector && c.ticker !== meta.ticker)
      .map((c) => c.ticker)
      .slice(0, 4);

    return {
      meta,
      totalFilings,
      recentFilings,
      filingTypeCounts,
      relatedTickers,
    };
  } catch {
    // DB unavailable (build time or transient error) — caller gets null and shows notFound().
    return null;
  }
}

/**
 * List all tickers that have at least one completed summary.
 * Used by generateStaticParams and the /companies directory page.
 */
export async function getTickersWithSummaries(): Promise<string[]> {
  try {
    const prisma = getPrismaClient();
    const rows = await prisma.ticker.findMany({
      where: {
        summaries: {
          some: { processingStatus: 'completed', summaryText: { not: '' } },
        },
      },
      select: { symbol: true },
      distinct: ['symbol'],
    });
    // Intersect with the hardcoded metadata — we only render pages for tracked companies
    const known = new Set(Object.keys(COMPANIES));
    return rows
      .map((r) => r.symbol.toUpperCase())
      .filter((s) => known.has(s));
  } catch {
    // DB unavailable (e.g., during build) — return empty so sitemap still works
    return [];
  }
}

/**
 * Directory listing for /companies — every tracked company with a live filing count.
 */
export interface CompanyDirectoryEntry {
  meta: CompanyMeta;
  filingCount: number;
}

export async function getCompanyDirectory(): Promise<CompanyDirectoryEntry[]> {
  try {
    const prisma = getPrismaClient();
    const grouped = await prisma.secFiling.groupBy({
      by: ['tickerId'],
      where: {
        summaries: { some: { processingStatus: 'completed', summaryText: { not: '' } } },
      },
      _count: { accessionNumber: true },
    });

    // Resolve tickerId -> symbol
    const tickerIds = grouped.map((g) => g.tickerId);
    const tickers = await prisma.ticker.findMany({
      where: { id: { in: tickerIds } },
      select: { id: true, symbol: true },
    });
    const idToSymbol = new Map(tickers.map((t) => [t.id, t.symbol.toUpperCase()]));

    // Aggregate by symbol (dedupe across users)
    const bySymbol = new Map<string, number>();
    for (const g of grouped) {
      const symbol = idToSymbol.get(g.tickerId);
      if (!symbol) continue;
      bySymbol.set(symbol, (bySymbol.get(symbol) ?? 0) + g._count.accessionNumber);
    }

    const entries: CompanyDirectoryEntry[] = [];
    for (const meta of Object.values(COMPANIES)) {
      const count = bySymbol.get(meta.ticker) ?? 0;
      if (count > 0) entries.push({ meta, filingCount: count });
    }
    return entries.sort((a, b) => b.filingCount - a.filingCount);
  } catch {
    // DB unavailable at build time — still list every tracked company with zero count.
    // The directory page gracefully renders with names and industries even without counts.
    return Object.values(COMPANIES).map((meta) => ({ meta, filingCount: 0 }));
  }
}

/**
 * Recent filings of a given form type across all tracked companies.
 * Used by /filings/[type] guide pages to show real examples.
 */
export async function getRecentFilingsByType(
  formType: string,
  limit = 5,
): Promise<Array<{ accessionNumber: string; ticker: string; filingDate: Date; previewText: string; formType: string }>> {
  try {
    const prisma = getPrismaClient();
    const rows = await prisma.secFiling.findMany({
    where: {
      formType: { equals: formType, mode: 'insensitive' },
      summaries: { some: { processingStatus: 'completed', summaryText: { not: '' } } },
    },
    orderBy: { filingDate: 'desc' },
    take: limit * 3,
    distinct: ['accessionNumber'],
    select: {
      accessionNumber: true,
      formType: true,
      filingDate: true,
      ticker: { select: { symbol: true } },
      summaries: {
        where: { processingStatus: 'completed', summaryText: { not: '' } },
        orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { summaryText: true },
      },
    },
  });

    return rows
      .filter((r) => r.summaries.length > 0)
      .slice(0, limit)
      .map((r) => ({
        accessionNumber: r.accessionNumber,
        ticker: r.ticker.symbol,
        filingDate: r.filingDate,
        formType: r.formType,
        previewText: truncateToWords(r.summaries[0].summaryText, 50),
      }));
  } catch {
    // DB unavailable (e.g., during build) — return empty. The page still renders educational content.
    return [];
  }
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  const truncated = words.slice(0, maxWords).join(' ');
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > truncated.length * 0.6) {
    return truncated.substring(0, lastPeriod + 1);
  }
  return truncated + '...';
}
