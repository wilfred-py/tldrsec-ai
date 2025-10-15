/**
 * Async Response Service - Phase 2 Implementation
 * 
 * Decouples HTTP request/response cycles from heavy processing
 * Returns immediate responses while queueing work for background processing
 */

import { NextResponse } from 'next/server';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { AsyncFilingProcessor, AsyncFilingJob } from '../job-queue/async-filing-processor';
import { v4 as uuidv4 } from 'uuid';

const responseLogger = logger.child('async-response-service');

export interface AsyncResponseResult {
  success: boolean;
  executionId: string;
  message: string;
  data: {
    filingsQueued: number;
    jobIds: string[];
    estimatedCompletionTime: Date;
  };
  metadata: {
    processingTime: number;
    queueDepth?: number;
    userTier?: string;
  };
}

export interface AsyncErrorResponse {
  success: false;
  executionId: string;
  error: string;
  code: string;
  metadata: {
    processingTime: number;
    retryable: boolean;
  };
}

/**
 * Service for handling async processing responses
 */
export class AsyncResponseService {
  
  /**
   * Process user filing requests asynchronously
   * Returns immediately with job tracking information
   */
  static async processUserFilingsAsync(
    userId: string,
    userTier: string,
    filings: Array<{
      filingId: string;
      ticker: string;
      formType: string;
      filingUrl: string;
    }>,
    executionId: string = uuidv4()
  ): Promise<AsyncResponseResult> {
    const startTime = Date.now();
    
    responseLogger.info('Processing user filings asynchronously', {
      executionId,
      userId,
      userTier,
      filingCount: filings.length
    });
    
    const jobIds: string[] = [];
    let estimatedCompletionTime = new Date();
    
    try {
      // Queue each filing for async processing
      for (const filing of filings) {
        const priority = this.determinePriority(userTier);
        
        const asyncJob: AsyncFilingJob = {
          filingId: filing.filingId,
          userId,
          ticker: filing.ticker,
          formType: filing.formType,
          filingUrl: filing.filingUrl,
          priority,
          metadata: {
            userTier,
            sourceContext: 'cron'
          }
        };
        
        const { jobId, estimatedCompletionTime: jobCompletionTime } = 
          await AsyncFilingProcessor.queueFilingForSummarization(asyncJob);
        
        jobIds.push(jobId);
        
        // Use the latest completion time as overall estimate
        if (jobCompletionTime > estimatedCompletionTime) {
          estimatedCompletionTime = jobCompletionTime;
        }
      }
      
      const processingTime = Date.now() - startTime;
      
      // Record metrics
      monitoring.incrementCounter('async_response.filings_queued', filings.length, {
        userTier,
        priority: this.determinePriority(userTier)
      });
      
      monitoring.recordTiming('async_response.queue_time', processingTime);
      
      responseLogger.info('Successfully queued filings for async processing', {
        executionId,
        userId,
        jobCount: jobIds.length,
        processingTime,
        estimatedCompletionTime
      });
      
      return {
        success: true,
        executionId,
        message: `Queued ${filings.length} filings for processing`,
        data: {
          filingsQueued: filings.length,
          jobIds,
          estimatedCompletionTime
        },
        metadata: {
          processingTime,
          userTier
        }
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Record error metrics
      monitoring.incrementCounter('async_response.queue_error', 1, {
        userTier,
        error: errorMessage
      });
      
      responseLogger.error('Failed to queue filings for async processing', {
        executionId,
        userId,
        error: errorMessage,
        processingTime
      });
      
      throw error;
    }
  }
  
  /**
   * Create immediate HTTP response for cron endpoint
   * Maintains compatibility while enabling async processing
   */
  static createImmediateResponse(
    result: AsyncResponseResult,
    httpStatus: number = 200
  ): NextResponse {
    const responseBody = {
      success: result.success,
      executionId: result.executionId,
      message: result.message,
      timestamp: new Date().toISOString(),
      processing: {
        mode: 'async',
        status: 'queued',
        filingsQueued: result.data.filingsQueued,
        estimatedCompletionTime: result.data.estimatedCompletionTime,
        trackingIds: result.data.jobIds
      },
      performance: {
        responseTime: result.metadata.processingTime,
        queueDepth: result.metadata.queueDepth
      }
    };
    
    // Add response headers for async processing
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Processing-Mode': 'async',
      'X-Execution-ID': result.executionId,
      'X-Estimated-Completion': result.data.estimatedCompletionTime.toISOString(),
      'X-Filings-Queued': result.data.filingsQueued.toString()
    });
    
