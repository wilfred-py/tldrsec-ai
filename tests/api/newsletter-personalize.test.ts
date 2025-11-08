/**
 * Newsletter Personalize API Route Tests
 * Tests AI personalization features with error boundaries and rate limiting
 */

import { POST } from '../../app/api/newsletter/personalize/route';
import { NextRequest } from 'next/server';
import { EnhancedClaudeClient } from '../../lib/ai/enhanced-claude-client';
import { RateLimiter } from '../../lib/ai/rate-limiter';
import { auth } from '@clerk/nextjs/server';

// Mock dependencies
jest.mock('../../lib/ai/enhanced-claude-client');
jest.mock('../../lib/ai/rate-limiter');
jest.mock('@clerk/nextjs/server');
jest.mock('../../lib/logging');

describe('/api/newsletter/personalize', () => {
  let mockRequest: Partial<NextRequest>;
  const mockClaudeClient = {
    sendMessage: jest.fn()
  };
  const mockRateLimiter = {
    checkLimit: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    (EnhancedClaudeClient as jest.MockedClass<typeof EnhancedClaudeClient>)
      .mockImplementation(() => mockClaudeClient as any);
    
    (RateLimiter.getInstance as jest.Mock).mockReturnValue(mockRateLimiter);
    
    (auth as jest.Mock).mockReturnValue({
      userId: 'test-user-id',
      user: { emailAddresses: [{ emailAddress: 'test@example.com' }] }
    });
    
    mockRequest = {
      json: jest.fn(),
      headers: new Headers(),
      url: 'http://localhost:3000/api/newsletter/personalize'
    };
  });

  describe('POST /api/newsletter/personalize', () => {
    test('should generate personalized content for valid input', async () => {
      const requestData = {
        interests: ['earnings-reports', 'market-analysis'],
        investmentStyle: 'value-investing',
        riskTolerance: 'moderate'
      };
      
      (mockRequest.json as jest.Mock).mockResolvedValue(requestData);
      
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetTime: Date.now() + 3600000
      });
      
      const mockAIResponse = {
        content: 'Personalized newsletter content based on value investing approach...',
        inputTokens: 150,
        outputTokens: 300,
        cost: 0.002
      };
      
      mockClaudeClient.sendMessage.mockResolvedValue(mockAIResponse);
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.personalizedContent).toBe(mockAIResponse.content);
      expect(result.metadata).toEqual({
        inputTokens: 150,
        outputTokens: 300,
        cost: 0.002
      });
    });

    test('should enforce rate limiting', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports']
      });
      
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 3600000
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(429);
      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limit');
      expect(mockClaudeClient.sendMessage).not.toHaveBeenCalled();
    });

    test('should require user authentication', async () => {
      (auth as jest.Mock).mockReturnValue({ userId: null });
      
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports']
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(401);
      expect(result.success).toBe(false);
      expect(result.error).toContain('authentication');
    });

    test('should validate required fields', async () => {
      const invalidRequests = [
        {}, // Empty request
        { interests: [] }, // Empty interests
        { interests: ['invalid-interest'] }, // Invalid interest
        { interests: ['earnings-reports'], investmentStyle: 'invalid-style' }
      ];
      
      for (const requestData of invalidRequests) {
        (mockRequest.json as jest.Mock).mockResolvedValue(requestData);
        
        const response = await POST(mockRequest as NextRequest);
        const result = await response.json();
        
        expect(response.status).toBe(400);
        expect(result.success).toBe(false);
        expect(result.error).toContain('validation');
      }
    });

    test('should handle AI service failures gracefully', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports'],
        investmentStyle: 'growth-investing'
      });
      
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetTime: Date.now() + 3600000
      });
      
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('AI service unavailable'));
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.personalizedContent).toContain('fallback content');
      expect(result.fallbackUsed).toBe(true);
    });

    test('should sanitize AI response content', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports']
      });
      
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetTime: Date.now() + 3600000
      });
      
      const maliciousResponse = {
        content: 'Investment advice <script>alert("xss")</script> with HTML',
        inputTokens: 100,
        outputTokens: 200,
        cost: 0.001
      };
      
      mockClaudeClient.sendMessage.mockResolvedValue(maliciousResponse);
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(result.personalizedContent).not.toContain('<script>');
      expect(result.personalizedContent).toContain('Investment advice');
    });

    test('should track token usage for billing', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports', 'market-analysis'],
        investmentStyle: 'value-investing'
      });
      
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetTime: Date.now() + 3600000
      });
      
      const mockAIResponse = {
        content: 'Personalized content',
        inputTokens: 250,
        outputTokens: 400,
        cost: 0.005
      };
      
      mockClaudeClient.sendMessage.mockResolvedValue(mockAIResponse);
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(result.metadata.inputTokens).toBe(250);
      expect(result.metadata.outputTokens).toBe(400);
      expect(result.metadata.cost).toBe(0.005);
      expect(result.metadata.userId).toBe('test-user-id');
    });

    test('should implement circuit breaker for repeated AI failures', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports']
      });
      
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetTime: Date.now() + 3600000
      });
      
      // Simulate repeated failures that should trigger circuit breaker
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('Service unavailable'));
      
      // Multiple rapid requests
      const responses = await Promise.all([
        POST(mockRequest as NextRequest),
        POST(mockRequest as NextRequest),
        POST(mockRequest as NextRequest)
      ]);
      
      // All should return fallback content, but last one should indicate circuit breaker
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      const lastResult = await responses[2].json();
      expect(lastResult.circuitBreakerActive).toBe(true);
    });

    test('should validate investment style options', async () => {
      const validStyles = ['value-investing', 'growth-investing', 'dividend-investing', 'index-investing'];
      const invalidStyle = 'crypto-gambling';
      
      // Test valid styles
      for (const style of validStyles) {
        (mockRequest.json as jest.Mock).mockResolvedValue({
          interests: ['earnings-reports'],
          investmentStyle: style
        });
        
        mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 9 });
        mockClaudeClient.sendMessage.mockResolvedValue({
          content: `Content for ${style}`,
          inputTokens: 100,
          outputTokens: 200,
          cost: 0.001
        });
        
        const response = await POST(mockRequest as NextRequest);
        expect(response.status).toBe(200);
      }
      
      // Test invalid style
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports'],
        investmentStyle: invalidStyle
      });
      
      const response = await POST(mockRequest as NextRequest);
      expect(response.status).toBe(400);
    });

    test('should handle concurrent requests efficiently', async () => {
      const requestData = {
        interests: ['earnings-reports'],
        investmentStyle: 'value-investing'
      };
      
      (mockRequest.json as jest.Mock).mockResolvedValue(requestData);
      
      mockRateLimiter.checkLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetTime: Date.now() + 3600000
      });
      
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: 'Concurrent response',
        inputTokens: 100,
        outputTokens: 200,
        cost: 0.001
      });
      
      // Simulate multiple concurrent requests
      const concurrentRequests = Array(5).fill(null).map(() => 
        POST(mockRequest as NextRequest)
      );
      
      const responses = await Promise.all(concurrentRequests);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // AI client should be called for each request
      expect(mockClaudeClient.sendMessage).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error Boundary Testing', () => {
    test('should recover from streaming failures', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports'],
        enableStreaming: true
      });
      
      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 9 });
      
      // Mock streaming failure then fallback success
      mockClaudeClient.sendMessage
        .mockRejectedValueOnce(new Error('Streaming failed'))
        .mockResolvedValueOnce({
          content: 'Non-streaming fallback content',
          inputTokens: 100,
          outputTokens: 200,
          cost: 0.001
        });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.personalizedContent).toContain('fallback content');
      expect(result.streamingFailed).toBe(true);
    });

    test('should handle memory pressure gracefully', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports']
      });
      
      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 9 });
      
      // Simulate memory pressure error
      const memoryError = new Error('Maximum heap size exceeded');
      mockClaudeClient.sendMessage.mockRejectedValue(memoryError);
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(503);
      expect(result.success).toBe(false);
      expect(result.error).toContain('server overload');
      expect(result.retryAfter).toBeDefined();
    });
  });
});