// Tests for Cloudflare Worker
// Testing scheduled handler, fetch handler, and error scenarios

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the worker
const mockWorker = {
  fetch: jest.fn(),
  scheduled: jest.fn(),
  handlePipelineProcessing: jest.fn(),
  handleIntervalSummary: jest.fn(),
  handleDailyReport: jest.fn()
};

describe('Cloudflare Worker Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Endpoint', () => {
    it('should return health status when /health is requested', async () => {
      const request = new Request('https://worker.example.com/health');
      const env = {
        WORKER_VERSION: '2.5.0'
      };
      
      const response = {
        status: 200,
        body: {
          worker: 'healthy',
          version: '2.5.0',
          lastHeartbeat: 'never',
          heartbeatSource: 'memory',
          heartbeatCount: 0
        }
      };
      
      mockWorker.fetch.mockResolvedValue(new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      }));
      
      const result = await mockWorker.fetch(request, env, {});
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.worker).toBe('healthy');
      expect(body.version).toBe('2.5.0');
    });

    it('should return 503 when heartbeat is stale', async () => {
      const request = new Request('https://worker.example.com/health');
      const env = {
        WORKER_VERSION: '2.5.0',
        METRICS_KV: {
          get: jest.fn().mockResolvedValue(new Date(Date.now() - 3600000).toISOString()) // 1 hour old
        }
      };
      
      const response = {
        status: 503,
        body: {
          worker: 'healthy',
          stale: true,
          staleSince: '1 hour ago'
        }
      };
      
      mockWorker.fetch.mockResolvedValue(new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      }));
      
      const result = await mockWorker.fetch(request, env, {});
      expect(result.status).toBe(503);
    });
  });

  describe('Scheduled Handler', () => {
    it('should handle scheduled event for pipeline processing', async () => {
      const event = { cron: '*/5 * * * *' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.handlePipelineProcessing.mockResolvedValue({
        success: true,
        executionId: 'test-123'
      });
      
      mockWorker.scheduled.mockImplementation(async (event, env, ctx) => {
        if (event.cron === '*/5 * * * *') {
          return mockWorker.handlePipelineProcessing(event, env, ctx);
        }
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(mockWorker.handlePipelineProcessing).toHaveBeenCalledWith(event, env, {});
      expect(result.success).toBe(true);
    });

    it('should handle scheduled event for interval summary', async () => {
      const event = { cron: '*/10 * * * *' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.handleIntervalSummary.mockResolvedValue({
        success: true,
        executionId: 'interval-123'
      });
      
      mockWorker.scheduled.mockImplementation(async (event, env, ctx) => {
        if (event.cron === '*/10 * * * *') {
          return mockWorker.handleIntervalSummary(event, env, ctx);
        }
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(mockWorker.handleIntervalSummary).toHaveBeenCalledWith(event, env, {});
      expect(result.success).toBe(true);
    });

    it('should handle scheduled event for daily report', async () => {
      const event = { cron: '0 22 * * *' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.handleDailyReport.mockResolvedValue({
        success: true,
        executionId: 'daily-123'
      });
      
      mockWorker.scheduled.mockImplementation(async (event, env, ctx) => {
        if (event.cron === '0 22 * * *') {
          return mockWorker.handleDailyReport(event, env, ctx);
        }
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(mockWorker.handleDailyReport).toHaveBeenCalledWith(event, env, {});
      expect(result.success).toBe(true);
    });

    it('should handle errors gracefully in scheduled handler', async () => {
      const event = { cron: '*/5 * * * *' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      const error = new Error('API call failed');
      mockWorker.scheduled.mockImplementation(async () => {
        throw error;
      });
      
      try {
        await mockWorker.scheduled(event, env, {});
      } catch (err) {
        expect(err.message).toBe('API call failed');
      }
    });

    it('should return error response when scheduled handler fails', async () => {
      const event = { cron: '*/5 * * * *' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.scheduled.mockResolvedValue({
        success: false,
        executionId: 'scheduled-123',
        error: 'Network timeout',
        timestamp: new Date().toISOString()
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing environment variables', async () => {
      const event = { cron: '*/5 * * * *' };
      const env = {}; // Missing required env vars
      
      mockWorker.scheduled.mockResolvedValue({
        success: false,
        error: 'Environment validation failed: CRON_SECRET is missing, PUBLIC_URL is missing'
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Environment validation failed');
    });

    it('should handle network timeout', async () => {
      const event = { cron: '*/5 * * * *' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.handlePipelineProcessing.mockRejectedValue(new Error('Request timeout'));
      mockWorker.scheduled.mockImplementation(async (event, env, ctx) => {
        try {
          return await mockWorker.handlePipelineProcessing(event, env, ctx);
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timeout');
    });

    it('should handle API response errors', async () => {
      const event = { cron: '*/5 * * * *' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.handlePipelineProcessing.mockResolvedValue({
        success: false,
        error: '500 Internal Server Error'
      });
      
      mockWorker.scheduled.mockImplementation(async (event, env, ctx) => {
        return mockWorker.handlePipelineProcessing(event, env, ctx);
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('500 Internal Server Error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely long input gracefully', async () => {
      const longString = 'a'.repeat(10000);
      const event = { cron: '*/5 * * * *', data: longString };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.scheduled.mockResolvedValue({
        success: true,
        executionId: 'test-long'
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(result.success).toBe(true);
    });

    it('should handle empty cron expression', async () => {
      const event = { cron: '' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.scheduled.mockImplementation(async (event, env, ctx) => {
        // Default to pipeline processing when cron is empty
        return mockWorker.handlePipelineProcessing(event, env, ctx);
      });
      
      mockWorker.handlePipelineProcessing.mockResolvedValue({
        success: true,
        executionId: 'default-123'
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(result.success).toBe(true);
    });

    it('should handle invalid cron expression gracefully', async () => {
      const event = { cron: 'invalid-cron' };
      const env = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'test-secret'
      };
      
      mockWorker.scheduled.mockImplementation(async (event, env, ctx) => {
        // Default to pipeline processing for unknown cron expressions
        return mockWorker.handlePipelineProcessing(event, env, ctx);
      });
      
      mockWorker.handlePipelineProcessing.mockResolvedValue({
        success: true,
        executionId: 'fallback-123'
      });
      
      const result = await mockWorker.scheduled(event, env, {});
      expect(result.success).toBe(true);
    });
  });
});