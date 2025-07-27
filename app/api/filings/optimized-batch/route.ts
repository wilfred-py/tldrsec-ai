/**
 * Optimized Batch SEC Filing Summary API - Tranche 4
 * 
 * High-performance batch processing API with full optimization:
 * - Concurrent processing with intelligent batching
 * - Shared caching across requests in batch
 * - Dynamic concurrency based on system load
 * - Comprehensive error handling and partial results
 * - Advanced monitoring and performance tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { FilingType } from '../../../../lib/sec-edgar/types';
import { getFormMetadata } from '../../../../lib/sec-edgar/form-registry';
import { optimizedFilingService } from '../../../../services/filings/optimizedFilingService';
import { logger } from '../../../../lib/logging';
import { monitoring } from '../../../../lib/monitoring';

// API route logger
const apiLogger = logger.child('api-optimized-batch');

// Safe monitoring wrapper
const safeMonitoring = {
  recordDuration: function(metric: string, value: number, tags: Record<string, string | boolean> = {}) {
    try {
      if (typeof monitoring.recordTiming === 'function') {
        monitoring.recordTiming(metric, value, tags);
      }
    } catch (error) {
      console.warn('Failed to record timing', { error });
    }
  }
};

// Configuration
const MAX_BATCH_SIZE = 25; // Increased from typical 10 due to optimizations
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 10;

interface BatchRequest {
  ticker: string;
  formType: FilingType;
  id?: string; // Optional request ID for tracking
}

interface BatchResponse {
  success: boolean;
  total: number;
  completed: number;
  failed: number;
  results: Array<{
    ticker: string;
    formType: FilingType;
    id?: string;
    success: boolean;
    data?: any;
    error?: string;
    metadata?: any;
  }>;
  performance: {
    totalDuration: number;
    avgDuration: number;
    cacheHitRate: number;
    concurrency: number;
    optimized: true;
    version: string;
  };
  requestId: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Check Content-Length header for payload size limit
    const contentLength = request.headers.get('content-length');
    const maxPayloadSize = parseInt(process.env.MAX_BATCH_PAYLOAD_SIZE || '1048576', 10); // 1MB default
    
    if (contentLength && parseInt(contentLength, 10) > maxPayloadSize) {
      const error = `Request payload too large. Maximum allowed: ${maxPayloadSize} bytes`;
      apiLogger.warn(`❌ ${error}`, { requestId, contentLength });
      return NextResponse.json({ error, requestId }, { status: 413 });
    }

    // Parse request body with size validation
    let body: any;
    try {
      const bodyText = await request.text();
      if (bodyText.length > maxPayloadSize) {
        const error = `Request payload too large. Maximum allowed: ${maxPayloadSize} bytes`;
        apiLogger.warn(`❌ ${error}`, { requestId, actualSize: bodyText.length });
        return NextResponse.json({ error, requestId }, { status: 413 });
      }
      body = JSON.parse(bodyText);
    } catch (parseError) {
      const error = 'Invalid JSON in request body';
      apiLogger.warn(`❌ ${error}`, { requestId, parseError });
      return NextResponse.json({ error, requestId }, { status: 400 });
    }
    const { 
      requests, 
      concurrency = DEFAULT_CONCURRENCY,
      bypassCache = false,
      returnMetadata = false
    } = body;
    
    apiLogger.info(`🚀 Optimized batch request started`, { 
      requestId, 
      requestCount: requests?.length || 0,
      concurrency,
      bypassCache
    });
    
    // Validate requests array
    if (!Array.isArray(requests) || requests.length === 0) {
      const error = 'Requests array is required and must not be empty';
      apiLogger.warn(`❌ ${error}`, { requestId });
      return NextResponse.json({ error }, { status: 400 });
    }
    
    if (requests.length > MAX_BATCH_SIZE) {
      const error = `Batch size cannot exceed ${MAX_BATCH_SIZE} requests`;
      apiLogger.warn(`❌ ${error}`, { requestId, requestCount: requests.length });
      return NextResponse.json({ error }, { status: 400 });
    }
    
    // Validate individual requests
    const validationErrors: string[] = [];
    requests.forEach((req: BatchRequest, index: number) => {
      if (!req.ticker || typeof req.ticker !== 'string') {
        validationErrors.push(`Request ${index}: ticker is required`);
      }
      if (!req.formType || typeof req.formType !== 'string') {
        validationErrors.push(`Request ${index}: formType is required`);
      } else {
        const formMetadata = getFormMetadata(req.formType as FilingType);
        if (!formMetadata) {
          validationErrors.push(`Request ${index}: invalid form type ${req.formType}`);
        }
      }
    });
    
    if (validationErrors.length > 0) {
      const error = `Validation errors: ${validationErrors.join(', ')}`;
      apiLogger.warn(`❌ ${error}`, { requestId });
      return NextResponse.json({ error }, { status: 400 });
    }
    
    // Determine optimal concurrency based on system load and request count
    const optimalConcurrency = Math.min(
      Math.max(concurrency, 1),
      MAX_CONCURRENCY,
      Math.ceil(requests.length / 2) // Don't use more concurrency than needed
    );
    
    // Process batch using optimized service
    const batchResults = await optimizedFilingService.batchGetFilingSummaries(
      requests.map((req: BatchRequest) => ({
        ticker: req.ticker.toUpperCase(),
        formType: req.formType,
        options: {
          bypassCache,
          saveToDatabase: true,
          returnMetadata: true
        }
      })),
      {
        concurrency: optimalConcurrency,
        failFast: false,
        progressCallback: (completed: number, total: number) => {
          apiLogger.debug(`Batch progress: ${completed}/${total}`, { requestId });
        }
      }
    );
    
    // Calculate metrics
    const totalDuration = Date.now() - startTime;
    const completed = batchResults.filter(r => r.data).length;
    const failed = batchResults.length - completed;
    const avgDuration = totalDuration / batchResults.length;
    const cacheHits = batchResults.filter(r => r.metadata?.cacheHit).length;
    const cacheHitRate = batchResults.length > 0 ? (cacheHits / batchResults.length) * 100 : 0;
    
    // Map results to API format
    const results = batchResults.map((result, index) => ({
      ticker: requests[index].ticker.toUpperCase(),
      formType: requests[index].formType,
      id: requests[index].id,
      success: !!result.data,
      data: result.data,
      error: result.error,
      metadata: returnMetadata ? result.metadata : undefined
    }));
    
    // Record performance metrics
    safeMonitoring.recordDuration('optimized_batch_api_total_ms', totalDuration, {
      batch_size: requests.length.toString(),
      concurrency: optimalConcurrency.toString(),
      success_rate: ((completed / requests.length) * 100).toFixed(1),
      cache_hit_rate: cacheHitRate.toFixed(1)
    });
    
    const response: BatchResponse = {
      success: true,
      total: requests.length,
      completed,
      failed,
      results,
      performance: {
        totalDuration,
        avgDuration: Math.round(avgDuration),
        cacheHitRate: Math.round(cacheHitRate),
        concurrency: optimalConcurrency,
        optimized: true,
        version: 'tranche-4'
      },
      requestId
    };
    
    apiLogger.info(`✅ Optimized batch completed`, {
      requestId,
      total: requests.length,
      completed,
      failed,
      totalDuration,
      cacheHitRate: Math.round(cacheHitRate),
      concurrency: optimalConcurrency
    });
    
    return NextResponse.json(response);
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    apiLogger.error(`❌ Optimized batch error`, { 
      error: errorMessage, 
      requestId,
      totalDuration 
    });
    
    safeMonitoring.recordDuration('optimized_batch_api_error_ms', totalDuration, {
      error: 'true'
    });
    
    return NextResponse.json({ 
      error: errorMessage,
      requestId,
      performance: {
        totalDuration,
        optimized: true,
        version: 'tranche-4'
      }
    }, { status: 500 });
  }
}

/**
 * OPTIONS handler for CORS support
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
        ? (process.env.ALLOWED_ORIGINS || 'https://yourdomain.com')
        : '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}