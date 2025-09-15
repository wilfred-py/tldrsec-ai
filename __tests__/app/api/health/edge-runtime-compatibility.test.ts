/**
 * Health Route Edge Runtime Compatibility Tests
 * 
 * CRITICAL: Tests for health route behavior in different runtime environments
 * Covers Edge Runtime compatibility, PR #173 infrastructure checks, and resilience systems
 */

import { GET } from '../../../../app/api/health/route';
import { NextRequest } from 'next/server';

// Mock dependencies with runtime-aware behavior
jest.mock('../../../../lib/monitoring', () => ({
  monitoring: {
    checkHealth: jest.fn(),
    trackApiCall: jest.fn()
  }
}));

jest.mock('../../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => ({
    $executeRaw: jest.fn(),
    tickerMonitoring: {
      findFirst: jest.fn()
    }
  }))
}));

jest.mock('../../../../lib/resilience/circuit-breaker', () => ({
  CircuitBreakerRegistry: {
    getInstance: jest.fn(() => ({
      getAllMetrics: jest.fn(() => ({}))
    }))
  }
}));

jest.mock('../../../../lib/resilience/error-handling', () => ({
  GlobalErrorHandler: {
    getInstance: jest.fn(() => ({
      getStatistics: jest.fn(() => ({
        totalErrors: 0,
        recentErrors: [],
        errorsByCategory: {},
        errorsBySeverity: {},
        retryableErrors: 0,
        transientErrors: 0
      }))
    }))
  }
}));

import { monitoring } from '../../../../lib/monitoring';
import { getPrismaClient } from '../../../../lib/db/prisma';
import { CircuitBreakerRegistry } from '../../../../lib/resilience/circuit-breaker';
import { GlobalErrorHandler } from '../../../../lib/resilience/error-handling';

// Mock console methods
const mockConsole = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const originalConsole = {
  info: console.info,
  warn: console.warn,
  error: console.error
};

beforeEach(() => {
  Object.assign(console, mockConsole);
  jest.clearAllMocks();
  
  // Set up default successful mocks
  (monitoring.checkHealth as jest.Mock).mockResolvedValue({
    status: 'healthy',
    components: {
      database: { status: 'healthy' },
      redis: { status: 'healthy' }
    }
  });
  
  (getPrismaClient as jest.Mock).mockReturnValue({
    $executeRaw: jest.fn().mockResolvedValue([{ count: 1 }]),
    tickerMonitoring: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, version: 1, cik: 'test' })
    }
  });
});

afterEach(() => {
  Object.assign(console, originalConsole);
  // Clean up runtime environment
  delete (global as any).EdgeRuntime;
  delete (globalThis as any).EdgeRuntime;
  delete process.env.RUNTIME;
});

function createMockRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/health');
}

