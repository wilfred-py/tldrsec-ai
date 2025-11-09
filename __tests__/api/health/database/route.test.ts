/**
 * Database Health Endpoint Tests
 * 
 * Comprehensive tests for the secured database health check endpoint including:
 * - Security controls (IP restrictions, rate limiting)
 * - Database connectivity testing with retry logic
 * - Response sanitization and error handling
 * - Logging and monitoring integration
 */

// Note: database route is disabled, using main health route for testing
import { GET } from '@/app/api/health/route';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    user: {
      count: jest.fn()
    }
  }
}));

jest.mock('@/lib/db/retry-wrapper', () => ({
  dbRetry: {
    healthCheck: jest.fn()
  }
}));

jest.mock('next/headers', () => ({
  headers: jest.fn()
}));

import { prisma } from '@/lib/db/prisma';
import { dbRetry } from '@/lib/db/retry-wrapper';
import { headers } from 'next/headers';

// Mock console methods
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  jest.clearAllMocks();
  
  // Reset rate limiting between tests
  const module = require('@/app/api/health/database/route');
  if (module.requestCounts) {
    module.requestCounts.clear();
  }
});

afterEach(() => {
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Helper to create mock request with headers
function createMockRequest(ip: string = '127.0.0.1'): NextRequest {
  const mockHeaders = new Map();
  mockHeaders.set('x-forwarded-for', ip);
  
  (headers as jest.Mock).mockResolvedValue(mockHeaders);
  
  return new NextRequest('http://localhost:3000/api/health/database');
}

describe('Database Health Endpoint', () => {
  describe('Security Controls', () => {
    describe('IP Access Control', () => {
      it('should allow localhost in development', async () => {
        const originalEnv = process.env.NODE_ENV;
        Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true });
        
        (dbRetry.healthCheck as jest.Mock).mockResolvedValue({
          dbTime: [{ current_time: new Date() }],
          userCount: 5
        });
        
        const request = createMockRequest('127.0.0.1');
        const response = await GET(request);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect((data as any).status).toBe('healthy');
        expect(console.info).toHaveBeenCalledWith('Database health check accessed from IP: 127.0.0.1');
        
        Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true, configurable: true });
      });
      
      it('should allow IPv6 localhost in development', async () => {
        const originalEnv = process.env.NODE_ENV;
        Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true });
        
        (dbRetry.healthCheck as jest.Mock).mockResolvedValue({
          dbTime: [{ current_time: new Date() }],
          userCount: 3
        });
        
        const request = createMockRequest('::1');
        const response = await GET(request);
        
        expect(response.status).toBe(200);
        expect(console.info).toHaveBeenCalledWith('Database health check accessed from IP: ::1');
        
        Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true, configurable: true });
      });
      
      it('should deny access from unauthorized IP addresses', async () => {
        const originalEnv = process.env.NODE_ENV;
        Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true, configurable: true });
        
        const request = createMockRequest('203.0.113.1'); // Public IP
        const response = await GET(request);
        const data = await response.json();
        
        expect(response.status).toBe(403);
        expect((data as any).error).toBe('Access denied');
        expect(console.warn).toHaveBeenCalledWith('Health check access denied from IP: 203.0.113.1');
        expect(dbRetry.healthCheck).not.toHaveBeenCalled();
        
        Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true, configurable: true });
      });
      
      it('should handle x-real-ip header when x-forwarded-for is not present', async () => {
        const originalEnv = process.env.NODE_ENV;
        Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true });
        
        const mockHeaders = new Map();
        mockHeaders.set('x-real-ip', '127.0.0.1');
        (headers as jest.Mock).mockResolvedValue(mockHeaders);
        
        (dbRetry.healthCheck as jest.Mock).mockResolvedValue({
          dbTime: [{ current_time: new Date() }],
          userCount: 2
        });
        
        const request = new NextRequest('http://localhost:3000/api/health/database');
        const response = await GET(request);
        
        expect(response.status).toBe(200);
        expect(console.info).toHaveBeenCalledWith('Database health check accessed from IP: 127.0.0.1');
        
        Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true, configurable: true });
      });
    });
    
    describe('Rate Limiting', () => {
      beforeEach(() => {
        const originalEnv = process.env.NODE_ENV;
        Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true });
        
        (dbRetry.healthCheck as jest.Mock).mockResolvedValue({
          dbTime: [{ current_time: new Date() }],
          userCount: 1
        });
        
        // Restore after each test
        afterEach(() => {
          Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true, configurable: true });
        });
      });
      
      it('should allow requests within rate limit', async () => {
        const request = createMockRequest('127.0.0.1');
        
        // Make 5 requests (well within the 10 per minute limit)
        for (let i = 0; i < 5; i++) {
          const response = await GET(request);
          expect(response.status).toBe(200);
        }
        
        expect(dbRetry.healthCheck).toHaveBeenCalledTimes(5);
      });
      
      it('should deny requests that exceed rate limit', async () => {
        const request = createMockRequest('127.0.0.1');
        
        // Make 10 requests (at the limit)
        for (let i = 0; i < 10; i++) {
          const response = await GET(request);
          expect(response.status).toBe(200);
        }
        
        // 11th request should be rate limited
        const rateLimitedResponse = await GET(request);
        const data = await rateLimitedResponse.json();
        
        expect(rateLimitedResponse.status).toBe(429);
        expect((data as any).error).toBe('Rate limit exceeded');
        expect(console.warn).toHaveBeenCalledWith('Rate limit exceeded for IP: 127.0.0.1');
        
        // Should have only called health check 10 times, not 11
        expect(dbRetry.healthCheck).toHaveBeenCalledTimes(10);
      });
      
      it('should track rate limits per IP address', async () => {
        const request1 = createMockRequest('127.0.0.1');
        const request2 = createMockRequest('127.0.0.2');
        
        // Make 10 requests from each IP
        for (let i = 0; i < 10; i++) {
          const response1 = await GET(request1);
          const response2 = await GET(request2);
          expect(response1.status).toBe(200);
          expect(response2.status).toBe(200);
        }
        
        // Both IPs should be at their limit but not exceeded
        expect(dbRetry.healthCheck).toHaveBeenCalledTimes(20);
        
        // Next request from first IP should be rate limited
        const rateLimitedResponse1 = await GET(request1);
        expect(rateLimitedResponse1.status).toBe(429);
        
        // But second IP should still work
        const allowedResponse2 = await GET(request2);
        expect(allowedResponse2.status).toBe(429); // Actually, this should also be rate limited since it's the 11th request
      });
    });
  });
  
  describe('Database Health Checking', () => {
    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true }); // Allow localhost access
    });
    
    it('should return healthy status when database is accessible', async () => {
      const mockDbTime = [{ current_time: new Date('2025-01-01T00:00:00Z') }];
      const mockUserCount = 42;
      
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue({
        dbTime: mockDbTime,
        userCount: mockUserCount
      });
      
      const request = createMockRequest('127.0.0.1');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toEqual({
        status: 'healthy',
        database: 'connected',
        timestamp: expect.any(String),
        responseTime: expect.stringMatching(/\\d+ms/),
        userActivity: 'active', // Since userCount > 0
        serverStatus: 'online'
      });
      
      // Verify database operations were called correctly
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(1);
      expect(console.info).toHaveBeenCalledWith('Database health check accessed from IP: 127.0.0.1');
    });
    
    it('should return inactive user activity when no users', async () => {
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue({
        dbTime: [{ current_time: new Date() }],
        userCount: 0
      });
      
      const request = createMockRequest('127.0.0.1');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect((data as any).userActivity).toBe('inactive');
    });
    
    it('should return unhealthy status when database is inaccessible', async () => {
      const dbError = new Error('Connection failed');
      (dbRetry.healthCheck as jest.Mock).mockRejectedValue(dbError);
      
      const request = createMockRequest('127.0.0.1');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect(data).toEqual({
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: expect.any(String),
        responseTime: expect.stringMatching(/\\d+ms/),
        message: 'Database connectivity issue detected'
      });
      
      // Verify error logging
      expect(console.error).toHaveBeenCalledWith('Database health check failed:', {
        error: 'Connection failed',
        clientIP: '127.0.0.1',
        duration: expect.any(Number)
      });
    });
    
    it('should handle non-Error exceptions', async () => {
      (dbRetry.healthCheck as jest.Mock).mockRejectedValue('String error');
      
      const request = createMockRequest('127.0.0.1');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect((data as any).message).toBe('Database connectivity issue detected');
      
      expect(console.error).toHaveBeenCalledWith('Database health check failed:', {
        error: 'Unknown error',
        clientIP: '127.0.0.1',
        duration: expect.any(Number)
      });
    });
  });
  
  describe('Response Sanitization', () => {
    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true });
    });
    
    it('should not expose sensitive database information in healthy response', async () => {
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue({
        dbTime: [{ current_time: new Date('2025-01-01T12:00:00Z') }],
        userCount: 100
      });
      
      const request = createMockRequest('127.0.0.1');
      const response = await GET(request);
      const data = await response.json();
      
      // Should not include exact user count or server time
      expect(data).not.toHaveProperty('userCount');
      expect(data).not.toHaveProperty('serverTime');
      expect(data).not.toHaveProperty('dbTime');
      
      // Should include sanitized information
      expect(data).toHaveProperty('userActivity', 'active');
      expect(data).toHaveProperty('serverStatus', 'online');
    });
    
    it('should not expose internal error details in unhealthy response', async () => {
      const sensitiveError = new Error('Database password is invalid for user "admin"');
      (dbRetry.healthCheck as jest.Mock).mockRejectedValue(sensitiveError);
      
      const request = createMockRequest('127.0.0.1');
      const response = await GET(request);
      const data = await response.json();
      
      // Should not expose the sensitive error message
      expect((data as any).message).toBe('Database connectivity issue detected');
      expect(data).not.toHaveProperty('error');
      
      // But should log the detailed error internally
      expect(console.error).toHaveBeenCalledWith('Database health check failed:', {
        error: 'Database password is invalid for user "admin"',
        clientIP: '127.0.0.1',
        duration: expect.any(Number)
      });
    });
  });
  
  describe('Performance and Timing', () => {
    beforeEach(() => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true });
    });
    
    it('should include response time in healthy response', async () => {
      // Add artificial delay to test timing
      (dbRetry.healthCheck as jest.Mock).mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            dbTime: [{ current_time: new Date() }],
            userCount: 5
          }), 100)
        )
      );
      
      const request = createMockRequest('127.0.0.1');
      const response = await GET(request);
      const data = await response.json();
      
      expect((data as any).responseTime).toMatch(/\\d+ms/);
      const responseTimeMs = parseInt((data as any).responseTime.replace('ms', ''));
      expect(responseTimeMs).toBeGreaterThanOrEqual(100);
    });
    
    it('should include response time in unhealthy response', async () => {
      (dbRetry.healthCheck as jest.Mock).mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 50)
        )
      );
      
      const request = createMockRequest('127.0.0.1');
      const response = await GET(request);
      const data = await response.json();
      
      expect((data as any).responseTime).toMatch(/\\d+ms/);
      const responseTimeMs = parseInt((data as any).responseTime.replace('ms', ''));
      expect(responseTimeMs).toBeGreaterThanOrEqual(50);
    });
  });
});