    return new NextResponse(JSON.stringify(responseBody), {
      status: httpStatus,
      headers
    });
  }
  
  /**
   * Create error response for async processing failures
   */
  static createErrorResponse(
    error: AsyncErrorResponse,
    httpStatus: number = 500
  ): NextResponse {
    const responseBody = {
      success: false,
      executionId: error.executionId,
      error: error.error,
      code: error.code,
      timestamp: new Date().toISOString(),
      processing: {
        mode: 'async',
        status: 'failed',
        retryable: error.metadata.retryable
      },
      performance: {
        responseTime: error.metadata.processingTime
      }
    };
    
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Processing-Mode': 'async',
      'X-Execution-ID': error.executionId,
      'X-Error-Code': error.code,
      'X-Retryable': error.metadata.retryable.toString()
    });
    
    return new NextResponse(JSON.stringify(responseBody), {
      status: httpStatus,
      headers
    });
  }
  
  /**
   * Get status of async processing jobs
   */
  static async getAsyncProcessingStatus(
    jobIds: string[]
  ): Promise<{
    completed: number;
    processing: number;
    queued: number;
    failed: number;
    details: Array<{
      jobId: string;
      status: string;
      progress?: number;
      error?: string;
    }>;
  }> {
    // Implementation would query job queue for status
    // This is a placeholder for the status tracking system
    return {
      completed: 0,
      processing: 0,
      queued: jobIds.length,
      failed: 0,
      details: jobIds.map(jobId => ({
        jobId,
        status: 'queued'
      }))
    };
  }
  
  /**
   * Determine processing priority based on user tier
   */
  private static determinePriority(userTier: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    switch (userTier?.toLowerCase()) {
      case 'premium':
      case 'pro':
        return 'HIGH';
      case 'standard':
      case 'basic':
        return 'MEDIUM';
      case 'free':
      default:
        return 'LOW';
    }
  }
  
  /**
   * Calculate response timeout based on execution context
   */
  static calculateResponseTimeout(
    remainingTime: number,
    maxAsyncResponseTime: number = 30000 // 30 seconds max for HTTP response
  ): number {
    // Use minimum of remaining time or max async response time
    return Math.min(remainingTime * 0.8, maxAsyncResponseTime);
  }
  
  /**
   * Check if request should use async processing
   */
  static shouldUseAsyncProcessing(
    filingCount: number,
    userTier: string,
    remainingTime: number
  ): boolean {
    // Use async processing if:
    // 1. More than 2 filings to process
    // 2. Less than 60 seconds remaining
    // 3. Free tier users (to prevent resource abuse)
    
    if (filingCount > 2) return true;
    if (remainingTime < 60000) return true;
    if (userTier?.toLowerCase() === 'free') return true;
    
    return false;
  }
}

/**
 * Webhook notification service for async completion
 */
export class AsyncWebhookService {
  
  /**
   * Send webhook notification when async processing completes
   */
  static async notifyProcessingComplete(
    userId: string,
    executionId: string,
    results: Array<{
      filingId: string;
      summaryId?: string;
      success: boolean;
      error?: string;
    }>
  ): Promise<void> {
    try {
      // Implementation would send webhook to configured user endpoint
      // This is a placeholder for webhook functionality
      
      responseLogger.info('Webhook notification sent', {
        userId,
        executionId,
        resultCount: results.length,
        successful: results.filter(r => r.success).length
      });
      
    } catch (error) {
      responseLogger.error('Failed to send webhook notification', {
        userId,
        executionId,
        error
      });
    }
  }
}