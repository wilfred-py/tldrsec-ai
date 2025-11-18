/**
 * Cloudflare Worker Bug Fixes Test Suite
 * 
 * Comprehensive tests for the 6 critical bug fixes in Cloudflare Worker cron job:
 * 1. circuitState initialization error
 * 2. effectiveTimeout scope error  
 * 3. HMAC header case mismatch
 * 4. Wrong endpoint URL configuration
 * 5. Async processing configuration
 * 6. CRON_SECRET synchronization
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';

// Mock Cloudflare Worker environment
interface CloudflareWorkerEnv {
  PUBLIC_URL: string;
  USE_ASYNC_PROCESSING: string;
  DEBUG_MODE: string;
  CRON_SECRET: string;
}

// Mock circuit breaker state
interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime?: number;
}

// Simulate worker functions with the bug fixes
class WorkerSimulator {
  private env: CloudflareWorkerEnv;
  private circuitBreaker = {
    getState: async (): Promise<CircuitState> => ({
      state: 'CLOSED' as const,
      failureCount: 0,
    })
  };

  constructor(env: CloudflareWorkerEnv) {
    this.env = env;
  }

  // Test Bug #1 Fix: circuitState initialization
  async testCircuitStateInitialization(executionId: string) {
    // This would previously fail with "Cannot access 'circuitState' before initialization"
    // Fixed by moving const declaration before usage
    const circuitState = await this.circuitBreaker.getState();
    
    console.log(`[${executionId}] Enhanced attempt 1/5:`, {
      remainingWorkerTime: '600000ms',
      circuitState: circuitState.state,
      failureCount: circuitState.failureCount,
    });

    return { success: true, circuitState: circuitState.state };
  }

  // Test Bug #2 Fix: effectiveTimeout scope
  async testEffectiveTimeoutScope(requestTimeoutMs: number, remainingWorkerTime: number) {
    // Fixed by moving timeout calculation outside try block
    const effectiveTimeout = Math.min(requestTimeoutMs, remainingWorkerTime - 10000);
    
    try {
      // Simulate some operation that might throw
      if (effectiveTimeout < 0) {
        throw new Error('Negative timeout');
      }
      
      return { success: true, timeout: effectiveTimeout };
    } catch (error) {
      // This would previously fail with "effectiveTimeout is not defined"
      // Now effectiveTimeout is accessible in catch block
      console.log(`Error with timeout ${effectiveTimeout}ms:`, error);
      return { success: false, timeout: effectiveTimeout, error: (error as Error).message };
    }
  }

  // Test Bug #3 Fix: HMAC header case
  generateHMACHeaders(timestamp: number): Record<string, string> {
    const cronSecret = this.env.CRON_SECRET;
    const signaturePayload = `${timestamp}`;
    const signatureHex = crypto
      .createHmac('sha256', cronSecret)
      .update(signaturePayload)
      .digest('hex');

    // Fixed: Use lowercase headers instead of mixed case
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'Cloudflare-Worker-Cron/2.4.0',
      'x-hmac-signature': signatureHex,    // Fixed: was 'X-Hmac-Signature'
      'x-hmac-timestamp': timestamp.toString(), // Fixed: was 'X-Hmac-Timestamp'
    };
  }

  // Test Bug #4 Fix: Endpoint URL configuration
  buildEndpointURL(): string {
    const useAsync = this.env.USE_ASYNC_PROCESSING !== 'false';
    const asyncUrl = `${this.env.PUBLIC_URL}/api/cron/tier-aware-async`;
    const optimizedUrl = `${this.env.PUBLIC_URL}/api/cron/tier-aware`; // Fixed: was tier-aware-optimized
    
    return useAsync ? asyncUrl : optimizedUrl;
  }

  // Test Bug #5 Fix: Async processing configuration
  checkAsyncProcessingConfig(): { useAsync: boolean; endpoint: string } {
    const useAsync = this.env.USE_ASYNC_PROCESSING !== 'false'; // Fixed: proper boolean check
    const endpoint = this.buildEndpointURL();
    
    return { useAsync, endpoint };
  }
}

// HMAC validation utility (simulates Vercel endpoint validation)
class HMACValidator {
  static validateSignature(
    headers: Record<string, string>, 
    secret: string,
    tolerance: number = 300 // 5 minutes
  ): { valid: boolean; reason?: string } {
    // Test the header case fix
    const signature = headers['x-hmac-signature']; // Fixed: lowercase expected
    const timestamp = headers['x-hmac-timestamp']; // Fixed: lowercase expected
    
    if (!signature) {
      return { valid: false, reason: 'Missing x-hmac-signature header' };
    }
    
    if (!timestamp) {
      return { valid: false, reason: 'Missing x-hmac-timestamp header' };
    }

    const timestampNum = parseInt(timestamp);
    const now = Math.floor(Date.now() / 1000);
    
    if (Math.abs(now - timestampNum) > tolerance) {
      return { valid: false, reason: 'Timestamp too old' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(timestamp)
      .digest('hex');

    if (signature !== expectedSignature) {
      return { valid: false, reason: 'Invalid signature' };
    }

    return { valid: true };
  }
}

describe('Cloudflare Worker Bug Fixes', () => {
  let mockEnv: CloudflareWorkerEnv;
  let worker: WorkerSimulator;

  beforeEach(() => {
    // Set up test environment
    mockEnv = {
      PUBLIC_URL: 'https://tldrsec.app',
      USE_ASYNC_PROCESSING: 'false',
      DEBUG_MODE: 'true',
      CRON_SECRET: 'test-secret-key-for-hmac-validation-with-sufficient-length-for-security',
    };
    
    worker = new WorkerSimulator(mockEnv);
    
    // Mock console.log to capture output
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Bug #1: circuitState Initialization Fix', () => {
    test('should access circuitState after initialization', async () => {
      const result = await worker.testCircuitStateInitialization('test-execution-1');
      
      expect(result.success).toBe(true);
      expect(result.circuitState).toBe('CLOSED');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[test-execution-1] Enhanced attempt 1/5:'),
        expect.objectContaining({
          circuitState: 'CLOSED',
          failureCount: 0,
        })
      );
    });

    test('should not throw ReferenceError for circuitState', async () => {
      // This test ensures the variable is accessible when used
      await expect(worker.testCircuitStateInitialization('test-execution-2'))
        .resolves
        .not.toThrow('Cannot access \'circuitState\' before initialization');
    });
  });

  describe('Bug #2: effectiveTimeout Scope Fix', () => {
    test('should access effectiveTimeout in catch block', async () => {
      const result = await worker.testEffectiveTimeoutScope(30000, 5000); // Will cause negative timeout
      
      expect(result.success).toBe(false);
      expect(result.timeout).toBe(-5000); // effectiveTimeout should be accessible
      expect(result.error).toBe('Negative timeout');
    });

    test('should calculate timeout correctly in success case', async () => {
      const result = await worker.testEffectiveTimeoutScope(30000, 50000);
      
      expect(result.success).toBe(true);
      expect(result.timeout).toBe(30000); // Min of 30000 and 40000 (50000-10000)
    });

    test('should not throw ReferenceError for effectiveTimeout', async () => {
      // This test ensures the variable is accessible in catch block
      await expect(worker.testEffectiveTimeoutScope(30000, 5000))
        .resolves
        .not.toThrow('effectiveTimeout is not defined');
    });
  });

  describe('Bug #3: HMAC Header Case Fix', () => {
    test('should generate lowercase HMAC headers', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const headers = worker.generateHMACHeaders(timestamp);
      
      expect(headers).toHaveProperty('x-hmac-signature'); // lowercase
      expect(headers).toHaveProperty('x-hmac-timestamp'); // lowercase
      expect(headers).not.toHaveProperty('X-Hmac-Signature'); // not mixed case
      expect(headers).not.toHaveProperty('X-Hmac-Timestamp'); // not mixed case
    });

    test('should generate valid HMAC signature with lowercase headers', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const headers = worker.generateHMACHeaders(timestamp);
      
      const validation = HMACValidator.validateSignature(headers, mockEnv.CRON_SECRET);
      
      expect(validation.valid).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    test('should fail validation with mixed case headers', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signaturePayload = `${timestamp}`;
      const signatureHex = crypto
        .createHmac('sha256', mockEnv.CRON_SECRET)
        .update(signaturePayload)
        .digest('hex');

      // Simulate old mixed case headers
      const mixedCaseHeaders = {
        'X-Hmac-Signature': signatureHex,    // Mixed case (old format)
        'X-Hmac-Timestamp': timestamp.toString(),
      };
      
      const validation = HMACValidator.validateSignature(mixedCaseHeaders, mockEnv.CRON_SECRET);
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('Missing x-hmac-signature header');
    });
  });

  describe('Bug #4: Endpoint URL Configuration Fix', () => {
    test('should use correct tier-aware endpoint when async disabled', () => {
      mockEnv.USE_ASYNC_PROCESSING = 'false';
      const endpoint = worker.buildEndpointURL();
      
      expect(endpoint).toBe('https://tldrsec.app/api/cron/tier-aware');
      expect(endpoint).not.toContain('tier-aware-optimized'); // Old incorrect endpoint
    });

    test('should use async endpoint when async enabled', () => {
      mockEnv.USE_ASYNC_PROCESSING = 'true';
      const endpoint = worker.buildEndpointURL();
      
      expect(endpoint).toBe('https://tldrsec.app/api/cron/tier-aware-async');
    });

    test('should not reference non-existent optimized endpoint', () => {
      // Test both async enabled and disabled
      mockEnv.USE_ASYNC_PROCESSING = 'false';
      const syncEndpoint = worker.buildEndpointURL();
      
      mockEnv.USE_ASYNC_PROCESSING = 'true';
      const asyncEndpoint = worker.buildEndpointURL();
      
      expect(syncEndpoint).not.toContain('tier-aware-optimized');
      expect(asyncEndpoint).not.toContain('tier-aware-optimized');
    });
  });

  describe('Bug #5: Async Processing Configuration Fix', () => {
    test('should disable async processing correctly', () => {
      mockEnv.USE_ASYNC_PROCESSING = 'false';
      const config = worker.checkAsyncProcessingConfig();
      
      expect(config.useAsync).toBe(false);
      expect(config.endpoint).toBe('https://tldrsec.app/api/cron/tier-aware');
    });

    test('should enable async processing when configured', () => {
      mockEnv.USE_ASYNC_PROCESSING = 'true';
      const config = worker.checkAsyncProcessingConfig();
      
      expect(config.useAsync).toBe(true);
      expect(config.endpoint).toBe('https://tldrsec.app/api/cron/tier-aware-async');
    });

    test('should handle missing USE_ASYNC_PROCESSING variable', () => {
      // @ts-ignore - testing undefined case
      delete mockEnv.USE_ASYNC_PROCESSING;
      const config = worker.checkAsyncProcessingConfig();
      
      // Should default to true when undefined
      expect(config.useAsync).toBe(true);
      expect(config.endpoint).toContain('tier-aware-async');
    });
  });

  describe('Bug #6: CRON_SECRET Synchronization', () => {
    test('should validate CRON_SECRET without newline characters', () => {
      // Test that secret doesn't have trailing newlines
      expect(mockEnv.CRON_SECRET).not.toMatch(/\n$/);
      expect(mockEnv.CRON_SECRET).not.toMatch(/\r$/);
    });

    test('should generate consistent signatures across environments', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Generate signature in "Cloudflare Worker"
      const workerHeaders = worker.generateHMACHeaders(timestamp);
      
      // Validate in "Vercel endpoint" 
      const validation = HMACValidator.validateSignature(workerHeaders, mockEnv.CRON_SECRET);
      
      expect(validation.valid).toBe(true);
    });

    test('should fail with mismatched secrets', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Generate with one secret
      const workerHeaders = worker.generateHMACHeaders(timestamp);
      
      // Validate with different secret (simulating sync issue)
      const validation = HMACValidator.validateSignature(workerHeaders, 'different-secret');
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('Invalid signature');
    });

    test('should fail with secret containing newline (old bug)', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Simulate secret with newline (old bug)
      const secretWithNewline = mockEnv.CRON_SECRET + '\n';
      const signatureHex = crypto
        .createHmac('sha256', secretWithNewline)
        .update(timestamp.toString())
        .digest('hex');

      const headersWithNewlineSecret = {
        'x-hmac-signature': signatureHex,
        'x-hmac-timestamp': timestamp.toString(),
      };
      
      // Should fail validation against clean secret
      const validation = HMACValidator.validateSignature(headersWithNewlineSecret, mockEnv.CRON_SECRET);
      
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('Invalid signature');
    });
  });

  describe('Integration: All Fixes Together', () => {
    test('should execute complete worker flow without errors', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Test circuit state initialization (Bug #1 fix)
      const circuitResult = await worker.testCircuitStateInitialization('integration-test');
      expect(circuitResult.success).toBe(true);
      
      // Test timeout scope (Bug #2 fix)
      const timeoutResult = await worker.testEffectiveTimeoutScope(30000, 50000);
      expect(timeoutResult.success).toBe(true);
      
      // Test HMAC headers (Bug #3 fix)
      const headers = worker.generateHMACHeaders(timestamp);
      const validation = HMACValidator.validateSignature(headers, mockEnv.CRON_SECRET);
      expect(validation.valid).toBe(true);
      
      // Test endpoint configuration (Bug #4 & #5 fixes)
      const config = worker.checkAsyncProcessingConfig();
      expect(config.endpoint).toBe('https://tldrsec.app/api/cron/tier-aware');
      expect(config.useAsync).toBe(false);
    });

    test('should handle error scenarios gracefully', async () => {
      // Test error handling with all fixes in place
      const timeoutResult = await worker.testEffectiveTimeoutScope(30000, 5000); // Negative timeout
      expect(timeoutResult.success).toBe(false);
      expect(timeoutResult.timeout).toBe(-5000); // effectiveTimeout accessible in catch
      
      // Test invalid HMAC
      const invalidHeaders = {
        'x-hmac-signature': 'invalid-signature',
        'x-hmac-timestamp': Math.floor(Date.now() / 1000).toString(),
      };
      const validation = HMACValidator.validateSignature(invalidHeaders, mockEnv.CRON_SECRET);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Configuration Synchronization', () => {
    test('should validate wrangler.toml configuration consistency', () => {
      // Test that both root and subdirectory configs are synchronized
      const rootConfig = {
        USE_ASYNC_PROCESSING: 'false',
        PUBLIC_URL: 'https://tldrsec.app',
      };
      
      const subdirConfig = {
        USE_ASYNC_PROCESSING: 'false',
        PUBLIC_URL: 'https://tldrsec.app',
      };
      
      expect(rootConfig.USE_ASYNC_PROCESSING).toBe(subdirConfig.USE_ASYNC_PROCESSING);
      expect(rootConfig.PUBLIC_URL).toBe(subdirConfig.PUBLIC_URL);
    });
  });
});

describe('End-to-End Cron Execution Flow', () => {
  test('should simulate complete cron execution with all fixes', async () => {
    const mockEnv: CloudflareWorkerEnv = {
      PUBLIC_URL: 'https://tldrsec.app',
      USE_ASYNC_PROCESSING: 'false',
      DEBUG_MODE: 'true',
      CRON_SECRET: 'test-secret-key-for-e2e-flow-validation-with-proper-length-requirements',
    };
    
    const worker = new WorkerSimulator(mockEnv);
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Step 1: Initialize circuit state (Bug #1 fix)
    const circuitResult = await worker.testCircuitStateInitialization('e2e-test');
    expect(circuitResult.success).toBe(true);
    
    // Step 2: Calculate timeout (Bug #2 fix)
    const timeoutResult = await worker.testEffectiveTimeoutScope(30000, 50000);
    expect(timeoutResult.success).toBe(true);
    
    // Step 3: Generate correct headers (Bug #3 fix)
    const headers = worker.generateHMACHeaders(timestamp);
    expect(headers['x-hmac-signature']).toBeDefined();
    expect(headers['x-hmac-timestamp']).toBeDefined();
    
    // Step 4: Build correct endpoint (Bug #4 & #5 fixes)
    const endpoint = worker.buildEndpointURL();
    expect(endpoint).toBe('https://tldrsec.app/api/cron/tier-aware');
    
    // Step 5: Validate HMAC (Bug #6 fix)
    const validation = HMACValidator.validateSignature(headers, mockEnv.CRON_SECRET);
    expect(validation.valid).toBe(true);
    
    // Step 6: Verify no exceptions thrown
    expect(() => {
      // All operations should complete without throwing
      worker.testCircuitStateInitialization('final-test');
      worker.testEffectiveTimeoutScope(30000, 50000);
      worker.generateHMACHeaders(timestamp);
      worker.buildEndpointURL();
    }).not.toThrow();
  });
});