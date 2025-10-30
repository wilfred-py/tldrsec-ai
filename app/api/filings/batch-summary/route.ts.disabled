/**
 * Batch SEC Filing Summary API
 * 
 * Processes multiple SEC filing summary requests in a single batch operation.
 * 
 * Features:
 * - Process multiple filing summaries in parallel
 * - Concurrency control to prevent system overload
 * - Caching to prevent redundant API calls
 * - Enhanced chunking for large documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enhancedFilingService } from '../../../../services/enhancedFilingService';
import { logger } from '../../../../lib/logging';
import { FilingType } from '../../../../lib/sec-edgar/types';
import { getFormMetadata } from '../../../../lib/sec-edgar/form-registry';
import { getPrismaClient } from '../../../../lib/db/prisma';

// API route logger
const apiLogger = logger.child('api-batch-summary');

// Maximum number of filings that can be requested in a single batch
const MAX_BATCH_SIZE = 10;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get user session using Clerk
    const { userId } = await auth();
    
    // Extract request body
    const { requests, concurrencyLimit = 3, useCache = true, processAllChunks = false } = await request.json();
    
    // Validate requests array
    if (!Array.isArray(requests)) {
      return NextResponse.json(
        { error: 'Requests must be an array' },
        { status: 400 }
      );
    }
    
    // Enforce batch size limit
    if (requests.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} filings` },
        { status: 400 }
      );
    }
    
    // Validate each request
    const validatedRequests = [];
    const invalidRequests = [];
    
    for (const request of requests) {
      const { ticker, formType } = request;
      
      if (!ticker || typeof ticker !== 'string') {
        invalidRequests.push({ ...request, error: 'Ticker is required' });
        continue;
      }
      
      if (!formType || typeof formType !== 'string') {
        invalidRequests.push({ ...request, error: 'Form type is required' });
        continue;
      }
      
      // Validate form type
      const formMetadata = getFormMetadata(formType as FilingType);
      if (!formMetadata) {
        invalidRequests.push({ ...request, error: `Invalid form type: ${formType}` });
        continue;
      }
      
      // Add to validated requests
      validatedRequests.push({
        ticker: ticker.toUpperCase(),
        formType: formType as FilingType
      });
    }
    
    // If there are invalid requests, return error
    if (invalidRequests.length > 0) {
      return NextResponse.json(
        {
          error: 'Invalid requests in batch',
          invalidRequests
        },
        { status: 400 }
      );
    }
    
    // Log request
    apiLogger.info(`Batch summary request for ${validatedRequests.length} filings`, {
      concurrencyLimit,
      useCache,
      processAllChunks
    });
    
    // Record request in analytics
    if (userId) {
      const prisma = getPrismaClient();
      await prisma.userActivity.create({
        data: {
          userId,
          activityType: 'FILING_SUMMARY_BATCH_REQUEST',
          details: {
            requestCount: validatedRequests.length,
            concurrencyLimit,
            useCache,
            processAllChunks
          }
        }
      });
    }
    
    // Process batch request
    const result = await enhancedFilingService.getBatchFilingSummaries(
      validatedRequests,
      {
        userId,
        concurrencyLimit,
        useCache,
        processAllChunks
      }
    );
    
    // Return success response
    return NextResponse.json({
      success: true,
      results: result.results,
      errors: result.errors,
      totalProcessed: result.results.length + result.errors.length,
      successCount: result.results.length,
      errorCount: result.errors.length,
      processingTimeMs: Date.now() - startTime
    });
    
  } catch (error) {
    // Log error
    apiLogger.error('Error in batch summary API', { error });
    
    // Handle known API errors
    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as Error & { statusCode: number };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }
    
    // Handle unknown errors
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to process batch summary: ${message}` },
      { status: 500 }
    );
  }
}
