/**
 * Optimized SEC Filing Summary API - Tranche 4
 * 
 * Next-generation filing summary API with full optimization stack:
 * - Direct Claude integration for faster AI processing
 * - Multi-level caching (memory + database + Redis)
 * - Enhanced document fetching with directory support
 * - Content-aware chunking for large documents
 * - Rate limiting and resource management
 * - Comprehensive monitoring and metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { FilingType } from '../../../../lib/sec-edgar/types';
import { getFormMetadata } from '../../../../lib/sec-edgar/form-registry';
import { optimizedFilingService } from '../../../../services/filings/optimizedFilingService';
import { logger } from '../../../../lib/logging';
import { monitoring } from '../../../../lib/monitoring';

// API route logger
const apiLogger = logger.child('api-optimized-summary');

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

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker')?.toUpperCase();
    const formType = searchParams.get('formType') as FilingType;
    const bypassCache = searchParams.get('bypassCache') === 'true';
    const returnMetadata = searchParams.get('returnMetadata') === 'true';
    
    apiLogger.info(`🚀 Optimized filing summary request: ${ticker} ${formType}`, { 
      requestId, 
      bypassCache, 
      returnMetadata 
    });
    
    // Validate required parameters
    if (!ticker) {
      const error = 'Ticker parameter is required';
      apiLogger.warn(`❌ ${error}`, { requestId });
      return NextResponse.json({ error }, { status: 400 });
    }
    
    if (!formType) {
      const error = 'Form type parameter is required';
      apiLogger.warn(`❌ ${error}`, { requestId });
      return NextResponse.json({ error }, { status: 400 });
    }
    
    // Validate form type
    const formMetadata = getFormMetadata(formType);
    if (!formMetadata) {
      const error = `Invalid form type: ${formType}`;
      apiLogger.warn(`❌ ${error}`, { requestId });
      return NextResponse.json({ error }, { status: 400 });
    }
    
    // Process filing summary with optimized service
    const result = await optimizedFilingService.getFilingSummary(ticker, formType, {
      bypassCache,
      saveToDatabase: true,
      returnMetadata: true
    });
    
    // Record performance metrics
    const duration = Date.now() - startTime;
    safeMonitoring.recordDuration('optimized_api_filing_summary_ms', duration, {
      ticker,
      formType,
      success: result.data ? 'true' : 'false',
      cache_hit: result.metadata?.cacheHit ? 'true' : 'false',
      cache_source: result.metadata?.cacheSource || 'none'
    });
    
    if (result.error || !result.data) {
      const error = result.error || 'Failed to get filing summary';
      apiLogger.error(`❌ ${error}`, { 
        requestId, 
        ticker, 
        formType, 
        duration,
        metadata: result.metadata 
      });
      return NextResponse.json({ 
        error,
        requestId,
        metadata: returnMetadata ? result.metadata : undefined
      }, { status: 404 });
    }
    
    apiLogger.info(`✅ Optimized filing summary completed: ${ticker} ${formType}`, { 
      requestId, 
      duration,
      cacheHit: result.metadata?.cacheHit,
      cacheSource: result.metadata?.cacheSource
    });
    
    return NextResponse.json({ 
      success: true, 
      data: result.data,
      requestId,
      metadata: returnMetadata ? result.metadata : undefined,
      performance: {
        duration,
        optimized: true,
        version: 'tranche-4'
      }
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    apiLogger.error(`❌ Optimized filing summary error`, { 
      error: errorMessage, 
      requestId,
      duration 
    });
    
    safeMonitoring.recordDuration('optimized_api_filing_summary_error_ms', duration, {
      error: 'true'
    });
    
    return NextResponse.json({ 
      error: errorMessage,
      requestId,
      performance: {
        duration,
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}