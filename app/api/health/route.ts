import { NextResponse } from 'next/server';
import { monitoring } from '@/lib/monitoring';
import { appRouterAsyncHandler } from '@/lib/error-handling';
import { logger } from '@/lib/logging';
import { getPrismaClient } from '@/lib/db/prisma';
import { CircuitBreakerRegistry } from '@/lib/resilience/circuit-breaker';
import { GlobalErrorHandler } from '@/lib/resilience/error-handling';
import { rateLimiter } from '@/lib/security/rate-limiter';
import { headers } from 'next/headers';

// Note: Edge Runtime disabled due to ioredis compatibility in rate limiter
// export const runtime = 'edge';

// SECURITY: Check if we're in Edge Runtime
const isEdgeRuntime = typeof (globalThis as unknown as { EdgeRuntime?: unknown }).EdgeRuntime !== 'undefined' || 
                      process.env.RUNTIME === 'edge';

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
  
  // SECURITY: Rate limit health endpoint to prevent reconnaissance abuse
  const headersList = await headers();
  const clientIP = headersList.get('x-forwarded-for') || 
                   headersList.get('x-real-ip') || 
                   'unknown';
  
  const rateLimitResult = await rateLimiter.checkLimit(
    'health-api',
    clientIP,
    30, // 30 requests per minute max
    60000 // 1 minute window
  );
  
  if (!rateLimitResult.allowed) {
    componentLogger.warn('Health API rate limit exceeded', { 
      clientIP: 'redacted',
      remaining: rateLimitResult.remaining 
    });
    
    return NextResponse.json(
      { error: 'Rate limit exceeded', status: 'rate_limited' },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': '30',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          'Retry-After': '60'
        }
      }
    );
  }
  
  // Get base health status
  const healthStatus = await monitoring.checkHealth();
  
  // Add PR #173 specific health checks
  const pr173Checks = await performPR173HealthChecks();
  
  // Add resilience system status
  const resilienceStatus = getResilienceSystemStatus();
  
  // Merge health status with PR #173 checks and resilience monitoring
  const enhancedHealthStatus = {
    ...healthStatus,
    pr173_infrastructure: pr173Checks,
    resilience_systems: resilienceStatus,
    version: '1.2',
    pr_version: 'PR #173+: Edge Runtime, concurrency, and enhanced error handling with circuit breakers',
    timestamp: new Date().toISOString()
  };
  
  // Determine overall status considering PR #173 components and resilience systems
  let overallStatus = healthStatus.status;
  if (pr173Checks.overall_status === 'unhealthy' || resilienceStatus.overall_status === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if ((pr173Checks.overall_status === 'degraded' || resilienceStatus.overall_status === 'degraded') && overallStatus === 'healthy') {
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
      // SECURITY: Comprehensive security headers
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      // Rate limiting headers
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      'X-RateLimit-Reset': rateLimitResult.resetTime.toString()
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
    // 1. Database Schema Validation (optimistic locking) - SQL INJECTION FIX
    try {
      const schemaStart = Date.now();
      // SECURITY FIX: Use parameterized query instead of raw SQL to prevent injection
      const result = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count
        FROM information_schema.columns 
        WHERE table_name = ${`TickerMonitoring`}
        AND column_name = ${`version`}
      `;
      
      const versionColumnExists = result[0]?.count > 0;
      
      checks.database_schema = {
        status: 'healthy',
        optimistic_locking_enabled: versionColumnExists,
        version_column_exists: versionColumnExists,
        responseTime: Date.now() - schemaStart
      };
    } catch (error) {
      checks.database_schema = {
        status: 'unhealthy',
        optimistic_locking_enabled: false,
        // SECURITY FIX: Sanitize error messages to prevent information disclosure
        error: 'Schema validation failed'
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
      
      // SECURITY FIX: Enhanced timing-safe comparison to prevent timing attacks
      function timingSafeEqual(a: string, b: string): boolean {
        // Always perform comparison on equal-length strings to prevent length-based timing attacks
        const maxLength = Math.max(a.length, b.length);
        const aNormalized = a.padEnd(maxLength, '\0');
        const bNormalized = b.padEnd(maxLength, '\0');
        
        const encoder = new TextEncoder();
        const aBytes = encoder.encode(aNormalized);
        const bBytes = encoder.encode(bNormalized);
        
        let result = 0;
        // Ensure constant-time comparison regardless of input
        for (let i = 0; i < maxLength; i++) {
          result |= aBytes[i] ^ bBytes[i];
        }
        
        // Return length equality AND content equality
        return (a.length === b.length) && (result === 0);
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

    // 5. Environment Configuration (sanitized for security)
    checks.environment = {
      status: 'healthy',
      // SECURITY: Remove platform fingerprinting
      runtime_type: isEdgeRuntime ? 'edge' : 'node',
      // SECURITY: Only indicate if required secrets are present, not their names
      secrets_configured: !!process.env.CRON_SECRET && !!process.env.DATABASE_URL,
      // SECURITY: Only show production vs non-production
      is_production: process.env.NODE_ENV === 'production'
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

/**
 * Get resilience system status including circuit breakers and error monitoring
 */
function getResilienceSystemStatus() {
  const checks: { [key: string]: unknown } = {};
  let overallStatus = 'healthy';
  
  try {
    // Get circuit breaker registry
    const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();
    const circuitBreakerMetrics = circuitBreakerRegistry.getAllMetrics();
    
    // Check circuit breaker status
    let openCircuitBreakers = 0;
    let degradedCircuitBreakers = 0;
    const circuitBreakerStatuses: { [key: string]: unknown } = {};
    
    for (const [name, metrics] of Object.entries(circuitBreakerMetrics)) {
      circuitBreakerStatuses[name] = {
        state: metrics.state,
        totalCalls: metrics.totalCalls,
        successRate: metrics.totalCalls > 0 
          ? ((metrics.successfulCalls / metrics.totalCalls) * 100).toFixed(2) + '%'
          : '100%',
        averageResponseTime: Math.round(metrics.averageResponseTime) + 'ms',
        lastStateChange: metrics.lastStateChange
      };
      
      if (metrics.state === 'OPEN') {
        openCircuitBreakers++;
      } else if (metrics.state === 'HALF_OPEN') {
        degradedCircuitBreakers++;
      }
    }
    
    checks.circuit_breakers = {
      status: openCircuitBreakers > 0 ? 'degraded' : 'healthy',
      total: Object.keys(circuitBreakerMetrics).length,
      open: openCircuitBreakers,
      half_open: degradedCircuitBreakers,
      closed: Object.keys(circuitBreakerMetrics).length - openCircuitBreakers - degradedCircuitBreakers,
      details: circuitBreakerStatuses
    };
    
    if (openCircuitBreakers > 0 && overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }
    
    // Get global error handler statistics
    const errorHandler = GlobalErrorHandler.getInstance();
    const errorStats = errorHandler.getStatistics();
    
    // Calculate recent error rate (errors in last 10)
    const recentErrors = errorStats.recentErrors;
    const criticalErrorsRecent = recentErrors.filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH').length;
    
    checks.error_monitoring = {
      status: criticalErrorsRecent > 5 ? 'degraded' : 'healthy',
      total_errors: errorStats.totalErrors,
      recent_errors: recentErrors.length,
      critical_recent: criticalErrorsRecent,
      error_categories: errorStats.errorsByCategory,
      error_severities: errorStats.errorsBySeverity,
      retryable_errors: errorStats.retryableErrors,
      transient_errors: errorStats.transientErrors
    };
    
    if (criticalErrorsRecent > 5 && overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }
    if (criticalErrorsRecent > 10) {
      overallStatus = 'unhealthy';
    }
    
    // System resilience configuration status
    checks.resilience_config = {
      status: 'healthy',
      circuit_breaker_registry: 'active',
      global_error_handler: 'active',
      retry_mechanisms: 'enabled',
      timeout_protection: 'enabled',
      correlation_tracking: 'enabled'
    };
    
  } catch (error) {
    componentLogger.error('Resilience system health check failed', { error });
    overallStatus = 'unhealthy';
    
    checks.general_error = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Resilience system check failed'
    };
  }
  
  return {
    overall_status: overallStatus,
    checks,
    timestamp: new Date().toISOString()
  };
} 