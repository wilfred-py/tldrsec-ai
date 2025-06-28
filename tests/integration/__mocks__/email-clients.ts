import { jest } from '@jest/globals';
import type { DigestService } from '../../../lib/email/digest-service';
import type { NotificationPreference } from '../../../types/user';
import type { SECFilingType } from '../../../lib/ai/prompts/prompt-types';
import type { ResendClient } from '../../../lib/email/resend-client';

type EmailSendResult = { id: string; success: boolean };
type EmailMessage = { to: string; subject: string; html?: string; text?: string; tags?: string[]; };

export const mockResendClient = {
  sendEmail: jest.fn().mockImplementation((message: EmailMessage) => {
    return Promise.resolve({
      id: 'email-123',
      success: true,
    } as EmailSendResult);
  }),
  getUsage: jest.fn().mockResolvedValue({
    total: 100,
    month: 50,
  }),
  getApiKey: jest.fn().mockResolvedValue('mock-api-key'),
  getWebhooks: jest.fn().mockResolvedValue([]),
  getDomains: jest.fn().mockResolvedValue([]),
  resetUsage: jest.fn().mockResolvedValue(true),
} as unknown as jest.Mocked<ResendClient>;

type UserDigestData = {
  userId: string;
  email: string;
  name: string;
  emailNotificationPreference: NotificationPreference;
  watchedTickers: string[];
  watchedFormTypes: SECFilingType[];
};

type FilingSummary = {
  id: string;
  ticker: string;
  company: string;
  filingName: string;
  filingCode: SECFilingType;
  filingDate: string;
  status: string;
  details: {
    revenue?: string;
    operatingMargin?: string;
    eps?: string;
    yoy?: {
      revenue?: string;
      margin?: string;
      eps?: string;
    };
    keyInsights?: string[];
    riskFactors?: string[];
  };
  createdAt: string;
  updatedAt: string;
};

export const mockDigestService = {
  sendDigestEmail: jest.fn().mockImplementation(
    async (userData: UserDigestData, summaries: FilingSummary[], errors: Error[]) => {
      const emailResult = await mockResendClient.sendEmail({
        to: userData.email,
        subject: `SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
        html: '<div>Mock email content</div>',
        text: 'Mock email content',
        tags: ['type:summaries', 'content:filings'],
      });
      return emailResult;
    }
  ),
  getUserDigestData: jest.fn().mockResolvedValue({
    userId: 'mock-user-id',
    email: 'mock@example.com',
    name: 'Mock User',
    emailNotificationPreference: 'DAILY' as NotificationPreference,
    watchedTickers: [],
    watchedFormTypes: ['10-K', '10-Q', '8-K'] as SECFilingType[],
  } as UserDigestData),
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
  } as FilingSummary]),
  getDigestErrors: jest.fn().mockResolvedValue([]),
  scheduleDigestCompilation: jest.fn().mockResolvedValue(undefined),
  compileAndSendDigests: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<DigestService>;
