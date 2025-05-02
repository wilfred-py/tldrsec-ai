import { prisma } from '../db';
import type { Ticker, Summary } from '../../generated/prisma';

// Types for ticker operations
type TickerWithSummaries = Ticker & {
  summaries: Summary[];
};

// Ticker CRUD operations
export async function createTicker(userId: string, symbol: string, companyName: string): Promise<Ticker> {
  return prisma.ticker.create({
    data: {
      symbol,
      companyName,
      userId,
    },
  });
}

export async function getTickerById(id: string): Promise<TickerWithSummaries | null> {
  return prisma.ticker.findUnique({
    where: { id },
    include: {
      summaries: {
        orderBy: {
          filingDate: 'desc',
        },
        take: 5,
      },
    },
  });
}

export async function getTickerBySymbol(userId: string, symbol: string): Promise<TickerWithSummaries | null> {
  return prisma.ticker.findUnique({
    where: { 
      userId_symbol: {
        userId,
        symbol,
      }
    },
    include: {
      summaries: {
        orderBy: {
          filingDate: 'desc',
        },
        take: 1,
      },
    },
  });
}

export async function getUserTickers(userId: string): Promise<Ticker[]> {
  return prisma.ticker.findMany({
    where: {
      userId,
    },
    orderBy: {
      symbol: 'asc',
    },
  });
}

export async function getUserTickersWithLatestSummaries(userId: string): Promise<TickerWithSummaries[]> {
  return prisma.ticker.findMany({
    where: {
      userId,
    },
    include: {
      summaries: {
        orderBy: {
          filingDate: 'desc',
        },
        take: 1,
      },
    },
    orderBy: {
      symbol: 'asc',
    },
  });
}

export async function updateTicker(
  id: string, 
  data: { companyName?: string }
): Promise<Ticker> {
  return prisma.ticker.update({
    where: { id },
    data,
  });
}

export async function deleteTicker(id: string): Promise<Ticker> {
  return prisma.ticker.delete({
    where: { id },
  });
}

// Summary operations
export async function createSummary(
  tickerId: string, 
  filingType: string, 
  filingDate: Date, 
  filingUrl: string, 
  summaryText: string, 
  summaryJSON?: Record<string, any>
): Promise<Summary> {
  return prisma.summary.create({
    data: {
      tickerId,
      filingType,
      filingDate,
      filingUrl,
      summaryText,
      summaryJSON: summaryJSON || undefined,
      sentToUser: false,
    },
  });
}

export async function getSummaryById(id: string): Promise<Summary | null> {
  return prisma.summary.findUnique({
    where: { id },
  });
}

export async function getSummariesForTicker(
  tickerId: string, 
  limit = 10
): Promise<Summary[]> {
  return prisma.summary.findMany({
    where: {
      tickerId,
    },
    orderBy: {
      filingDate: 'desc',
    },
    take: limit,
  });
}

export async function getLatestSummaryForTicker(
  tickerId: string
): Promise<Summary | null> {
  const summaries = await prisma.summary.findMany({
    where: {
      tickerId,
    },
    orderBy: {
      filingDate: 'desc',
    },
    take: 1,
  });
  
  return summaries[0] || null;
}

export async function markSummaryAsSent(id: string): Promise<Summary> {
  return prisma.summary.update({
    where: { id },
    data: {
      sentToUser: true,
    },
  });
} 