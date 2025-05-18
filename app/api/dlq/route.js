import { NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { JobQueueService } from '@/lib/job-queue';
import { DeadLetterQueueService } from '@/lib/job-queue/dead-letter-queue';
import { monitoring } from '@/lib/monitoring';
import { appRouterAsyncHandler, createNotFoundError, createBadRequestError, createForbiddenError } from '@/lib/error-handling';
// Component logger
const componentLogger = logger.child('dlq-api');
/**
 * GET /api/dlq - Get dead letter queue entries
 *
 * Query parameters:
 * - limit: Number of entries to return (default: 100)
 * - offset: Offset for pagination (default: 0)
 * - include_reprocessed: Whether to include already reprocessed entries (default: false)
 */
export const GET = appRouterAsyncHandler(async (request) => {
    const startTime = Date.now();
    // Check if API key is required
    const apiKey = request.headers.get('x-api-key');
    const configuredApiKey = process.env.ADMIN_API_KEY;
    // If ADMIN_API_KEY is set, require authentication
    if (configuredApiKey && apiKey !== configuredApiKey) {
        componentLogger.warn(`Unauthorized DLQ access attempt`, {
            ip: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown'
        });
        throw createForbiddenError('Invalid API key');
    }
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const includeReprocessed = searchParams.get('include_reprocessed') === 'true';
    // Get entries from dead letter queue
    const entries = await DeadLetterQueueService.getDeadLetterEntries(limit, offset, includeReprocessed);
    // Get total count for pagination
    const count = await DeadLetterQueueService.getDeadLetterCount(includeReprocessed);
    // Calculate duration
    const duration = Date.now() - startTime;
    // Track metrics
    monitoring.trackApiCall('/api/dlq', 'GET', 200, startTime);
    // Return response
    return NextResponse.json({
        success: true,
        count,
        entries,
        limit,
        offset,
        includeReprocessed,
        duration
    });
});
/**
 * POST /api/dlq/requeue - Requeue a specific item from the dead letter queue
 *
 * Request body:
 * {
 *   "id": "dlq-item-id"
 * }
 */
export const POST = appRouterAsyncHandler(async (request) => {
    const startTime = Date.now();
    // Check if API key is required
    const apiKey = request.headers.get('x-api-key');
    const configuredApiKey = process.env.ADMIN_API_KEY;
    // If ADMIN_API_KEY is set, require authentication
    if (configuredApiKey && apiKey !== configuredApiKey) {
        componentLogger.warn(`Unauthorized DLQ requeue attempt`, {
            ip: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown'
        });
        throw createForbiddenError('Invalid API key');
    }
    // Parse request body
    const body = await request.json();
    // Validate request body
    if (!body.id) {
        throw createBadRequestError('Missing required field: id');
    }
    // Function to add job back to main queue
    const addJobFunction = async (jobType, payload) => {
        const job = await JobQueueService.addJob({
            jobType,
            payload,
            priority: 5, // Medium priority
            scheduledFor: new Date(), // Schedule immediately
            // No idempotency key to avoid conflicts with original job
        });
        return job.id;
    };
    // Requeue the item
    const newJobId = await DeadLetterQueueService.requeueDeadLetterEntry(body.id, addJobFunction);
    if (!newJobId) {
        throw createNotFoundError(`Failed to requeue DLQ entry: ${body.id}`);
    }
    // Track metrics
    monitoring.incrementCounter('dlq.requeued', 1);
    monitoring.trackApiCall('/api/dlq/requeue', 'POST', 200, startTime);
    // Return response
    return NextResponse.json({
        success: true,
        id: body.id,
        newJobId,
        message: `Successfully requeued DLQ entry: ${body.id}`
    });
});
/**
 * DELETE /api/dlq/cleanup - Clean up old reprocessed items from the dead letter queue
 *
 * Query parameters:
 * - older_than_days: Delete entries older than this many days (default: 30)
 */
export const DELETE = appRouterAsyncHandler(async (request) => {
    const startTime = Date.now();
    // Check if API key is required
    const apiKey = request.headers.get('x-api-key');
    const configuredApiKey = process.env.ADMIN_API_KEY;
    // If ADMIN_API_KEY is set, require authentication
    if (configuredApiKey && apiKey !== configuredApiKey) {
        componentLogger.warn(`Unauthorized DLQ cleanup attempt`, {
            ip: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown'
        });
        throw createForbiddenError('Invalid API key');
    }
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const olderThanDays = parseInt(searchParams.get('older_than_days') || '30', 10);
    // Clean up old entries
    const deletedCount = await DeadLetterQueueService.cleanupOldEntries(olderThanDays);
    // Track metrics
    monitoring.incrementCounter('dlq.cleaned_up', deletedCount);
    monitoring.trackApiCall('/api/dlq/cleanup', 'DELETE', 200, startTime);
    // Return response
    return NextResponse.json({
        success: true,
        deletedCount,
        olderThanDays,
        message: `Successfully cleaned up ${deletedCount} DLQ entries older than ${olderThanDays} days`
    });
});
