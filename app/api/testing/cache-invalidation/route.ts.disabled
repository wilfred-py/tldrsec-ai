/**
 * Cache Invalidation Testing API Endpoint
 * 
 * Provides secure, authenticated endpoints for cache invalidation operations
 * to enable OpenRouter integration testing. Includes comprehensive safety
 * measures and audit logging.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cacheInvalidationService } from '../../../../lib/cache/cache-invalidation-service';
import { logger } from '../../../../lib/logging';
import { generateSecureCorrelationId } from '../../../../lib/security/secure-random';

const cacheApiLogger = logger.child('cache-invalidation-api');

/**
 * Request validation schema
 */
const CacheInvalidationRequestSchema = z.object({
  // Targeting criteria
  tickers: z.array(z.string().min(1).max(10)).optional(),
  filingTypes: z.array(z.string().min(1).max(20)).optional(),
  dateRange: z.object({
    start: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    end: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  }).optional(),
  
  // Required safety and audit fields
  environment: z.enum(['test', 'dev', 'staging']),
  reason: z.string().min(10).max(500),
  requesterId: z.string().min(1).max(100),
  
  // Operation configuration
  strategy: z.enum(['soft', 'timestamp', 'hard']).default('soft'),
  dryRun: z.boolean().default(false),
  
  // Safety confirmation for destructive operations
  confirmDestructive: z.boolean().optional()
});

/**
 * Validate API authentication for testing endpoints
 */
function validateTestingAuthentication(request: NextRequest): { valid: boolean; error?: string } {
  const authHeader = request.headers.get('authorization');
  const apiKeyHeader = request.headers.get('x-api-key');
  
  // Check for testing API key
  const validTestingKey = process.env.TESTING_API_KEY;
  if (!validTestingKey) {
    return { valid: false, error: 'Testing API key not configured' };
  }
  
  // Support both Authorization header and X-API-Key header
  let providedKey: string | null = null;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7);
  } else if (apiKeyHeader) {
    providedKey = apiKeyHeader;
  }
  
  if (!providedKey) {
    return { valid: false, error: 'No API key provided' };
  }
  
  if (providedKey !== validTestingKey) {
    return { valid: false, error: 'Invalid API key' };
  }
  
  return { valid: true };
}

/**
 * Validate environment safety constraints
 */
function validateEnvironmentConstraints(environment: string): { valid: boolean; error?: string } {
  const currentEnv = process.env.NODE_ENV || 'development';
  
  // Absolutely block production environment
  if (currentEnv === 'production') {
    return { 
      valid: false, 
      error: 'Cache invalidation API is disabled in production environment' 
    };
  }
  
  // Validate requested environment
  const allowedEnvironments = ['test', 'dev', 'staging'];
  if (!allowedEnvironments.includes(environment)) {
    return { 
      valid: false, 
      error: `Invalid environment: ${environment}. Allowed: ${allowedEnvironments.join(', ')}` 
    };
  }
  
  return { valid: true };
}

/**
 * POST /api/testing/cache-invalidation
 * 
 * Invalidate cached SEC filing summaries for testing purposes
 */
