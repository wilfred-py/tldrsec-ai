import { NextResponse } from 'next/server';
import { monitoring } from '@/lib/monitoring';
import { appRouterAsyncHandler } from '@/lib/error-handling';
/**
 * Readiness probe for Kubernetes/container environments
 * GET /api/health/readiness
 */
export const GET = appRouterAsyncHandler(async (request) => {
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
        details: Object.fromEntries(Object.entries(healthStatus.components).map(([name, component]) => [name, { status: component.status }]))
    }, { status: statusCode });
});
