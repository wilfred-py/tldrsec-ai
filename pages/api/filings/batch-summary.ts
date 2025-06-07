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

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { enhancedFilingService } from '../../../services/enhancedFilingService';
import { logger } from '../../../lib/logging';
import { FilingType } from '../../../lib/sec-edgar/types';
import { getFormMetadata } from '../../../lib/sec-edgar/form-registry';
import { prisma } from '../../../lib/db';

// API route logger
const apiLogger = logger.child('api-batch-summary');

// Maximum number of filings that can be requested in a single batch
const MAX_BATCH_SIZE = 10;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  
  try {
    // Validate request method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get user session
    const session = await getServerSession(req, res, authOptions);
    const userId = session?.user?.id;
    
    // Extract request body
    const { requests, concurrencyLimit = 3, useCache = true, processAllChunks = false } = req.body;
    
    // Validate requests array
    if (!Array.isArray(requests)) {
      return res.status(400).json({ error: 'Requests must be an array' });
    }
    
    // Enforce batch size limit
    if (requests.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ 
        error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} filings` 
      });
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
      return res.status(400).json({
        error: 'Invalid requests in batch',
        invalidRequests
      });
    }
    
    // Log request
    apiLogger.info(`Batch summary request for ${validatedRequests.length} filings`, {
      concurrencyLimit,
      useCache,
      processAllChunks
    });
    
    // Record request in analytics
    if (userId) {
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
    return res.status(200).json({
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
      return res.status(apiError.statusCode).json({ error: apiError.message });
    }
    
    // Handle unknown errors
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: `Failed to process batch summary: ${message}` });
  }
}
