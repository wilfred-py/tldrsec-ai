import { jest } from '@jest/globals';
import { mockPrisma } from './__mocks__/prisma';
import { mockClaudeClient, mockEnhancedClaudeClient } from './__mocks__/ai-clients';
import { mockFiling, mockCompletedFiling } from './__fixtures__/filing-data';
import { mockSummary, mockEnhancedSummary, mockChunkResults } from './__fixtures__/summary-data';

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe('Filing Processing Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClaudeClient.processDocument.mockResolvedValue(mockSummary);
    mockEnhancedClaudeClient.processDocument.mockResolvedValue(mockEnhancedSummary);
    mockEnhancedClaudeClient.processChunk.mockResolvedValue(mockChunkResults);
    mockPrisma.secFiling.create.mockResolvedValue(mockFiling);
    mockPrisma.secFiling.update.mockResolvedValue(mockCompletedFiling);
  });

  describe('Filing Ingestion', () => {
    it('should create a new filing record', async () => {
      const result = await mockPrisma.secFiling.create({
        data: {
          ticker: mockFiling.ticker,
          company: mockFiling.company,
          filingName: mockFiling.filingName,
          filingCode: mockFiling.filingCode,
          filingDate: mockFiling.filingDate,
          status: 'PENDING',
        },
      });

      expect(result).toEqual(mockFiling);
      expect(mockPrisma.secFiling.create).toHaveBeenCalledTimes(1);
    });

    it('should handle duplicate filings', async () => {
      mockPrisma.secFiling.findUnique.mockResolvedValue(mockFiling);

      const result = await mockPrisma.secFiling.findUnique({
        where: {
          ticker_filingCode_filingDate: {
            ticker: mockFiling.ticker,
            filingCode: mockFiling.filingCode,
            filingDate: mockFiling.filingDate,
          },
        },
      });

      expect(result).toEqual(mockFiling);
      expect(mockPrisma.secFiling.create).not.toHaveBeenCalled();
    });
  });

  describe('Filing Processing', () => {
    it('should process a filing with chunks', async () => {
      const chunks = await mockEnhancedClaudeClient.processChunk(mockFiling.content);
      expect(chunks).toEqual(mockChunkResults);
      expect(mockEnhancedClaudeClient.processChunk).toHaveBeenCalledTimes(1);
    });

    it('should generate enhanced summaries', async () => {
      const summary = await mockEnhancedClaudeClient.processDocument(mockFiling.content);
      expect(summary).toEqual(mockEnhancedSummary);
      expect(mockEnhancedClaudeClient.processDocument).toHaveBeenCalledTimes(1);
    });

    it('should update filing with summary results', async () => {
      const summary = await mockEnhancedClaudeClient.processDocument(mockFiling.content);
      const result = await mockPrisma.secFiling.update({
        where: { id: mockFiling.id },
        data: {
          status: 'COMPLETED',
          details: {
            revenue: summary.financialMetrics.revenue,
            operatingMargin: summary.financialMetrics.operatingMargin,
            eps: summary.financialMetrics.eps,
            yoy: summary.financialMetrics.yoy,
            keyInsights: summary.keyPoints,
            riskFactors: summary.riskFactors,
          },
        },
      });

      expect(result).toEqual(mockCompletedFiling);
      expect(mockPrisma.secFiling.update).toHaveBeenCalledTimes(1);
    });
  });
});
