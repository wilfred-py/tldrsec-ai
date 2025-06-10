import { jest } from '@jest/globals';
import type { SECFilingType } from '../../../lib/ai/prompts/prompt-types';
import { ClaudeClient } from '../../../lib/ai/claude-client';
import { EnhancedClaudeClient } from '../../../lib/ai/enhanced-claude-client';

// Type declarations for test mocks
type SummarizationResult = {
  id: string;
  content: string;
  filingType: SECFilingType;
  filingDate: string;
  filingUrl: string;
  createdAt: string;
  summary: string;
  usage: { inputTokens: number; outputTokens: number };
  cost: { inputCost: number; outputCost: number; totalCost: number };
};

type EnhancedSummarizationResult = SummarizationResult & {
  company: string;
  ticker: string;
  keyPoints: string[];
  riskFactors: string[];
  financialMetrics: {
    revenue: string;
    operatingMargin: string;
    eps: string;
    yoy: {
      revenue: string;
      margin: string;
      eps: string;
    };
  };
};

type ChunkResult = {
  id: string;
  status: string;
  summaryText: string;
  summaryJSON: {
    key_points: string[];
  };
  modelUsed: string;
  duration: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  isPartial: boolean;
  parsingErrors: any[];
};

export const mockClaudeClient = {
  processDocument: jest.fn().mockResolvedValue({
    id: 'mock-summary-id',
    content: 'mock content',
    filingType: '10-K' as SECFilingType,
    filingDate: new Date().toISOString(),
    filingUrl: 'https://example.com/mock.txt',
    createdAt: new Date().toISOString(),
    summary: 'Mock summary text',
    usage: {
      inputTokens: 100,
      outputTokens: 50,
    },
    cost: {
      inputCost: 0.01,
      outputCost: 0.02,
      totalCost: 0.03,
    },
  } as SummarizationResult),
  getBaseClient: jest.fn(),
} as jest.Mocked<ClaudeClient>;

export const mockEnhancedClaudeClient = {
  processDocument: jest.fn().mockResolvedValue({
    id: 'mock-enhanced-summary-id',
    content: 'mock content',
    filingType: '10-K' as SECFilingType,
    filingDate: new Date().toISOString(),
    filingUrl: 'https://example.com/mock.txt',
    createdAt: new Date().toISOString(),
    summary: 'Mock enhanced summary text',
    company: 'Mock Company',
    ticker: 'MOCK',
    keyPoints: ['Mock key point 1', 'Mock key point 2'],
    riskFactors: ['Mock risk factor 1', 'Mock risk factor 2'],
    financialMetrics: {
      revenue: '100M',
      operatingMargin: '10%',
      eps: '1.00',
      yoy: {
        revenue: '+10%',
        margin: '+2%',
        eps: '+5%',
      },
    },
    usage: {
      inputTokens: 200,
      outputTokens: 100,
    },
    cost: {
      inputCost: 0.02,
      outputCost: 0.04,
      totalCost: 0.06,
    },
  } as EnhancedSummarizationResult),
  processChunk: jest.fn().mockResolvedValue([
    {
      id: 'mock-chunk-1',
      status: 'completed',
      summaryText: 'Mock chunk summary 1',
      summaryJSON: {
        key_points: ['Mock point 1', 'Mock point 2'],
      },
      modelUsed: 'gpt-4',
      duration: 1.5,
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.02,
      isPartial: false,
      parsingErrors: [],
    },
    {
      id: 'mock-chunk-2',
      status: 'completed',
      summaryText: 'Mock chunk summary 2',
      summaryJSON: {
        key_points: ['Mock point 3', 'Mock point 4'],
      },
      modelUsed: 'gpt-4',
      duration: 1.2,
      inputTokens: 80,
      outputTokens: 40,
      cost: 0.015,
      isPartial: false,
      parsingErrors: [],
    },
  ] as ChunkResult[]),
  getBaseClient: jest.fn().mockReturnValue(mockClaudeClient),
} as jest.Mocked<EnhancedClaudeClient>;
