/**
 * AI Processing Service Tests - Critical Coverage
 * Tests for the new microservices architecture
 */

import { AIProcessingService } from '../../lib/services/ai-processing-service';

// Mock dependencies
jest.mock('../../lib/logging', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    })
  }
}));

jest.mock('../../lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordTiming: jest.fn(),
    recordValue: jest.fn(),
    recordMetric: jest.fn(),
    recordGauge: jest.fn(), // Add recordGauge method that the service uses
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
    recordEmailSent: jest.fn(),
    recordAiApiCall: jest.fn()
  },
  default: {
    incrementCounter: jest.fn(),
    recordTiming: jest.fn(),
    recordValue: jest.fn(),
    recordMetric: jest.fn(),
    recordGauge: jest.fn(), // Add recordGauge method that the service uses
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
    recordEmailSent: jest.fn(),
    recordAiApiCall: jest.fn()
  }
}));

jest.mock('../../lib/ai/openrouter-client', () => ({
  openRouterClient: {
    sendMessage: jest.fn()
  }
}));

jest.mock('../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    $queryRaw: jest.fn(),
    summary: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    }
  }))
}));

describe('AIProcessingService', () => {
  describe('processAISummarization', () => {
    it('should process valid AI summarization requests', async () => {
      const mockRequest = {
        requestId: 'test-123',
        filingContent: 'Test filing content with sufficient length for processing validation. This content needs to be at least 100 characters long to pass the validation requirements of the AI processing service. Additional content to reach minimum length requirement.',
        metadata: {
          ticker: 'TSLA',
          formType: '10-K',
          filingDate: '2024-01-01',
          filingUrl: 'https://example.com/filing',
          userId: 'user-123',
          priority: 'HIGH' as const,
          maxCost: 0.10
        },
        context: {
          companyName: 'Tesla Inc',
          serviceCallId: 'service-123',
          correlationId: 'corr-123'
        }
      };

      // Mock successful AI response
      const { openRouterClient } = require('../../lib/ai/openrouter-client');
      openRouterClient.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          summary: 'Test summary',
          keyPoints: ['Point 1', 'Point 2'],
          analysis: { test: 'data' }
        }),
        model: process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4-fast-reasoning',
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: 0.05,
        processingTime: 1000
      });

      const result = await AIProcessingService.processAISummarization(mockRequest);

      expect(result.success).toBe(true);
      expect(result.requestId).toBe('test-123');
      expect(result.summary?.content).toBe('Test summary');
      expect(result.performance.model).toBe(process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4-fast-reasoning');
    });

    it('should handle validation failures', async () => {
      const invalidRequest = {
        requestId: '',
        filingContent: 'short',
        metadata: {
          ticker: '',
          formType: '',
          filingDate: '',
          filingUrl: '',
          userId: '',
          priority: 'HIGH' as const,
          maxCost: 0
        },
        context: {
          companyName: '',
          serviceCallId: '',
          correlationId: ''
        }
      };

      const result = await AIProcessingService.processAISummarization(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should handle AI processing errors gracefully', async () => {
      const mockRequest = {
        requestId: 'test-error',
        filingContent: 'Test filing content with sufficient length for processing validation. This content needs to be at least 100 characters long to pass the validation requirements of the AI processing service. Additional content to reach minimum length requirement.',
        metadata: {
          ticker: 'TSLA',
          formType: '10-K',
          filingDate: '2024-01-01',
          filingUrl: 'https://example.com/filing',
          userId: 'user-123',
          priority: 'HIGH' as const,
          maxCost: 0.10
        },
        context: {
          companyName: 'Tesla Inc',
          serviceCallId: 'service-123',
          correlationId: 'corr-123'
        }
      };

      // Mock AI error
      const { openRouterClient } = require('../../lib/ai/openrouter-client');
      openRouterClient.sendMessage.mockRejectedValue(new Error('AI service timeout'));

      const result = await AIProcessingService.processAISummarization(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error?.retryable).toBe(true);
    });
  });

  describe('getServiceHealth', () => {
    it('should return service health status', async () => {
      const health = await AIProcessingService.getServiceHealth();

      expect(health.status).toBeDefined();
      expect(health.version).toBeDefined();
      expect(health.metrics).toBeDefined();
      expect(health.metrics.successRate).toBeGreaterThanOrEqual(0);
    });
  });
});