export async function POST(request: NextRequest) {
  const correlationId = generateSecureCorrelationId('cache_api');
  
  try {
    // Validate authentication
    const authResult = validateTestingAuthentication(request);
    if (!authResult.valid) {
      cacheApiLogger.warn('Unauthorized cache invalidation attempt', {
        correlationId,
        error: authResult.error,
        ip: request.ip,
        userAgent: request.headers.get('user-agent')
      });
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Unauthorized', 
          correlationId 
        },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = CacheInvalidationRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      cacheApiLogger.warn('Invalid cache invalidation request', {
        correlationId,
        validationErrors: validationResult.error.errors
      });
      
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          details: validationResult.error.errors,
          correlationId
        },
        { status: 400 }
      );
    }

    const requestData = validationResult.data;

    // Validate environment constraints
    const envResult = validateEnvironmentConstraints(requestData.environment);
    if (!envResult.valid) {
      cacheApiLogger.error('Environment constraint violation', {
        correlationId,
        requestedEnvironment: requestData.environment,
        currentEnvironment: process.env.NODE_ENV,
        error: envResult.error
      });
      
      return NextResponse.json(
        {
          success: false,
          error: envResult.error,
          correlationId
        },
        { status: 403 }
      );
    }

    // Additional safety check for destructive operations
    if (requestData.strategy === 'hard' && !requestData.confirmDestructive) {
      return NextResponse.json(
        {
          success: false,
          error: 'Hard deletion requires explicit confirmation via confirmDestructive: true',
          correlationId
        },
        { status: 400 }
      );
    }

    // Log the authenticated request
    cacheApiLogger.info('Processing cache invalidation request', {
      correlationId,
      requesterId: requestData.requesterId,
      environment: requestData.environment,
      strategy: requestData.strategy,
      dryRun: requestData.dryRun,
      criteria: {
        tickers: requestData.tickers,
        filingTypes: requestData.filingTypes,
        dateRange: requestData.dateRange
      }
    });

    // Execute cache invalidation
    const result = await cacheInvalidationService.invalidateCache({
      tickers: requestData.tickers,
      filingTypes: requestData.filingTypes,
      dateRange: requestData.dateRange ? {
        start: new Date(requestData.dateRange.start),
        end: new Date(requestData.dateRange.end)
      } : undefined,
      environment: requestData.environment,
      reason: requestData.reason,
      requesterId: requestData.requesterId,
      strategy: requestData.strategy,
      dryRun: requestData.dryRun
    });

    if (result.success) {
      cacheApiLogger.info('Cache invalidation completed successfully', {
        correlationId: result.correlationId,
        invalidatedCount: result.invalidatedCount,
        strategy: result.strategy,
        executionTimeMs: result.executionTimeMs
      });

      return NextResponse.json({
        success: true,
        correlationId: result.correlationId,
        invalidatedCount: result.invalidatedCount,
        affectedSummaries: result.affectedSummaries.slice(0, 10), // Limit response size
        environment: result.environment,
        strategy: result.strategy,
        executionTimeMs: result.executionTimeMs,
        message: requestData.dryRun 
          ? 'Dry run completed - no cache entries were actually invalidated'
          : 'Cache invalidation completed successfully',
        nextSteps: requestData.dryRun 
          ? 'Set dryRun: false to execute actual invalidation'
          : 'Run filing processing to trigger OpenRouter API calls for invalidated summaries'
      });
    } else {
      cacheApiLogger.error('Cache invalidation failed', {
        correlationId: result.correlationId,
        error: result.error
      });

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          correlationId: result.correlationId
        },
        { status: 500 }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    cacheApiLogger.error('Cache invalidation API error', {
      correlationId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        correlationId
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/testing/cache-invalidation
 * 
 * Get cache statistics and preview invalidation impact
 */
export async function GET(request: NextRequest) {
  const correlationId = generateSecureCorrelationId('cache_stats');
  
  try {
    // Validate authentication
    const authResult = validateTestingAuthentication(request);
    if (!authResult.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Unauthorized', 
          correlationId 
        },
        { status: 401 }
      );
    }

    // Check if this is a preview request
    const { searchParams } = new URL(request.url);
    const isPreview = searchParams.get('preview') === 'true';
    
    if (isPreview) {
      // Parse preview criteria from query parameters
      const tickers = searchParams.get('tickers')?.split(',').filter(Boolean);
      const filingTypes = searchParams.get('filingTypes')?.split(',').filter(Boolean);
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const environment = searchParams.get('environment') || 'test';

      // Validate environment for preview
      const envResult = validateEnvironmentConstraints(environment);
      if (!envResult.valid) {
        return NextResponse.json(
          {
            success: false,
            error: envResult.error,
            correlationId
          },
          { status: 403 }
        );
      }

      const preview = await cacheInvalidationService.previewInvalidation({
        tickers,
        filingTypes,
        dateRange: startDate && endDate ? {
          start: new Date(startDate),
          end: new Date(endDate)
        } : undefined,
        environment: environment as 'test' | 'dev' | 'staging',
        reason: 'API preview request',
        requesterId: 'api-preview'
      });

      return NextResponse.json({
        success: true,
        preview,
        correlationId
      });
    } else {
      // Return general cache statistics
      const stats = await cacheInvalidationService.getCacheStatistics();
      
      return NextResponse.json({
        success: true,
        statistics: stats,
        correlationId
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    cacheApiLogger.error('Cache stats API error', {
      correlationId,
      error: errorMessage
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        correlationId
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/testing/cache-invalidation/restore
 * 
 * Restore previously invalidated cache entries
 */
export async function PUT(request: NextRequest) {
  const correlationId = generateSecureCorrelationId('cache_restore');
  
  try {
    // Validate authentication
    const authResult = validateTestingAuthentication(request);
    if (!authResult.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Unauthorized', 
          correlationId 
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { summaryIds } = body;

    if (!Array.isArray(summaryIds) || summaryIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'summaryIds array is required',
          correlationId
        },
        { status: 400 }
      );
    }

    cacheApiLogger.info('Processing cache restoration request', {
      correlationId,
      summaryCount: summaryIds.length
    });

    const result = await cacheInvalidationService.restoreInvalidatedCache(summaryIds);

    return NextResponse.json({
      success: true,
      restoredCount: result.restoredCount,
      correlationId,
      message: `Successfully restored ${result.restoredCount} cache entries`
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    cacheApiLogger.error('Cache restoration API error', {
      correlationId,
      error: errorMessage
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        correlationId
      },
      { status: 500 }
    );
  }
}