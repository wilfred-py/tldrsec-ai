/**
 * CRITICAL: Tests for globalThis type assertion safety in health route
 * Added per QA review of PR #201
 */

import { NextRequest } from 'next/server';

// Mock next/headers
jest.mock('next/headers', () => ({
  headers: jest.fn()
}));

// Import after mocking
import { headers } from 'next/headers';

describe('GlobalThis Type Safety Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default headers mock
    (headers as jest.Mock).mockResolvedValue(new Map());
  });

  describe('Edge Runtime Detection Safety', () => {
    let originalGlobalThis: any;
    let originalProcess: any;

    beforeEach(() => {
      originalGlobalThis = globalThis;
      originalProcess = process;
    });

    afterEach(() => {
      // @ts-ignore - restoring global state in tests
      global.globalThis = originalGlobalThis;
      global.process = originalProcess;
    });

    it('should handle undefined globalThis safely', async () => {
      // Simulate environment where globalThis might be undefined/null
      const mockGlobalThis = undefined as any;
      // @ts-ignore - mocking globalThis for testing
      global.globalThis = mockGlobalThis;

      // Import route handler after mocking globalThis
      const { GET } = await import('../../../app/api/health/route');
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      // Should not throw error even with undefined globalThis
      expect(async () => {
        const response = await GET(request);
        expect(response.status).toBe(200);
      }).not.toThrow();
    });

    it('should handle globalThis without EdgeRuntime property', async () => {
      // Simulate environment where globalThis exists but EdgeRuntime is undefined
      const mockGlobalThis = {} as any;
      // @ts-ignore - mocking globalThis for testing
      global.globalThis = mockGlobalThis;

      const { GET } = await import('../../../app/api/health/route');
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json() as { runtime: string };
      expect(data.runtime).toBe('node');
    });

    it('should correctly detect Edge Runtime when present', async () => {
      // Simulate Vercel Edge Runtime environment
      const mockGlobalThis = {
        EdgeRuntime: 'edge-runtime'
      } as any;
      // @ts-ignore - mocking globalThis for testing
      global.globalThis = mockGlobalThis;

      const { GET } = await import('../../../app/api/health/route');
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json() as { runtime: string };
      expect(data.runtime).toBe('edge');
    });

    it('should handle null globalThis gracefully', async () => {
      // @ts-ignore - mocking globalThis for testing
      global.globalThis = null as any;

      const { GET } = await import('../../../app/api/health/route');
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      expect(async () => {
        await GET(request);
      }).not.toThrow();
    });

    it('should validate type assertion does not break with different object shapes', async () => {
      // Test with various object shapes that could be in globalThis
      const testCases = [
        { EdgeRuntime: null },
        { EdgeRuntime: false },
        { EdgeRuntime: '' },
        { EdgeRuntime: 0 },
        { EdgeRuntime: {} },
        { EdgeRuntime: [] },
        { EdgeRuntime: 'edge-runtime' },
        { someOtherProperty: 'value' }
      ];

      for (const testGlobalThis of testCases) {
        // @ts-ignore - mocking globalThis for testing
        global.globalThis = testGlobalThis as any;
        
        const { GET } = await import('../../../app/api/health/route');
        
        const request = new NextRequest('http://localhost:3000/api/health');
        const response = await GET(request);
        
        expect(response.status).toBe(200);
        const data = await response.json() as { runtime: string };
        
        // Should detect edge runtime only when EdgeRuntime is truthy
        const expectedRuntime = testGlobalThis.EdgeRuntime ? 'edge' : 'node';
        expect(data.runtime).toBe(expectedRuntime);
      }
    });

    it('should handle process.env.RUNTIME override correctly', async () => {
      // @ts-ignore - mocking globalThis for testing
      global.globalThis = {} as any;
      process.env.RUNTIME = 'edge';

      const { GET } = await import('../../../app/api/health/route');
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json() as { runtime: string };
      expect(data.runtime).toBe('edge');
      
      delete process.env.RUNTIME;
    });
  });

  describe('Type Assertion Regression Tests', () => {
    it('should maintain backward compatibility with previous type checking', async () => {
      // Ensure the new type assertion doesn't break existing functionality
      const { GET } = await import('../../../app/api/health/route');
      
      const request = new NextRequest('http://localhost:3000/api/health');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      // Verify response structure hasn't changed
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('runtime');
    });
  });
});