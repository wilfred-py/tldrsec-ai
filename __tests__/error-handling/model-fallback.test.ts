/**
 * Model Fallback Tests
 * 
 * Tests the model fallback mechanism that allows gracefully switching between different Claude models when errors occur.
 */

import { 
  executeWithModelFallback, 
  ModelInfo, 
  ModelCapability,
} from '@/lib/error-handling/model-fallback';
import { ApiError, ErrorCode } from '@/lib/error-handling';

// Mock global functions
jest.mock('@/lib/logging', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockImplementation(() => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    })),
  }
}));

jest.mock('@/lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    recordTiming: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn()
  }
}));

describe('Model Fallback Mechanism', () => {
  // Mock models for testing
  const mockModels: ModelInfo[] = [
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      maxTokens: 200000,
      capabilities: [ModelCapability.SUMMARIZATION],
      cost: {
        inputTokenCost: 15,
        outputTokenCost: 75
      },
      priority: 5
    },
    {
      id: 'claude-3-sonnet',
      name: 'Claude 3 Sonnet',
      provider: 'anthropic',
      maxTokens: 180000,
      capabilities: [ModelCapability.SUMMARIZATION],
      cost: {
        inputTokenCost: 3,
        outputTokenCost: 15
      },
      priority: 10
    }
  ];
  
  describe('executeWithModelFallback', () => {
    it('should successfully execute with the primary model on first try', async () => {
      // Create a mock function that succeeds
      const mockFn = jest.fn().mockResolvedValue({
        success: true,
        model: 'claude-3-opus',
        data: 'test result'
      });
      
      const fallback = {
        models: mockModels,
        primaryModel: 'claude-3-opus',
        requiredCapabilities: [ModelCapability.SUMMARIZATION],
      };
      
      // Execute with model fallback
      const result = await executeWithModelFallback(
        mockFn,
        fallback
      );
      
      // Function should be called once with the primary model
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('claude-3-opus');
      expect(result).toEqual({
        success: true,
        model: 'claude-3-opus',
        data: 'test result'
      });
    });
    
    it('should fall back to a cheaper model when primary model fails', async () => {
      // Create a mock function that fails with quota exceeded then succeeds
      const mockFn = jest.fn()
        .mockImplementationOnce((model) => {
          throw new ApiError(
            ErrorCode.AI_QUOTA_EXCEEDED,
            `Quota exceeded for model ${model}`,
            { model },
            true
          );
        })
        .mockImplementationOnce((model) => {
          return Promise.resolve({
            success: true,
            model, // Return the model that was used
            data: 'fallback success'
          });
        });
      
      const fallback = {
        models: mockModels,
        primaryModel: 'claude-3-opus',
        requiredCapabilities: [ModelCapability.SUMMARIZATION],
      };
      
      // Execute with model fallback
      const result = await executeWithModelFallback(
        mockFn,
        fallback
      );
      
      // Function should be called twice: once with primary model, then with fallback
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenNthCalledWith(1, 'claude-3-opus');
      expect(mockFn).toHaveBeenNthCalledWith(2, 'claude-3-sonnet'); // The next model in the list
      
      expect(result).toEqual({
        success: true,
        model: 'claude-3-sonnet',
        data: 'fallback success'
      });
    });
  });
}); 