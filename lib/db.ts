import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit due to instantiating too many instances
// during hot reloading.

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// User operations
export async function getUserByClerkId(clerkId: string) {
  return prisma.user.findFirst({
    where: {
      authProviderId: clerkId,
    },
  });
}

export async function createUser(data: {
  email: string;
  name?: string | null;
  authProvider: string;
  authProviderId: string;
}) {
  return prisma.user.create({
    data,
  });
}

// Ticker operations
export async function getTickersByUserId(userId: string) {
  return prisma.ticker.findMany({
    where: {
      userId,
    },
    orderBy: {
      symbol: 'asc',
    },
  });
}

export async function addTicker(data: {
  symbol: string;
  companyName: string;
  userId: string;
}) {
  return prisma.ticker.create({
    data,
  });
}

export async function removeTicker(id: string, userId: string) {
  return prisma.ticker.deleteMany({
    where: {
      id,
      userId,
    },
  });
}

// Summary operations
export async function getSummariesByTickerId(tickerId: string) {
  return prisma.summary.findMany({
    where: {
      tickerId,
    },
    orderBy: {
      filingDate: 'desc',
    },
  });
}

export async function createSummary(data: {
  tickerId: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  summaryText: string;
  summaryJSON?: any;
}) {
  return prisma.summary.create({
    data,
  });
}

export async function markSummaryAsSent(id: string) {
  return prisma.summary.update({
    where: {
      id,
    },
    data: {
      sentToUser: true,
    },
  });
} 