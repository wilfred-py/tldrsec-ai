import type { SECFilingType } from '../../../lib/ai/prompts/prompt-types';

export const mockFiling = {
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
};

export const mockCompletedFiling = {
  ...mockFiling,
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
};
