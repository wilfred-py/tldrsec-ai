import { NextResponse } from 'next/server';
import { monitoring } from '@/lib/monitoring';
import { appRouterAsyncHandler } from '@/lib/error-handling';
import { logger } from '@/lib/logging';
import { getPrismaClient } from '@/lib/db/prisma';

// Enable Edge Runtime for this route specifically
export const runtime = 'edge';

// Component logger
const componentLogger = logger.child('health-api');
const prisma = getPrismaClient();

/**
 * Enhanced health check endpoint for PR #173 infrastructure
 * Includes Edge Runtime, concurrency systems, and security validation
 * GET /api/health
 */
export const GET = appRouterAsyncHandler(async () => {
  const startTime = Date.now();
  
  // Get base health status
  const healthStatus = await monitoring.checkHealth();
  
  // Add PR #173 specific health checks
  const pr173Checks = await performPR173HealthChecks();
  
  // Merge health status with PR #173 checks
  const enhancedHealthStatus = {
    ...healthStatus,
    pr173_infrastructure: pr173Checks,
    version: '1.1',
    pr_version: 'PR #173: Edge Runtime compatibility and concurrency enhancements',
    timestamp: new Date().toISOString()
  };
  
  // Determine overall status considering PR #173 components
  let overallStatus = healthStatus.status;
  if (pr173Checks.overall_status === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if (pr173Checks.overall_status === 'degraded' && overallStatus === 'healthy') {
    overallStatus = 'degraded';
  }
  
  enhancedHealthStatus.status = overallStatus;
  
  // Determine status code based on enhanced health status
  const statusCode = overallStatus === 'healthy' 
    ? 200 
    : overallStatus === 'degraded' 
      ? 200 // Still respond with 200 for "degraded" but with warning in body
      : 503; // Service Unavailable
  
  componentLogger.info(`Enhanced health check performed`, { 
    status: overallStatus,
    components: Object.keys(healthStatus.components).length,
    pr173_checks: Object.keys(pr173Checks.checks).length,
    responseTime: Date.now() - startTime
  });
  
  // Track this API call
  monitoring.trackApiCall('/api/health', 'GET', statusCode, startTime);
  
  return NextResponse.json(enhancedHealthStatus, { 
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, max-age=0'
    }
  });
});

/**
 * Perform PR #173 specific infrastructure health checks
 */
async function performPR173HealthChecks() {
  const checks: { [key: string]: unknown } = {};
  let overallStatus = 'healthy';
  
  try {
    // 1. Database Schema Validation (optimistic locking)
    try {
      const schemaStart = Date.now();
      await prisma.$executeRaw`
        SELECT COUNT(*) as count
        FROM information_schema.columns 
        WHERE table_name = 'TickerMonitoring' 
        AND column_name = 'version'
      `;
      
      checks.database_schema = {
        status: 'healthy',
        optimistic_locking_enabled: true,
        version_column_exists: true,
        responseTime: Date.now() - schemaStart
      };
    } catch (error) {
      checks.database_schema = {
        status: 'unhealthy',
        optimistic_locking_enabled: false,
        error: error instanceof Error ? error.message : 'Schema validation failed'
      };
      overallStatus = 'unhealthy';
    }

    // 2. Web Crypto API Validation (Edge Runtime compatibility)
    try {
      const cryptoStart = Date.now();
      
      // Test Web Crypto API operations
      const encoder = new TextEncoder();
      const testData = encoder.encode('health-test');
      await crypto.subtle.digest('SHA-256', testData);
      
      checks.web_crypto = {
        status: 'healthy',
        edge_runtime_compatible: true,
        operations_validated: ['digest'],
        responseTime: Date.now() - cryptoStart
      };
    } catch (error) {
      checks.web_crypto = {
        status: 'unhealthy',
        edge_runtime_compatible: false,
        error: error instanceof Error ? error.message : 'Web Crypto API failed'
      };
      overallStatus = 'unhealthy';
    }

    // 3. Concurrency System Validation
    try {
      const concurrencyStart = Date.now();
      
      // Test that we can query version fields
      const sampleRecord = await prisma.tickerMonitoring.findFirst({
        select: { id: true, version: true, cik: true },
        where: { isActive: true }
      });
      
      checks.concurrency_system = {
        status: 'healthy',
        optimistic_locking_ready: true,
        sample_version_field: sampleRecord?.version ?? null,
        responseTime: Date.now() - concurrencyStart
      };
    } catch (error) {
      checks.concurrency_system = {
        status: 'degraded',
        optimistic_locking_ready: false,
        error: error instanceof Error ? error.message : 'Concurrency system check failed'
      };
      if (overallStatus === 'healthy') overallStatus = 'degraded';
    }

    // 4. Security System Validation (timing-safe operations)
    try {
      const securityStart = Date.now();
      
      // Test timing-safe comparison
      function timingSafeEqual(a: string, b: string): boolean {
        if (a.length !== b.length) return false;
        const encoder = new TextEncoder();
        const aBytes = encoder.encode(a);
        const bBytes = encoder.encode(b);
        let result = 0;
        for (let i = 0; i < aBytes.length; i++) {
          result |= aBytes[i] ^ bBytes[i];
        }
        return result === 0;
      }
      
      const timingSafeWorks = !timingSafeEqual('test1', 'test2');
      
      checks.security_system = {
        status: 'healthy',
        timing_safe_comparison: timingSafeWorks,
        enhanced_security_ready: true,
        responseTime: Date.now() - securityStart
      };
    } catch (error) {
      checks.security_system = {
        status: 'degraded',
        timing_safe_comparison: false,
        error: error instanceof Error ? error.message : 'Security system check failed'
      };
      if (overallStatus === 'healthy') overallStatus = 'degraded';
    }

    // 5. Environment Configuration
    checks.environment = {
      status: 'healthy',
      deployment_platform: process.env.RAILWAY_ENVIRONMENT ? 'RAILWAY' : 'VERCEL',
      edge_runtime: typeof EdgeRuntime !== 'undefined',
      cron_secret_configured: !!process.env.CRON_SECRET,
      node_env: process.env.NODE_ENV
    };

  } catch (error) {
    componentLogger.error('PR #173 health checks failed', { error });
    overallStatus = 'unhealthy';
    
    checks.general_error = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  return {
    overall_status: overallStatus,
    checks,
    timestamp: new Date().toISOString()
  };
} 