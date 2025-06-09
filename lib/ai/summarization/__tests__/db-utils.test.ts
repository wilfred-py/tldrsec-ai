/**
 * DB Utils Tests
 * 
 * Tests for the database utility functions in the enhanced summarization module
 */

import { updateSummaryWithPartialResult, updateSummaryWithResult } from '../db-utils';
import { EnhancedSummarizationResult, BaseSummarizationResult } from '../types';
import { SummarizationResult } from '../../summarize';
import { jest } from '@jest/globals';

// Mock modules are set up in setup.js

// Import the mocked prisma client
jest.mock('../../../db/prisma', () => {
  return {
    prisma: {
      summary: {
        update: jest.fn().mockResolvedValue({ id: 'summary-123' })
      }
    }
  };
});

import { prisma } from '../../../db/prisma';

describe('DB Utils', () => {
  // Mock data
  const mockSummaryId = 'summary-123';
  const mockPartialResult: Partial<SummarizationResult> = {
    summaryId: mockSummaryId,
    summaryText: 'Partial summary text',
    summaryJSON: { key: 'value' },
    modelUsed: 'claude-3-opus-20240229',
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.001,
    duration: 1000,
    isPartial: true
  };
  
  // Create a SummarizationResult that matches the required interface
  const mockFinalResult: SummarizationResult = {
    summaryId: mockSummaryId,
    summaryText: 'Final summary text',
    summaryJSON: { key: 'finalValue' },
    modelUsed: 'claude-3-opus-20240229',
    inputTokens: 200,
    outputTokens: 100,
    cost: 0.002,
    duration: 2000,
    isPartial: false
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('updateSummaryWithPartialResult', () => {
    it('should update summary with partial result', async () => {
      await updateSummaryWithPartialResult(mockSummaryId, mockPartialResult);
      
      // Verify prisma.summary.update was called with correct parameters
      expect(prisma.summary.update).toHaveBeenCalledWith({
        where: { id: mockSummaryId },
        data: expect.objectContaining({
          processingStatus: 'PROCESSING',
          summaryText: mockPartialResult.summaryText,
          summaryJSON: JSON.stringify(mockPartialResult.summaryJSON),
          model: mockPartialResult.modelUsed,
          tokensUsed: mockPartialResult.inputTokens,
          cost: mockPartialResult.cost,
          processingTimeMs: mockPartialResult.duration,
          isPartialResult: true
        })
      });
    });
    
    it('should handle missing modelUsed property', async () => {
      const resultWithoutModelUsed = { ...mockPartialResult };
      delete resultWithoutModelUsed.modelUsed;
      
      await updateSummaryWithPartialResult(mockSummaryId, resultWithoutModelUsed);
      
      // Verify prisma.summary.update was called without model
      expect(prisma.summary.update).toHaveBeenCalledWith({
        where: { id: mockSummaryId },
        data: expect.not.objectContaining({
          model: expect.anything()
        })
      });
    });
  });
  
  describe('updateSummaryWithResult', () => {
    it('should update summary with final result', async () => {
      await updateSummaryWithResult(mockSummaryId, mockFinalResult);
      
      // Verify prisma.summary.update was called with correct parameters
      expect(prisma.summary.update).toHaveBeenCalledWith({
        where: { id: mockSummaryId },
        data: {
          processingStatus: 'COMPLETED',
          summaryText: mockFinalResult.summaryText,
          summaryJSON: JSON.stringify(mockFinalResult.summaryJSON),
          model: mockFinalResult.modelUsed,
          tokensUsed: mockFinalResult.inputTokens,
          cost: mockFinalResult.cost,
          processingTimeMs: mockFinalResult.duration,
          isPartialResult: false,
          processingCompletedAt: expect.any(Date)
        }
      });
    });
    
    it('should handle parsing errors', async () => {
      const resultWithErrors = { 
        ...mockFinalResult,
        parsingErrors: ['Error parsing JSON response']
      };
      
      await updateSummaryWithResult(mockSummaryId, resultWithErrors);
      
      // Verify prisma.summary.update was called with ERROR status
      expect(prisma.summary.update).toHaveBeenCalledWith({
        where: { id: mockSummaryId },
        data: expect.objectContaining({
          processingStatus: 'ERROR',
          processingError: 'Error parsing JSON response'
        })
      });
    });
  });
});
