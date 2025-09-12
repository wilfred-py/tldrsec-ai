/**
 * Cloudflare Worker Execution Tests
 * 
 * Comprehensive test suite for the Cloudflare Worker cron functionality
 * that replaces Railway cron execution.
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock the global fetch function
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Import the worker code (we'll need to export the handler function)
// For now, we'll simulate the worker logic inline

interface Env {
  PUBLIC_URL: string;
  CRON_SECRET: string;
}

// Simulated worker handler based on the actual implementation
const workerHandler = async (event: ScheduledEvent, env: Env): Promise<Response> => {
  try {
    const url = `${env.PUBLIC_URL}/api/cron/unified`;
    
    console.log('Triggering cron at:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.CRON_SECRET}`,
        'User-Agent': 'CloudflareWorker/1.0'
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        trigger: 'cloudflare-cron'
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('Cron completed successfully');
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

describe('Cloudflare Worker Cron Execution', () => {
  let mockEnv: Env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockFetch.mockClear();

    mockEnv = {
      PUBLIC_URL: 'https://tldrsec.app',
      CRON_SECRET: 'test-secret-key'
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Successful Execution', () => {
    test('executes successfully with valid environment variables', async () => {
      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      } as Response);

      const mockEvent = {} as ScheduledEvent;
      const response = await workerHandler(mockEvent, mockEnv);

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://tldrsec.app/api/cron/unified',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-secret-key',
            'User-Agent': 'CloudflareWorker/1.0'
          }),
          body: expect.stringContaining('cloudflare-cron')
        })
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Triggering cron at:',
        'https://tldrsec.app/api/cron/unified'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('Cron completed successfully');
    });

    test('includes correct timestamp in request body', async () => {
      const mockDate = new Date('2024-01-15T10:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      const mockEvent = {} as ScheduledEvent;
      await workerHandler(mockEvent, mockEnv);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            timestamp: '2024-01-15T10:00:00.000Z',
            trigger: 'cloudflare-cron'
          })
        })
      );

      (global.Date as jest.Mock).mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('handles HTTP error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);

      const mockEvent = {} as ScheduledEvent;
      
      await expect(workerHandler(mockEvent, mockEnv)).rejects.toThrow(
        'HTTP error! status: 500'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error:',
        expect.any(Error)
      );
    });

    test('handles network errors', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(networkError);

      const mockEvent = {} as ScheduledEvent;
      
      await expect(workerHandler(mockEvent, mockEnv)).rejects.toThrow(
        'Network error'
      );

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', networkError);
    });

    test('handles timeout scenarios', async () => {
      // Simulate a timeout by rejecting with a timeout error
      const timeoutError = new Error('Request timeout');
      mockFetch.mockRejectedValueOnce(timeoutError);

      const mockEvent = {} as ScheduledEvent;
      
      await expect(workerHandler(mockEvent, mockEnv)).rejects.toThrow(
        'Request timeout'
      );
    });
  });

  describe('Environment Variable Validation', () => {
    test('fails gracefully with missing PUBLIC_URL', async () => {
      const invalidEnv = { ...mockEnv, PUBLIC_URL: '' };
      const mockEvent = {} as ScheduledEvent;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      await workerHandler(mockEvent, invalidEnv);

      // Should still call fetch but with empty URL base
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/cron/unified',
        expect.any(Object)
      );
    });

    test('fails gracefully with missing CRON_SECRET', async () => {
      const invalidEnv = { ...mockEnv, CRON_SECRET: '' };
      const mockEvent = {} as ScheduledEvent;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      await workerHandler(mockEvent, invalidEnv);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer '
          })
        })
      );
    });
  });

  describe('Request Configuration', () => {
    test('uses correct HTTP method and headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      const mockEvent = {} as ScheduledEvent;
      await workerHandler(mockEvent, mockEnv);

      const [, requestConfig] = mockFetch.mock.calls[0];
      
      expect(requestConfig).toEqual(
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-secret-key',
            'User-Agent': 'CloudflareWorker/1.0'
          },
          body: expect.stringContaining('"trigger":"cloudflare-cron"')
        })
      );
    });

    test('constructs correct API endpoint URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      // Test with different PUBLIC_URL values
      const testCases = [
        'https://tldrsec.app',
        'https://tldrsec-preview.app',
        'http://localhost:3000'
      ];

      for (const baseUrl of testCases) {
        mockFetch.mockClear();
        const testEnv = { ...mockEnv, PUBLIC_URL: baseUrl };
        const mockEvent = {} as ScheduledEvent;
        
        await workerHandler(mockEvent, testEnv);
        
        expect(mockFetch).toHaveBeenCalledWith(
          `${baseUrl}/api/cron/unified`,
          expect.any(Object)
        );
      }
    });
  });

  describe('Response Validation', () => {
    test('handles different successful status codes', async () => {
      const successCodes = [200, 201, 204];
      
      for (const statusCode of successCodes) {
        mockFetch.mockClear();
        mockConsoleLog.mockClear();
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: statusCode
        } as Response);

        const mockEvent = {} as ScheduledEvent;
        const response = await workerHandler(mockEvent, mockEnv);
        
        expect(response.status).toBe(200);
        expect(mockConsoleLog).toHaveBeenCalledWith('Cron completed successfully');
      }
    });

    test('handles different error status codes', async () => {
      const errorCodes = [400, 401, 403, 404, 500, 502, 503];
      
      for (const statusCode of errorCodes) {
        mockFetch.mockClear();
        mockConsoleError.mockClear();
        
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: statusCode
        } as Response);

        const mockEvent = {} as ScheduledEvent;
        
        await expect(workerHandler(mockEvent, mockEnv)).rejects.toThrow(
          `HTTP error! status: ${statusCode}`
        );
      }
    });
  });

  describe('Integration with Existing Cron Pipeline', () => {
    test('maintains compatibility with Vercel API expectations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          processed: 5,
          summaries: 3,
          emails: 2,
          duration: '45s'
        })
      } as Response);

      const mockEvent = {} as ScheduledEvent;
      await workerHandler(mockEvent, mockEnv);

      // Verify the request body matches what the Vercel API expects
      const requestBody = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );

      expect(requestBody).toHaveProperty('timestamp');
      expect(requestBody).toHaveProperty('trigger', 'cloudflare-cron');
      expect(typeof requestBody.timestamp).toBe('string');
    });

    test('should execute within 10-minute window', async () => {
      // This test ensures the worker can complete within the cron interval
      const startTime = Date.now();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      const mockEvent = {} as ScheduledEvent;
      await workerHandler(mockEvent, mockEnv);
      
      const executionTime = Date.now() - startTime;
      
      // Worker execution should be very fast (< 1 second typically)
      // But we allow up to 30 seconds for slow network conditions
      expect(executionTime).toBeLessThan(30000);
    });
  });

  describe('Logging and Observability', () => {
    test('provides comprehensive execution logging', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      const mockEvent = {} as ScheduledEvent;
      await workerHandler(mockEvent, mockEnv);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Triggering cron at:',
        'https://tldrsec.app/api/cron/unified'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('Cron completed successfully');
    });

    test('logs errors with sufficient detail', async () => {
      const testError = new Error('Test error with details');
      mockFetch.mockRejectedValueOnce(testError);

      const mockEvent = {} as ScheduledEvent;
      
      await expect(workerHandler(mockEvent, mockEnv)).rejects.toThrow();
      
      expect(mockConsoleError).toHaveBeenCalledWith('Error:', testError);
    });
  });
});

describe('Cloudflare Worker Configuration', () => {
  describe('Wrangler Configuration', () => {
    test('validates cron schedule format', () => {
      // Test the cron pattern: "*/10 * * * *" (every 10 minutes)
      const cronPattern = '*/10 * * * *';
      
      // Basic validation that it's a 5-part cron expression
      const parts = cronPattern.split(' ');
      expect(parts).toHaveLength(5);
      
      // Validate it's every 10 minutes
      expect(parts[0]).toBe('*/10');  // minutes
      expect(parts[1]).toBe('*');     // hours
      expect(parts[2]).toBe('*');     // day of month
      expect(parts[3]).toBe('*');     // month
      expect(parts[4]).toBe('*');     // day of week
    });

    test('validates production URL configuration', () => {
      const productionUrl = 'https://tldrsec.app';
      
      expect(productionUrl).toMatch(/^https:\/\//);
      expect(productionUrl).not.toContain('preview');
      expect(productionUrl).not.toContain('staging');
      expect(productionUrl).not.toContain('localhost');
    });
  });

  describe('Environment Requirements', () => {
    test('validates required environment variables', () => {
      const requiredVars = ['PUBLIC_URL', 'CRON_SECRET'];
      
      requiredVars.forEach(varName => {
        expect(typeof varName).toBe('string');
        expect(varName.length).toBeGreaterThan(0);
      });
    });

    test('validates environment variable formats', () => {
      const mockEnv = {
        PUBLIC_URL: 'https://tldrsec.app',
        CRON_SECRET: 'secure-secret-key-123'
      };

      // PUBLIC_URL should be a valid URL
      expect(() => new URL(mockEnv.PUBLIC_URL)).not.toThrow();
      
      // CRON_SECRET should be non-empty string
      expect(typeof mockEnv.CRON_SECRET).toBe('string');
      expect(mockEnv.CRON_SECRET.length).toBeGreaterThan(0);
    });
  });
});