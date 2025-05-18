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
export const GET = appRouterAsyncHandler(async (request) => {
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
