/**
 * Types Tests
 * 
 * Tests for the enhanced summarization types
 */

import { EnhancedSummarizationResult, BaseSummarizationResult } from '../types';

describe('EnhancedSummarizationResult interface', () => {
  it('should support both model and modelUsed properties', () => {
    const result: EnhancedSummarizationResult = {
      summaryId: 'test-summary-id',
      summaryText: 'This is a test summary',
      model: 'claude-sonnet-4-20250514',
      modelUsed: 'claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.01,
      duration: 1000,
      isPartial: false
    };

    // Verify both properties are accessible
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.modelUsed).toBe('claude-sonnet-4-20250514');
  });

  it('should allow optional properties', () => {
    const result: EnhancedSummarizationResult = {
      summaryId: 'test-summary-id',
      summaryText: 'This is a test summary',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.01,
      duration: 1000,
      isPartial: false
    };

    // modelUsed is optional
    expect(result.modelUsed).toBeUndefined();
    
    // Add optional properties
    const resultWithOptionals: EnhancedSummarizationResult = {
      ...result,
      fromCache: true,
      chunkResults: [
        {
          isPartial: false,
          inputTokens: 50,
          outputTokens: 25,
          cost: 0.005
        }
      ]
    };

    expect(resultWithOptionals.fromCache).toBe(true);
    expect(resultWithOptionals.chunkResults).toHaveLength(1);
  });

  it('should extend BaseSummarizationResult correctly', () => {
    // Create a base result
    const baseResult: BaseSummarizationResult = {
      summaryId: 'test-summary-id',
      summaryText: 'This is a test summary',
      modelUsed: 'claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.01,
      duration: 1000,
      isPartial: false
    };

    // Create an enhanced result
    const enhancedResult: EnhancedSummarizationResult = {
      ...baseResult,
      model: baseResult.modelUsed
    };

    // Verify properties are carried over
    expect(enhancedResult.summaryId).toBe(baseResult.summaryId);
    expect(enhancedResult.summaryText).toBe(baseResult.summaryText);
    expect(enhancedResult.inputTokens).toBe(baseResult.inputTokens);
    expect(enhancedResult.outputTokens).toBe(baseResult.outputTokens);
    expect(enhancedResult.cost).toBe(baseResult.cost);
    expect(enhancedResult.duration).toBe(baseResult.duration);
    expect(enhancedResult.isPartial).toBe(baseResult.isPartial);
    
    // Verify both model properties
    expect(enhancedResult.model).toBe('claude-sonnet-4-20250514');
    expect(enhancedResult.modelUsed).toBe('claude-sonnet-4-20250514');
  });
});
