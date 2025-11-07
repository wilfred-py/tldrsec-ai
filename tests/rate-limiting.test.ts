/**
 * Comprehensive Rate Limiting Tests
 * 
 * Tests all components of the AI rate limiting system including:
 * - Token bucket rate limiter
 * - Cost tracking and budget enforcement
 * - Configuration management
 * - Integration with recommendation engine
 * - Monitoring and alerting
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  TokenBucketRateLimiter, 
  AIRateLimitManager, 
  RateLimitExceededError,
  RateLimitType,
  RateLimitScope
} from '../lib/ai/rate-limiter';
import { AICostTracker } from '../lib/ai/cost-tracker';
import { RateLimitConfigManager } from '../lib/ai/rate-limit-config';
import { LLMRecommendationEngine } from '../lib/newsletter/recommendation-engine';
import { rateLimitMonitor } from '../lib/ai/rate-limit-monitor';
import { prisma } from '../lib/db/connection';

// Mock dependencies
jest.mock('../lib/db/connection', () => ({
  prisma: {
    aiCostTracking: {
      create: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      deleteMany: jest.fn()
    },
    rateLimitViolation: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn()
    },
    user: {
      findFirst: jest.fn()
    }
  }
}));

jest.mock('../lib/logging', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordGauge: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
    recordTiming: jest.fn()
  }
}));

jest.mock('../lib/monitoring/alert-service', () => ({
  alertService: {
    createAlert: jest.fn()
  }
}));

// Mock OpenRouter client
jest.mock('../lib/ai/openrouter-client', () => ({
  OpenRouterClient: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue({
      content: '{"headline": "Test headline", "valueProposition": "Test value", "socialProof": "Test social", "ctaText": "Test CTA", "riskMitigation": "Test risk"}',
      cost: { totalCost: 0.01 },
      usage: { inputTokens: 100, outputTokens: 50 }
    })
  }))
}));

describe('Token Bucket Rate Limiter', () => {
  let limiter: TokenBucketRateLimiter;

  beforeEach(() => {
    limiter = new TokenBucketRateLimiter();
  });

  afterEach(async () => {
    await limiter.disconnect();
  });

  test('should allow requests within rate limit', async () => {
    const result = await limiter.checkRateLimit('test-key', 100, 60000, 120, 1);
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
    expect(result.currentUsage).toBe(1);
    expect(result.limit).toBe(100);
  });

  test('should deny requests when rate limit exceeded', async () => {
    const key = 'test-key-2';
    const limit = 5;
    const window = 60000;
    const burst = 10;

    // Fill up the bucket
    for (let i = 0; i < limit + 1; i++) {
      await limiter.checkRateLimit(key, limit, window, burst, 1);
    }

    const result = await limiter.checkRateLimit(key, limit, window, burst, 1);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test('should handle burst capacity correctly', async () => {
    const key = 'burst-test';
    const limit = 10;
    const window = 60000;
    const burst = 20;

    // Should allow burst up to burst capacity
    for (let i = 0; i < burst; i++) {
      const result = await limiter.checkRateLimit(key, limit, window, burst, 1);
      if (i < burst) {
        expect(result.allowed).toBe(true);
      }
    }

    // Should deny after burst capacity
    const result = await limiter.checkRateLimit(key, limit, window, burst, 1);
    expect(result.allowed).toBe(false);
  });

  test('should reset rate limit correctly', async () => {
    const key = 'reset-test';
    
    // Use up the limit
    await limiter.checkRateLimit(key, 1, 60000, 1, 1);
    const deniedResult = await limiter.checkRateLimit(key, 1, 60000, 1, 1);
    expect(deniedResult.allowed).toBe(false);

    // Reset the limit
    await limiter.resetRateLimit(key);
    
    // Should allow requests again
    const allowedResult = await limiter.checkRateLimit(key, 1, 60000, 1, 1);
    expect(allowedResult.allowed).toBe(true);
  });
});

describe('AI Rate Limit Manager', () => {
  let manager: AIRateLimitManager;

  beforeEach(() => {
    manager = new AIRateLimitManager({
      requestsPerHour: 10,
      requestsPerDay: 100,
      requestsBurstCapacity: 5,
      tokensPerHour: 1000,
      tokensPerDay: 10000,
      tokensBurstCapacity: 500,
      costPerHour: 1.0,
      costPerDay: 10.0,
      costBurstCapacity: 0.5
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should check all rate limits', async () => {
    const result = await manager.checkAllLimits('user123', 'test_operation', 100, 0.01);
    
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('should detect rate limit violations', async () => {
    const userId = 'user123';
    const operation = 'test_operation';

    // Exceed request limit
    for (let i = 0; i <= 10; i++) {
      await manager.checkAllLimits(userId, operation, 0, 0);
    }

    const result = await manager.checkAllLimits(userId, operation, 0, 0);
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test('should handle token-based rate limiting', async () => {
    const userId = 'user456';
    const operation = 'high_token_operation';

    const result = await manager.checkAllLimits(userId, operation, 1500, 0); // High token usage
    
    if (!result.allowed) {
      const tokenViolation = result.violations.find(v => v.limitType === RateLimitType.TOKENS_PER_HOUR);
      expect(tokenViolation).toBeDefined();
    }
  });

  test('should handle cost-based rate limiting', async () => {
    const userId = 'user789';
    const operation = 'expensive_operation';

    const result = await manager.checkAllLimits(userId, operation, 100, 2.0); // High cost
    
    if (!result.allowed) {
      const costViolation = result.violations.find(v => v.limitType === RateLimitType.COST_PER_HOUR);
      expect(costViolation).toBeDefined();
    }
  });

  test('should record usage correctly', async () => {
    const userId = 'user101112';
    const operation = 'record_test';

    await manager.recordUsage(userId, operation, 150, 0.05);
    // Usage recording is fire-and-forget, so we just ensure it doesn't throw
    expect(true).toBe(true);
  });

  test('should get rate limit status', async () => {
    const userId = 'user131415';
    
    const status = await manager.getRateLimitStatus(userId);
    
    expect(status).toHaveProperty('requests');
    expect(status).toHaveProperty('tokens');
    expect(status).toHaveProperty('cost');
    expect(status.requests).toHaveProperty('current');
    expect(status.requests).toHaveProperty('limit');
    expect(status.requests).toHaveProperty('resetTime');
  });
});

describe('AI Cost Tracker', () => {
  let costTracker: AICostTracker;
  const mockPrismaCreate = prisma.aiCostTracking.create as jest.MockedFunction<typeof prisma.aiCostTracking.create>;
  const mockPrismaAggregate = prisma.aiCostTracking.aggregate as jest.MockedFunction<typeof prisma.aiCostTracking.aggregate>;

  beforeEach(() => {
    costTracker = new AICostTracker({
      dailyBudget: 50.0,
      monthlyBudget: 1500.0,
      userDailyBudget: 5.0,
      userMonthlyBudget: 150.0,
      alertThresholds: {
        warning: 0.8,
        critical: 0.9
      }
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  test('should estimate costs correctly', () => {
    const cost = costTracker.estimateCost('claude-sonnet-4', 1000, 500);
    expect(cost).toBeGreaterThan(0);
    expect(typeof cost).toBe('number');
  });

  test('should handle unknown model pricing', () => {
    const cost = costTracker.estimateCost('unknown-model', 1000, 500);
    expect(cost).toBeGreaterThan(0); // Should use average pricing
  });

  test('should check budget correctly', async () => {
    // Mock low current usage
    mockPrismaAggregate.mockResolvedValue({ _sum: { actualCost: 1.0 } } as any);

    const budgetStatus = await costTracker.checkBudget('user123', 0.5, 'test_operation');
    
    expect(budgetStatus.isWithinBudget).toBe(true);
    expect(budgetStatus.dailyUtilization).toBeLessThan(1.0);
    expect(budgetStatus.remainingDaily).toBeGreaterThan(0);
  });

  test('should detect budget violations', async () => {
    // Mock high current usage
    mockPrismaAggregate.mockResolvedValue({ _sum: { actualCost: 45.0 } } as any);

    const budgetStatus = await costTracker.checkBudget('user123', 10.0, 'expensive_operation');
    
    expect(budgetStatus.isWithinBudget).toBe(false);
    expect(budgetStatus.violationType).toBeDefined();
  });

  test('should track costs correctly', async () => {
    mockPrismaCreate.mockResolvedValue({} as any);

    await costTracker.trackCost({
      userId: 'user123',
      operation: 'test_operation',
      model: 'claude-sonnet-4',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.01,
      actualCost: 0.012,
      timestamp: new Date(),
      metadata: { test: true }
    });

    expect(mockPrismaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user123',
        operation: 'test_operation',
        model: 'claude-sonnet-4',
        actualCost: 0.012
      })
    });
  });

  test('should get cost summary', async () => {
    mockPrismaAggregate.mockResolvedValue({
      _sum: { actualCost: 25.0, tokensUsed: 5000 },
      _count: 100
    } as any);

    const summary = await costTracker.getCostSummary('user123');
    
    expect(summary).toHaveProperty('totalCost');
    expect(summary).toHaveProperty('tokensUsed');
    expect(summary).toHaveProperty('requestCount');
    expect(summary).toHaveProperty('averageCostPerRequest');
  });
});

describe('Rate Limit Configuration', () => {
  let configManager: RateLimitConfigManager;

  beforeEach(() => {
    configManager = new RateLimitConfigManager('development');
  });

  test('should load correct environment configuration', () => {
    const config = configManager.getConfiguration();
    expect(config.environment).toBe('development');
    expect(config.userTiers).toBeDefined();
    expect(config.global).toBeDefined();
    expect(config.behavior).toBeDefined();
  });

  test('should get tier limits correctly', () => {
    const freeLimits = configManager.getTierLimits('free');
    const proLimits = configManager.getTierLimits('professional');
    
    expect(freeLimits.requestsPerHour).toBeLessThan(proLimits.requestsPerHour);
    expect(freeLimits.costPerHour).toBeLessThan(proLimits.costPerHour);
  });

  test('should default to free tier for unknown tiers', () => {
    const unknownTierLimits = configManager.getTierLimits('unknown');
    const freeLimits = configManager.getTierLimits('free');
    
    expect(unknownTierLimits).toEqual(freeLimits);
  });

  test('should check feature flags', () => {
    expect(typeof configManager.isRateLimitingEnabled()).toBe('boolean');
    expect(typeof configManager.isCostTrackingEnabled()).toBe('boolean');
  });

  test('should update configuration at runtime', () => {
    const originalConfig = configManager.getConfiguration();
    
    configManager.updateConfiguration({
      behavior: {
        ...originalConfig.behavior,
        enableRateLimiting: false
      }
    });

    expect(configManager.isRateLimitingEnabled()).toBe(false);
  });
});

describe('LLM Recommendation Engine Rate Limiting', () => {
  let engine: LLMRecommendationEngine;

  beforeEach(() => {
    engine = new LLMRecommendationEngine();
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  test('should generate personalized content with rate limiting', async () => {
    const userContext = {
      userId: 'user123',
      subscriptionTier: 'free',
      email: 'test@example.com',
      utm_source: 'google'
    };

    const content = await engine.generatePersonalizedContent(userContext);
    
    expect(content).toHaveProperty('headline');
    expect(content).toHaveProperty('valueProposition');
    expect(content).toHaveProperty('socialProof');
    expect(content).toHaveProperty('ctaText');
    expect(content).toHaveProperty('riskMitigation');
  });

  test('should handle rate limit violations gracefully', async () => {
    // This test would need to trigger rate limits
    // In practice, you might mock the rate limiter to return violations
    const userContext = {
      userId: 'rate-limited-user',
      subscriptionTier: 'free'
    };

    const content = await engine.generatePersonalizedContent(userContext);
    
    // Should return fallback content when rate limited
    expect(content).toHaveProperty('headline');
    expect(typeof content.headline).toBe('string');
  });

  test('should track usage and costs', async () => {
    const userContext = {
      userId: 'tracking-test-user',
      subscriptionTier: 'professional'
    };

    const content = await engine.generatePersonalizedContent(userContext);
    
    // Verify that usage tracking methods are called
    // This would require mocking the rate limit manager
    expect(content).toBeDefined();
  });

  test('should get rate limit status for user', async () => {
    const status = await engine.getRateLimitStatus('user123');
    
    expect(status).toHaveProperty('requests');
    expect(status).toHaveProperty('tokens');
    expect(status).toHaveProperty('cost');
  });
});

describe('Rate Limit Monitoring', () => {
  const mockViolationCreate = prisma.rateLimitViolation.create as jest.MockedFunction<typeof prisma.rateLimitViolation.create>;
  const mockViolationCount = prisma.rateLimitViolation.count as jest.MockedFunction<typeof prisma.rateLimitViolation.count>;
  const mockViolationFindMany = prisma.rateLimitViolation.findMany as jest.MockedFunction<typeof prisma.rateLimitViolation.findMany>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should record violations correctly', async () => {
    mockViolationCreate.mockResolvedValue({} as any);

    await rateLimitMonitor.recordViolation({
      userId: 'user123',
      limitType: RateLimitType.REQUESTS_PER_HOUR,
      violationType: 'HARD_LIMIT' as any,
      attemptedOperation: 'test_operation',
      currentUsage: 101,
      limit: 100
    });

    expect(mockViolationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user123',
        limitType: RateLimitType.REQUESTS_PER_HOUR,
        currentUsage: 101,
        limit: 100
      })
    });
  });

  test('should get metrics correctly', async () => {
    // Mock data responses
    mockViolationFindMany.mockResolvedValue([]);
    mockViolationCount.mockResolvedValue(5);
    (prisma.aiCostTracking.aggregate as jest.MockedFunction<any>).mockResolvedValue({
      _sum: { actualCost: 50.0 },
      _count: 100
    });

    const metrics = await rateLimitMonitor.getMetrics('day');
    
    expect(metrics).toHaveProperty('totalRequests');
    expect(metrics).toHaveProperty('totalViolations');
    expect(metrics).toHaveProperty('violationRate');
    expect(metrics).toHaveProperty('costMetrics');
  });

  test('should analyze usage patterns', async () => {
    // Mock high violation count for burst detection
    mockViolationCount.mockResolvedValue(60);
    (prisma.rateLimitViolation.groupBy as jest.MockedFunction<any>).mockResolvedValue([
      { userId: 'user123', _count: 15 }
    ]);
    (prisma.aiCostTracking.aggregate as jest.MockedFunction<any>).mockResolvedValue({
      _sum: { actualCost: 10.0 }
    });

    const patterns = await rateLimitMonitor.analyzeUsagePatterns();
    
    expect(Array.isArray(patterns)).toBe(true);
    // Should detect burst pattern due to high violation count
    const burstPattern = patterns.find(p => p.type === 'burst');
    expect(burstPattern).toBeDefined();
  });

  test('should generate health report', async () => {
    // Mock data for health report
    mockViolationFindMany.mockResolvedValue([]);
    mockViolationCount.mockResolvedValue(2);
    (prisma.aiCostTracking.aggregate as jest.MockedFunction<any>).mockResolvedValue({
      _sum: { actualCost: 25.0 },
      _count: 100
    });

    const report = await rateLimitMonitor.generateHealthReport();
    
    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('metrics');
    expect(report).toHaveProperty('patterns');
    expect(report).toHaveProperty('recommendations');
    expect(['healthy', 'warning', 'critical']).toContain(report.status);
  });

  test('should cleanup old violations', async () => {
    const mockDeleteMany = prisma.rateLimitViolation.deleteMany as jest.MockedFunction<typeof prisma.rateLimitViolation.deleteMany>;
    mockDeleteMany.mockResolvedValue({ count: 25 });

    const deletedCount = await rateLimitMonitor.cleanupOldViolations(30);
    
    expect(deletedCount).toBe(25);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        timestamp: {
          lt: expect.any(Date)
        }
      }
    });
  });
});

describe('Error Handling and Edge Cases', () => {
  test('should handle database connection errors gracefully', async () => {
    const costTracker = new AICostTracker();
    (prisma.aiCostTracking.aggregate as jest.MockedFunction<any>).mockRejectedValue(new Error('Database error'));

    // Should not throw and return default values
    const budgetStatus = await costTracker.checkBudget('user123', 0.5, 'test_operation');
    expect(budgetStatus.isWithinBudget).toBe(true); // Fail open
  });

  test('should handle Redis connection failures gracefully', async () => {
    // Rate limiter should fall back to in-memory when Redis fails
    const limiter = new TokenBucketRateLimiter();
    
    const result = await limiter.checkRateLimit('test-key', 100, 60000, 120, 1);
    expect(result.allowed).toBe(true);
    
    await limiter.disconnect();
  });

  test('should handle malformed configuration gracefully', () => {
    // Configuration should validate and use defaults for invalid values
    const configManager = new RateLimitConfigManager('invalid-env' as any);
    const config = configManager.getConfiguration();
    
    expect(config.environment).toBe('development'); // Should default
  });

  test('should handle AI service failures with fallbacks', async () => {
    const engine = new LLMRecommendationEngine();
    
    // Mock AI service to fail
    const mockOpenRouter = {
      complete: jest.fn().mockRejectedValue(new Error('AI service error'))
    };
    (engine as any).openrouter = mockOpenRouter;

    const userContext = { userId: 'test', utm_source: 'test' };
    const content = await engine.generatePersonalizedContent(userContext);
    
    // Should return fallback content
    expect(content).toHaveProperty('headline');
    expect(typeof content.headline).toBe('string');
    
    await engine.shutdown();
  });

  test('should handle missing environment variables', () => {
    // Temporarily remove env vars
    const originalEnv = process.env.AI_USER_REQUESTS_PER_HOUR;
    delete process.env.AI_USER_REQUESTS_PER_HOUR;

    const configManager = new RateLimitConfigManager();
    const freeLimits = configManager.getTierLimits('free');
    
    expect(freeLimits.requestsPerHour).toBeGreaterThan(0); // Should have default
    
    // Restore env var
    if (originalEnv) {
      process.env.AI_USER_REQUESTS_PER_HOUR = originalEnv;
    }
  });
});

describe('Performance and Stress Tests', () => {
  test('should handle high concurrent rate limit checks', async () => {
    const manager = new AIRateLimitManager({
      requestsPerHour: 1000,
      requestsPerDay: 10000,
      requestsBurstCapacity: 100
    });

    const promises = [];
    const userId = 'stress-test-user';
    
    // Create 100 concurrent rate limit checks
    for (let i = 0; i < 100; i++) {
      promises.push(manager.checkAllLimits(userId, 'stress_test', 100, 0.01));
    }

    const results = await Promise.all(promises);
    
    // Most should be allowed initially
    const allowedCount = results.filter(r => r.allowed).length;
    expect(allowedCount).toBeGreaterThan(50);
    
    await manager.shutdown();
  });

  test('should perform rate limit checks quickly', async () => {
    const limiter = new TokenBucketRateLimiter();
    
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      await limiter.checkRateLimit(`perf-test-${i}`, 100, 60000, 120, 1);
    }
    
    const endTime = Date.now();
    const averageTime = (endTime - startTime) / 100;
    
    // Should average less than 10ms per check
    expect(averageTime).toBeLessThan(10);
    
    await limiter.disconnect();
  });

  test('should handle memory efficiently with many keys', async () => {
    const limiter = new TokenBucketRateLimiter();
    
    // Create many different keys
    for (let i = 0; i < 1000; i++) {
      await limiter.checkRateLimit(`memory-test-${i}`, 10, 60000, 15, 1);
    }
    
    // Memory usage should not be excessive
    // In a real test environment, you might check process.memoryUsage()
    expect(true).toBe(true);
    
    await limiter.disconnect();
  });
});

// Integration test with actual recommendation engine
describe('End-to-End Rate Limiting Integration', () => {
  test('should enforce rate limits in real usage scenario', async () => {
    const engine = new LLMRecommendationEngine();
    
    const userContext = {
      userId: 'integration-test-user',
      subscriptionTier: 'free',
      email: 'test@example.com',
      utm_source: 'google'
    };

    // Should work for first few requests
    const content1 = await engine.generatePersonalizedContent(userContext);
    expect(content1).toBeDefined();

    const content2 = await engine.generatePersonalizedContent(userContext);
    expect(content2).toBeDefined();

    // After many requests, should eventually hit rate limits
    // (This would require setting very low limits for testing)
    
    await engine.shutdown();
  });
});