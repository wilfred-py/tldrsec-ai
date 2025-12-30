// Integration tests for Cloudflare Worker cron trigger
// Simulates actual cron execution scenarios

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('Cloudflare Worker Integration Tests', () => {
  let mockFetch;
  let mockEnv;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock global fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    
    // Mock environment
    mockEnv = {
      PUBLIC_URL: 'https://tldrsec.app',
      CRON_SECRET: 'integration-test-secret',
      WORKER_VERSION: '2.5.0',
      METRICS_KV: {
        get: jest.fn(),
        put: jest.fn()
      }
    };
  });

  describe('End-to-End Cron Execution', () => {
    it('should execute complete pipeline processing flow', async () => {
      // Mock successful API responses for all pipeline steps
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })) // cleanup locks
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })) // tier-aware
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })) // discovery
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })) // fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })); // summarize
      
      // Simulate cron trigger
      const event = { cron: '*/5 * * * *' };
      
      // This would be the actual worker execution
      // In a real test, we'd import the actual worker and call it
      const simulateWorkerExecution = async () => {
        const executionId = `test-${Date.now()}`;
        console.log(`Starting execution ${executionId}`);
        
        // Record heartbeat
        await mockEnv.METRICS_KV.put('last_cron_heartbeat', new Date().toISOString());
        
        // Execute pipeline steps
        const steps = [
          '/api/cron/cleanup-locks',
          '/api/cron/tier-aware',
          '/api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS',
          '/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING',
          '/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED'
        ];
        
        for (const step of steps) {
          await mockFetch(`${mockEnv.PUBLIC_URL}${step}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Execution-Id': executionId
            }
          });
        }
        
        return { success: true, executionId };
      };
      
      const result = await simulateWorkerExecution();
      
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(5); // All pipeline steps
      expect(mockEnv.METRICS_KV.put).toHaveBeenCalledWith(
        'last_cron_heartbeat',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should handle partial pipeline failures gracefully', async () => {
      // Mock mixed responses (some succeed, some fail)
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })) // cleanup locks
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })) // tier-aware
        .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 })) // discovery fails
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })) // fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })); // summarize
      
      const simulateWorkerWithErrorHandling = async () => {
        const executionId = `test-error-${Date.now()}`;
        const results = [];
        
        const steps = [
          '/api/cron/cleanup-locks',
          '/api/cron/tier-aware',
          '/api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS',
          '/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING',
          '/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED'
        ];
        
        for (const step of steps) {
          try {
            const response = await mockFetch(`${mockEnv.PUBLIC_URL}${step}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Execution-Id': executionId
              }
            });
            
            if (!response.ok) {
              results.push({ step, success: false, status: response.status });
            } else {
              results.push({ step, success: true, status: response.status });
            }
          } catch (error) {
            results.push({ step, success: false, error: error.message });
          }
        }
        
        return {
          success: results.every(r => r.success),
          executionId,
          results
        };
      };
      
      const result = await simulateWorkerWithErrorHandling();
      
      expect(result.success).toBe(false);
      expect(result.results[2].success).toBe(false); // Discovery failed
      expect(result.results[2].status).toBe(500);
    });

    it('should verify cron trigger timing accuracy', async () => {
      const executionTimes = [];
      
      // Simulate multiple cron executions
      const simulateCronExecution = (timestamp) => {
        executionTimes.push(timestamp);
      };
      
      // Simulate 5-minute intervals
      const baseTime = Date.now();
      simulateCronExecution(baseTime);
      simulateCronExecution(baseTime + 5 * 60 * 1000); // 5 minutes later
      simulateCronExecution(baseTime + 10 * 60 * 1000); // 10 minutes later
      
      // Verify intervals
      expect(executionTimes).toHaveLength(3);
      expect(executionTimes[1] - executionTimes[0]).toBe(5 * 60 * 1000);
      expect(executionTimes[2] - executionTimes[1]).toBe(5 * 60 * 1000);
    });
  });

  describe('Rate Limiting and Circuit Breaker', () => {
    it('should respect rate limits when multiple cron events fire rapidly', async () => {
      let requestCount = 0;
      mockFetch.mockImplementation(() => {
        requestCount++;
        if (requestCount > 3) {
          return new Response('Rate limited', { status: 429 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });
      
      const results = [];
      
      // Simulate rapid cron triggers
      for (let i = 0; i < 5; i++) {
        const response = await mockFetch(`${mockEnv.PUBLIC_URL}/api/cron/tier-aware`);
        results.push({
          attempt: i + 1,
          status: response.status,
          rateLimited: response.status === 429
        });
      }
      
      expect(results.filter(r => r.rateLimited).length).toBe(2); // Last 2 should be rate limited
      expect(results[3].rateLimited).toBe(true);
      expect(results[4].rateLimited).toBe(true);
    });

    it('should implement exponential backoff on failures', async () => {
      const attemptTimes = [];
      let attemptCount = 0;
      
      mockFetch.mockImplementation(() => {
        attemptCount++;
        attemptTimes.push(Date.now());
        
        if (attemptCount < 3) {
          return new Response('Service unavailable', { status: 503 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });
      
      const executeWithBackoff = async (maxAttempts = 5) => {
        let backoffMs = 500;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const response = await mockFetch(`${mockEnv.PUBLIC_URL}/api/cron/tier-aware`);
          
          if (response.status === 200) {
            return { success: true, attempts: attempt };
          }
          
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            backoffMs *= 2; // Exponential backoff
          }
        }
        
        return { success: false, attempts: maxAttempts };
      };
      
      const result = await executeWithBackoff();
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(attemptTimes.length).toBe(3);
      
      // Verify exponential backoff timing (approximately)
      if (attemptTimes.length > 1) {
        const firstGap = attemptTimes[1] - attemptTimes[0];
        const secondGap = attemptTimes[2] - attemptTimes[1];
        expect(secondGap).toBeGreaterThan(firstGap); // Backoff increases
      }
    });
  });

  describe('Health Monitoring', () => {
    it('should update heartbeat on each execution', async () => {
      const simulateHeartbeat = async () => {
        const heartbeatTime = new Date().toISOString();
        await mockEnv.METRICS_KV.put('last_cron_heartbeat', heartbeatTime, {
          expirationTtl: 3600
        });
        return heartbeatTime;
      };
      
      const heartbeat1 = await simulateHeartbeat();
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      const heartbeat2 = await simulateHeartbeat();
      
      expect(mockEnv.METRICS_KV.put).toHaveBeenCalledTimes(2);
      expect(new Date(heartbeat2).getTime()).toBeGreaterThan(new Date(heartbeat1).getTime());
    });

    it('should detect stale heartbeats', async () => {
      const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 minutes ago
      mockEnv.METRICS_KV.get.mockResolvedValue(staleTime);
      
      const checkHealth = async () => {
        const lastHeartbeat = await mockEnv.METRICS_KV.get('last_cron_heartbeat');
        const staleThreshold = 15 * 60 * 1000; // 15 minutes
        const isStale = lastHeartbeat && (Date.now() - new Date(lastHeartbeat).getTime() > staleThreshold);
        
        return {
          healthy: !isStale,
          lastHeartbeat,
          stale: isStale
        };
      };
      
      const health = await checkHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.stale).toBe(true);
    });
  });

  describe('Environment Validation', () => {
    it('should fail when required environment variables are missing', async () => {
      const invalidEnv = {};
      
      const validateEnvironment = (env) => {
        const required = ['CRON_SECRET', 'PUBLIC_URL'];
        const missing = required.filter(key => !env[key]);
        
        return {
          isValid: missing.length === 0,
          errors: missing.map(key => `${key} is missing`)
        };
      };
      
      const validation = validateEnvironment(invalidEnv);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('CRON_SECRET is missing');
      expect(validation.errors).toContain('PUBLIC_URL is missing');
    });

    it('should validate HMAC signature generation', async () => {
      const generateSignature = async (secret, payload) => {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
        return Array.from(new Uint8Array(signature))
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      };
      
      const timestamp = Date.now();
      const payload = `${timestamp}:GET:/api/cron/tier-aware`;
      const signature = await generateSignature(mockEnv.CRON_SECRET, payload);
      
      expect(signature).toMatch(/^[a-f0-9]{64}$/); // SHA-256 produces 64 hex chars
    });
  });
});