describe('Health Route Runtime Compatibility', () => {
  describe('Edge Runtime Environment Detection', () => {
    it('should handle Edge Runtime environment correctly', async () => {
      // Simulate Edge Runtime environment
      (globalThis as any).EdgeRuntime = 'workerd';
      process.env.RUNTIME = 'edge';
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.pr173_infrastructure.checks.environment.edge_runtime).toBe(true);
      expect(data.pr173_infrastructure.checks.environment.deployment_platform).toBe('VERCEL');
    });

    it('should handle Node.js runtime environment correctly', async () => {
      // Ensure no Edge Runtime indicators
      delete (global as any).EdgeRuntime;
      delete (globalThis as any).EdgeRuntime;
      delete process.env.RUNTIME;
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.pr173_infrastructure.checks.environment.edge_runtime).toBe(false);
    });

    it('should handle mixed runtime signals safely', async () => {
      // Conflicting runtime signals
      (global as any).EdgeRuntime = undefined;
      (globalThis as any).EdgeRuntime = 'workerd';
      process.env.RUNTIME = 'node';
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      // Should handle gracefully without crashing
      expect(response.status).toBe(200);
      expect(typeof data.pr173_infrastructure.checks.environment.edge_runtime).toBe('boolean');
    });
  });

  describe('Web Crypto API Compatibility', () => {
    it('should validate Web Crypto API in Edge Runtime', async () => {
      // Mock Edge Runtime with Web Crypto API
      (globalThis as any).EdgeRuntime = 'workerd';
      
      // Ensure crypto.subtle is available
      if (!globalThis.crypto?.subtle) {
        Object.defineProperty(globalThis, 'crypto', {
          value: {
            subtle: {
              digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
            }
          },
          writable: true
        });
      }
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.pr173_infrastructure.checks.web_crypto.status).toBe('healthy');
      expect(data.pr173_infrastructure.checks.web_crypto.edge_runtime_compatible).toBe(true);
    });

    it('should handle Web Crypto API failures gracefully', async () => {
      // Mock crypto.subtle failure
      const originalCrypto = globalThis.crypto;
      Object.defineProperty(globalThis, 'crypto', {
        value: {
          subtle: {
            digest: jest.fn().mockRejectedValue(new Error('Crypto not available'))
          }
        },
        writable: true
      });
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.pr173_infrastructure.checks.web_crypto.status).toBe('unhealthy');
      expect(data.pr173_infrastructure.checks.web_crypto.edge_runtime_compatible).toBe(false);
      
      // Restore original crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        writable: true
      });
    });

    it('should handle missing Web Crypto API', async () => {
      // Remove crypto API
      const originalCrypto = globalThis.crypto;
      delete (globalThis as any).crypto;
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.pr173_infrastructure.checks.web_crypto.status).toBe('unhealthy');
      
      // Restore crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        writable: true
      });
    });
  });

  describe('Database Schema Validation Edge Cases', () => {
    it('should handle Prisma client unavailable in Edge Runtime', async () => {
      (globalThis as any).EdgeRuntime = 'workerd';
      
      // Mock Prisma client failure
      (getPrismaClient as jest.Mock).mockImplementation(() => {
        throw new Error('PrismaClient is not available in Edge Runtime');
      });
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.pr173_infrastructure.checks.database_schema.status).toBe('unhealthy');
      expect(data.pr173_infrastructure.checks.database_schema.optimistic_locking_enabled).toBe(false);
    });

    it('should handle database connection timeout in Edge Runtime', async () => {
      (globalThis as any).EdgeRuntime = 'workerd';
      
      // Mock timeout
      const mockPrismaClient = {
        $executeRaw: jest.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 100)
          )
        )
      };
      (getPrismaClient as jest.Mock).mockReturnValue(mockPrismaClient);
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.pr173_infrastructure.checks.database_schema.status).toBe('unhealthy');
    });

    it('should validate optimistic locking schema correctly', async () => {
      // Mock successful schema validation
      const mockPrismaClient = {
        $executeRaw: jest.fn().mockResolvedValue([{ count: 1 }]),
        tickerMonitoring: {
          findFirst: jest.fn().mockResolvedValue({ id: 1, version: 5, cik: 'test' })
        }
      };
      (getPrismaClient as jest.Mock).mockReturnValue(mockPrismaClient);
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.pr173_infrastructure.checks.database_schema.status).toBe('healthy');
      expect(data.pr173_infrastructure.checks.database_schema.optimistic_locking_enabled).toBe(true);
      expect(data.pr173_infrastructure.checks.database_schema.version_column_exists).toBe(true);
      
      expect(data.pr173_infrastructure.checks.concurrency_system.status).toBe('healthy');
      expect(data.pr173_infrastructure.checks.concurrency_system.sample_version_field).toBe(5);
    });
  });

  describe('Security System Runtime Compatibility', () => {
    it('should validate timing-safe operations in Edge Runtime', async () => {
      (globalThis as any).EdgeRuntime = 'workerd';
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.pr173_infrastructure.checks.security_system.status).toBe('healthy');
      expect(data.pr173_infrastructure.checks.security_system.timing_safe_comparison).toBe(true);
      expect(data.pr173_infrastructure.checks.security_system.enhanced_security_ready).toBe(true);
    });

    it('should handle TextEncoder unavailable in restricted environments', async () => {
      // Mock TextEncoder failure
      const originalTextEncoder = globalThis.TextEncoder;
      delete (globalThis as any).TextEncoder;
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.pr173_infrastructure.checks.security_system.status).toBe('degraded');
      expect(data.pr173_infrastructure.checks.security_system.timing_safe_comparison).toBe(false);
      
      // Restore TextEncoder
      Object.defineProperty(globalThis, 'TextEncoder', {
        value: originalTextEncoder,
        writable: true
      });
    });
  });

  describe('Resilience System Runtime Compatibility', () => {
    it('should handle circuit breaker registry in Edge Runtime', async () => {
      (globalThis as any).EdgeRuntime = 'workerd';
      
      // Mock circuit breaker metrics
      const mockRegistry = {
        getAllMetrics: jest.fn().mockReturnValue({
          'database': {
            state: 'CLOSED',
            totalCalls: 100,
            successfulCalls: 98,
            averageResponseTime: 150,
            lastStateChange: new Date().toISOString()
          },
          'external-api': {
            state: 'HALF_OPEN',
            totalCalls: 50,
            successfulCalls: 45,
            averageResponseTime: 300,
            lastStateChange: new Date().toISOString()
          }
        })
      };
      
      (CircuitBreakerRegistry.getInstance as jest.Mock).mockReturnValue(mockRegistry);
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.resilience_systems.checks.circuit_breakers.status).toBe('degraded');
      expect(data.resilience_systems.checks.circuit_breakers.total).toBe(2);
      expect(data.resilience_systems.checks.circuit_breakers.half_open).toBe(1);
    });

    it('should handle error monitoring in Edge Runtime', async () => {
      (globalThis as any).EdgeRuntime = 'workerd';
      
      // Mock error handler with recent errors
      const mockErrorHandler = {
        getStatistics: jest.fn().mockReturnValue({
          totalErrors: 25,
          recentErrors: [
            { severity: 'CRITICAL', timestamp: new Date() },
            { severity: 'HIGH', timestamp: new Date() },
            { severity: 'MEDIUM', timestamp: new Date() }
          ],
          errorsByCategory: { 'database': 5, 'api': 20 },
          errorsBySeverity: { 'CRITICAL': 2, 'HIGH': 8, 'MEDIUM': 15 },
          retryableErrors: 15,
          transientErrors: 10
        })
      };
      
      (GlobalErrorHandler.getInstance as jest.Mock).mockReturnValue(mockErrorHandler);
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.resilience_systems.checks.error_monitoring.status).toBe('healthy');
      expect(data.resilience_systems.checks.error_monitoring.total_errors).toBe(25);
      expect(data.resilience_systems.checks.error_monitoring.critical_recent).toBe(2);
    });

    it('should handle resilience system failures gracefully', async () => {
      // Mock both circuit breaker and error handler failures
      (CircuitBreakerRegistry.getInstance as jest.Mock).mockImplementation(() => {
        throw new Error('Circuit breaker registry failed');
      });
      
      (GlobalErrorHandler.getInstance as jest.Mock).mockImplementation(() => {
        throw new Error('Error handler failed');
      });
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.resilience_systems.overall_status).toBe('unhealthy');
      expect(data.resilience_systems.checks.general_error).toBeDefined();
    });
  });

  describe('Overall Health Status Logic', () => {
    it('should correctly aggregate health status from all systems', async () => {
      // Mock partial failures
      const mockPrismaClient = {
        $executeRaw: jest.fn().mockRejectedValue(new Error('DB schema issue')),
        tickerMonitoring: {
          findFirst: jest.fn().mockResolvedValue(null)
        }
      };
      (getPrismaClient as jest.Mock).mockReturnValue(mockPrismaClient);
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      // Should downgrade overall status based on component failures
      expect(data.status).toBe('unhealthy');
      expect(data.pr173_infrastructure.overall_status).toBe('unhealthy');
    });

    it('should handle mixed degraded and healthy states', async () => {
      // Mock some degraded components
      const mockErrorHandler = {
        getStatistics: jest.fn().mockReturnValue({
          totalErrors: 100,
          recentErrors: Array(7).fill({ severity: 'CRITICAL', timestamp: new Date() }),
          errorsByCategory: {},
          errorsBySeverity: { CRITICAL: 7 },
          retryableErrors: 0,
          transientErrors: 0
        })
      };
      (GlobalErrorHandler.getInstance as jest.Mock).mockReturnValue(mockErrorHandler);
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      // Should show degraded status due to high error rate
      expect(data.resilience_systems.checks.error_monitoring.status).toBe('degraded');
      expect(data.resilience_systems.overall_status).toBe('degraded');
    });

    it('should maintain healthy status when all systems are operational', async () => {
      // All mocks already set to healthy state in beforeEach
      
      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.status).toBe('healthy');
      expect(data.pr173_infrastructure.overall_status).toBe('healthy');
      expect(data.resilience_systems.overall_status).toBe('healthy');
    });
  });

  describe('Response Headers and Caching', () => {
    it('should set appropriate cache headers for health checks', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      
      expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    });

    it('should return appropriate status codes based on health', async () => {
      // Test healthy response
      const healthyRequest = createMockRequest();
      const healthyResponse = await GET(healthyRequest);
      expect(healthyResponse.status).toBe(200);
      
      // Test unhealthy response
      (monitoring.checkHealth as jest.Mock).mockResolvedValue({
        status: 'unhealthy',
        components: {}
      });
      
      const unhealthyRequest = createMockRequest();
      const unhealthyResponse = await GET(unhealthyRequest);
      expect(unhealthyResponse.status).toBe(503);
    });

    it('should handle degraded status correctly', async () => {
      (monitoring.checkHealth as jest.Mock).mockResolvedValue({
        status: 'degraded',
        components: {}
      });
      
      const request = createMockRequest();
      const response = await GET(request);
      
      // Degraded should return 200 but with warning in body
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('degraded');
    });
  });
});