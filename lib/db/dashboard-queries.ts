import { getPrismaClient } from "@/lib/db/prisma";
import { Company } from "@/lib/api/types";

/**
 * Fetch recent summaries for a set of ticker IDs.
 * Used by the streamed DashboardActivitySection.
 */
export async function fetchRecentSummaries(tickerIds: string[]) {
  if (tickerIds.length === 0) return [];

  const prisma = getPrismaClient();
  const summaries = await prisma.summary.findMany({
    where: { tickerId: { in: tickerIds } },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      importance: true,
      smartSubject: true,
      filingUrl: true,
      ticker: { select: { symbol: true, companyName: true } },
    },
    orderBy: { filingDate: "desc" },
    take: 15,
  });

  return summaries.map((s) => ({
    id: s.id,
    filingType: s.filingType,
    filingDate: s.filingDate.toISOString(),
    importance: s.importance,
    smartSubject: s.smartSubject,
    summaryText: null,
    companyName: s.ticker.companyName,
    ticker: s.ticker.symbol,
    filingUrl: s.filingUrl,
  }));
}

/**
 * Fetch featured summaries for users with zero activity (empty-state fallback).
 */
export async function fetchFeaturedSummaries() {
  const prisma = getPrismaClient();
  const featured = await prisma.summary.findMany({
    where: {
      importance: { in: ["critical", "high"] },
    },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      importance: true,
      smartSubject: true,
      filingUrl: true,
      ticker: { select: { symbol: true, companyName: true } },
    },
    orderBy: { filingDate: "desc" },
    take: 10,
  });

  return featured.map((s) => ({
    id: s.id,
    filingType: s.filingType,
    filingDate: s.filingDate.toISOString(),
    importance: s.importance,
    smartSubject: s.smartSubject,
    summaryText: null,
    companyName: s.ticker.companyName,
    ticker: s.ticker.symbol,
    filingUrl: s.filingUrl,
  }));
}

/**
 * Map a dbUser's tickers to the Company[] format used by the dashboard.
 */
export function mapTickersToCompanies(
  tickers: Array<{
    id: string;
    symbol: string;
    companyName: string;
    preferences: unknown;
    _count: { summaries: number };
    summaries: Array<{ id: string; filingDate: Date }>;
  }>
): Company[] {
  return tickers.map((ticker) => ({
    id: ticker.id,
    symbol: ticker.symbol,
    name: ticker.companyName,
    lastFiling: "—",
    lastFilingDate: ticker.summaries[0]?.filingDate?.toISOString() ?? undefined,
    summaryCount: ticker._count.summaries,
    preferences: (ticker.preferences as Company["preferences"]) || {
      tenK: true,
      tenQ: true,
      eightK: true,
      form4: true,
      other: false,
    },
  }));
}
