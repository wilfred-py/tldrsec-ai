/**
 * Enhanced SEC Filing Summary API
 * 
 * Provides SEC filing summaries with advanced features:
 * - Caching to prevent redundant API calls for the same filing
 * - Streaming support for faster partial results
 * - Enhanced chunking for large documents
 * - Improved error handling and recovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enhancedFilingService } from '@/services/enhancedFilingService';
import { logger } from '@/lib/logging';
import { FilingType } from '@/lib/sec-edgar/types';

export const dynamic = 'force-dynamic';
import { getFormMetadata } from '@/lib/sec-edgar/form-registry';
import { getPrismaClient } from '@/lib/db/prisma';

// API route logger
const apiLogger = logger.child('api-enhanced-summary');

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get user session
    const { userId } = await auth();
    
    // Extract query parameters
    const searchParams = new URL(request.url).searchParams;
    const ticker = searchParams.get('ticker');
    const formType = searchParams.get('formType');
    const useStreaming = searchParams.get('useStreaming') === 'true';
    const useCache = searchParams.get('useCache') !== 'false'; // Default to true
    const processAllChunks = searchParams.get('processAllChunks') === 'true';
    
    // Validate required parameters
    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }
    
    if (!formType) {
      return NextResponse.json(
        { error: 'Form type is required' },
        { status: 400 }
      );
    }
    
    // Validate form type
    const formMetadata = getFormMetadata(formType as FilingType);
    if (!formMetadata) {
      return NextResponse.json(
        { error: `Invalid form type: ${formType}` },
        { status: 400 }
      );
    }
    
    // Parse options
    const options = {
      userId,
      useStreaming,
      useCache,
      processAllChunks
    };
    
    // Log request
    apiLogger.info(`Enhanced summary request: ${ticker} ${formType}`, { options });
    
    // Record request in analytics
    if (userId) {
      const prisma = getPrismaClient();
      await prisma.userActivity.create({
        data: {
          userId,
          activityType: 'FILING_SUMMARY_REQUEST',
          details: {
            ticker,
            formType,
            options
          }
        }
      });
    }
    
    // Get filing summary
    const result = await enhancedFilingService.getFilingSummary(
      ticker.toUpperCase(),
      formType as FilingType,
      options
    );
    
    // Handle error
    if (!result.data) {
      return NextResponse.json(
        { error: result.error || 'Filing summary not found' },
        { status: 404 }
      );
    }
    
    // Return success response
    return NextResponse.json({
      success: true,
      data: result.data,
      processingTimeMs: Date.now() - startTime
    });
    
  } catch (error) {
    // Log error
    apiLogger.error('Error in enhanced summary API', { error });
    
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
      { error: `Failed to get filing summary: ${message}` },
      { status: 500 }
    );
  }
}
