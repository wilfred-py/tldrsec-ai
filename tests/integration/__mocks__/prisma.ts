import { jest } from '@jest/globals';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { SECFilingType } from '../../../lib/ai/prompts/prompt-types';
import type { NotificationPreference } from '../../../types/user';

export const mockPrisma = {
  secFiling: {
    create: jest.fn().mockResolvedValue({
      id: 'mock-filing-id',
      ticker: 'MOCK',
      company: 'Mock Company',
      filingName: 'mock-filing.txt',
      filingCode: '10-K' as SECFilingType,
      filingDate: new Date().toISOString(),
      status: 'PENDING',
      details: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Prisma.SecFiling),
    update: jest.fn().mockResolvedValue({
      id: 'mock-filing-id',
      ticker: 'MOCK',
      company: 'Mock Company',
      filingName: 'mock-filing.txt',
      filingCode: '10-K' as SECFilingType,
      filingDate: new Date().toISOString(),
      status: 'COMPLETED',
      details: {
        revenue: '100M',
        operatingMargin: '10%',
        eps: '1.00',
        yoy: {
          revenue: '+10%',
          margin: '+2%',
          eps: '+5%',
        },
        keyInsights: ['Mock insight 1', 'Mock insight 2'],
        riskFactors: ['Mock risk 1', 'Mock risk 2'],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Prisma.SecFiling),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([{
      id: 'mock-filing-id',
      ticker: 'MOCK',
      company: 'Mock Company',
      filingName: 'mock-filing.txt',
      filingCode: '10-K' as SECFilingType,
      filingDate: new Date().toISOString(),
      status: 'PENDING',
      details: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Prisma.SecFiling]),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([{
      id: 'mock-user-id',
      name: 'Mock User',
      email: 'mock@example.com',
      preferences: {
        emailNotificationPreference: 'DAILY' as NotificationPreference,
        watchedTickers: [],
        watchedFormTypes: ['10-K', '10-Q', '8-K'] as SECFilingType[],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Prisma.User]),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
} as jest.Mocked<PrismaClient>;
