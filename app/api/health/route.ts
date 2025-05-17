import { NextResponse } from 'next/server';
import { monitoring } from '@/lib/monitoring';
import { appRouterAsyncHandler } from '@/lib/error-handling';
import { logger } from '@/lib/logging';

// Component logger
const componentLogger = logger.child('health-api');

/**
 * Health check endpoint
 * GET /api/health
 */
export const GET = appRouterAsyncHandler(async (request: Request) => {
  const startTime = Date.now();
  
  // Get detailed health status
  const healthStatus = await monitoring.checkHealth();
  
  // Determine status code based on health status
  const statusCode = healthStatus.status === 'healthy' 
    ? 200 
    : healthStatus.status === 'degraded' 
      ? 200 // Still respond with 200 for "degraded" but with warning in body
      : 503; // Service Unavailable
  
  componentLogger.info(`Health check performed`, { 
    status: healthStatus.status,
    components: Object.keys(healthStatus.components).length,
    responseTime: Date.now() - startTime
  });
  
  // Track this API call
  monitoring.trackApiCall('/api/health', 'GET', statusCode, startTime);
  
  return NextResponse.json(healthStatus, { 
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, max-age=0'
    }
  });
});

/**
 * Simple liveness probe for Kubernetes/container environments
 * GET /api/health/liveness
 */
export const liveness = appRouterAsyncHandler(async (request: Request) => {
  const startTime = Date.now();
  
  // For liveness, we just check if the application is running
  // No need for detailed checks
  
  // Track this API call
  monitoring.trackApiCall('/api/health/liveness', 'GET', 200, startTime);
  
  return NextResponse.json({ 
    status: 'alive',
    timestamp: new Date().toISOString() 
  });
});

/**
 * Readiness probe for Kubernetes/container environments
 * GET /api/health/readiness
 */
export const readiness = appRouterAsyncHandler(async (request: Request) => {
  const startTime = Date.now();
  
  // For readiness, we check critical components
  // This determines if the service should receive traffic
  const healthStatus = await monitoring.checkHealth();
  
  // Determine status code based on health status
  const statusCode = healthStatus.status === 'unhealthy' ? 503 : 200;
  
  // Track this API call
  monitoring.trackApiCall('/api/health/readiness', 'GET', statusCode, startTime);
  
  return NextResponse.json({ 
    status: healthStatus.status,
    timestamp: new Date().toISOString(),
    details: Object.fromEntries(
      Object.entries(healthStatus.components).map(([name, component]) => 
        [name, { status: component.status }]
      )
    )
  }, { status: statusCode });
}); 