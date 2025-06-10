import { jest } from '@jest/globals';
import type { NotificationPreference } from '../../../types/user';
import type { ResendClient } from '../../../lib/email/resend-client';
import type { DigestService } from '../../../lib/email/digest-service';
import type { SECFilingType } from '../../../lib/ai/prompts/prompt-types';

type EmailSendResult = {
  id: string;
  success: boolean;
};

export const mockResendClient = {
  sendEmail: jest.fn().mockResolvedValue({
    id: 'email-123',
    success: true,
  } as EmailSendResult),
  getUsage: jest.fn().mockResolvedValue({
    total: 0,
    month: 0,
  }),
  getApiKey: jest.fn().mockResolvedValue('mock-api-key'),
  getWebhooks: jest.fn().mockResolvedValue([]),
  getDomains: jest.fn().mockResolvedValue([]),
} as jest.Mocked<ResendClient>;

export const mockDigestService = {
  sendDigestEmail: jest.fn().mockResolvedValue({
    id: 'email-123',
    success: true,
  } as EmailSendResult),
  getUserDigestData: jest.fn().mockResolvedValue({
    userId: 'mock-user-id',
    email: 'mock@example.com',
    name: 'Mock User',
    emailNotificationPreference: 'DAILY' as NotificationPreference,
    watchedTickers: [],
    watchedFormTypes: ['10-K', '10-Q', '8-K'] as SECFilingType[],
  }),
  getDigestSummaries: jest.fn().mockResolvedValue([{
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
  }]),
  getDigestErrors: jest.fn().mockResolvedValue([]),
} as jest.Mocked<DigestService>;
