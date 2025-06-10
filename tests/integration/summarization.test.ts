import { jest } from '@jest/globals';
import { mockClaudeClient, mockEnhancedClaudeClient } from './__mocks__/ai-clients';
import { mockFiling } from './__fixtures__/filing-data';
import { mockSummary, mockEnhancedSummary, mockChunkResults } from './__fixtures__/summary-data';

jest.mock('../../lib/ai/claude-client', () => ({
  ClaudeClient: jest.fn(() => mockClaudeClient),
}));

jest.mock('../../lib/ai/enhanced-claude-client', () => ({
  EnhancedClaudeClient: jest.fn(() => mockEnhancedClaudeClient),
}));

describe('Summarization Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClaudeClient.processDocument.mockResolvedValue(mockSummary);
    mockEnhancedClaudeClient.processDocument.mockResolvedValue(mockEnhancedSummary);
    mockEnhancedClaudeClient.processChunk.mockResolvedValue(mockChunkResults);
  });

  describe('Basic Summarization', () => {
    it('should generate basic summaries', async () => {
      const summary = await mockClaudeClient.processDocument(mockFiling.content);
      expect(summary).toEqual(mockSummary);
      expect(mockClaudeClient.processDocument).toHaveBeenCalledTimes(1);
      expect(summary.filingType).toBe(mockFiling.filingCode);
    });

    it('should include usage and cost information', async () => {
      const summary = await mockClaudeClient.processDocument(mockFiling.content);
      expect(summary.usage).toBeDefined();
      expect(summary.cost).toBeDefined();
      expect(summary.cost.totalCost).toBe(
        summary.cost.inputCost + summary.cost.outputCost
      );
    });
  });

  describe('Enhanced Summarization', () => {
    it('should generate enhanced summaries with financial metrics', async () => {
      const summary = await mockEnhancedClaudeClient.processDocument(mockFiling.content);
      expect(summary).toEqual(mockEnhancedSummary);
      expect(summary.financialMetrics).toBeDefined();
      expect(summary.financialMetrics.yoy).toBeDefined();
    });

    it('should extract key points and risk factors', async () => {
      const summary = await mockEnhancedClaudeClient.processDocument(mockFiling.content);
      expect(summary.keyPoints).toHaveLength(2);
      expect(summary.riskFactors).toHaveLength(2);
    });
  });

  describe('Chunk Processing', () => {
    it('should process document chunks', async () => {
      const chunks = await mockEnhancedClaudeClient.processChunk(mockFiling.content);
      expect(chunks).toEqual(mockChunkResults);
      expect(chunks).toHaveLength(2);
    });

    it('should handle chunk metadata correctly', async () => {
      const chunks = await mockEnhancedClaudeClient.processChunk(mockFiling.content);
      chunks.forEach(chunk => {
        expect(chunk.id).toBeDefined();
        expect(chunk.status).toBe('completed');
        expect(chunk.summaryJSON.key_points).toBeDefined();
        expect(chunk.isPartial).toBe(false);
        expect(chunk.parsingErrors).toHaveLength(0);
      });
    });

    it('should track chunk processing costs', async () => {
      const chunks = await mockEnhancedClaudeClient.processChunk(mockFiling.content);
      const totalCost = chunks.reduce((sum, chunk) => sum + chunk.cost, 0);
      expect(totalCost).toBeGreaterThan(0);
    });
  });
});
