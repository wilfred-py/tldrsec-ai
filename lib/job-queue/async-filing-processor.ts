/**
 * Async Filing Processor - Phase 2 Implementation
 * 
 * Decouples heavy AI summarization operations from HTTP request cycles
 * to achieve <1% timeout error rate through event-driven architecture
 */

import { logger } from '../logging/index';
import { monitoring } from '../monitoring/index';
import { JobQueueService, JobType, JobStatus } from './index';
import { generateAISummaryWithRetry } from '../../services/filing/summaryGenerationService';
import { EmailGenerationService } from '../email/generation-service';
import { FilingTransactionManager } from '../db/transaction-manager';
import { getPrismaClient } from '../db/prisma';
import { ProgressCheckpointService } from './progress-checkpoint';
import { CostMonitorService } from '../monitoring/cost-monitor';
import { v4 as uuidv4 } from 'uuid';

const asyncLogger = logger.child('async-filing-processor');
const prisma = getPrismaClient();

export interface AsyncFilingJob {
  filingId: string;
  userId: string;
  ticker: string;
  formType: string;
  filingUrl: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  metadata?: {
    userTier?: string;
    estimatedCost?: number;
    sourceContext?: 'cron' | 'manual' | 'webhook';
  };
}

export interface AsyncSummaryResult {
  summaryId: string;
  success: boolean;
  cost?: number;
  tokensUsed?: number;
  model?: string;
  processingTime?: number;
  error?: string;
  fallbackUsed?: boolean;
}

/**
 * Enhanced Job Queue Service for Async Filing Processing
 */
export class AsyncFilingProcessor {
  
  /**
   * Queue a filing for async AI summarization
   * Returns immediately with job ID, processing happens in background
   */
  static async queueFilingForSummarization(
    filing: AsyncFilingJob,
    options: {
      scheduledFor?: Date;
      maxRetries?: number;
      timeout?: number;
    } = {}
  ): Promise<{ jobId: string; estimatedCompletionTime: Date }> {
    const jobId = uuidv4();
    const now = new Date();
    
    // Calculate priority-based scheduling
    const priorityDelayMs = this.calculatePriorityDelay(filing.priority);
    const scheduledFor = options.scheduledFor || new Date(now.getTime() + priorityDelayMs);
    
    // Estimate completion time based on queue depth and processing time
    const estimatedCompletionTime = await this.estimateCompletionTime(filing.priority);
    
    asyncLogger.info('Queueing filing for async summarization', {
      jobId,
      filingId: filing.filingId,
      ticker: filing.ticker,
      priority: filing.priority,
      scheduledFor,
      estimatedCompletionTime
    });
    
    // Add job to queue
    await JobQueueService.addJob({
      jobType: 'ASYNC_SUMMARIZE_FILING',
      payload: {
        ...filing,
        jobId,
        queuedAt: now.toISOString()
      },
      priority: this.getPriorityScore(filing.priority),
      scheduledFor,
      idempotencyKey: `filing-${filing.filingId}-${filing.userId}`,
      maxAttempts: options.maxRetries || 3
    });
    
    // Record queueing metrics
    monitoring.incrementCounter('async_filing.queued', 1, {
      priority: filing.priority,
      formType: filing.formType,
      userTier: filing.metadata?.userTier || 'unknown'
    });
    
    return { jobId, estimatedCompletionTime };
  }
  
  /**
   * Process an async filing summarization job
   * Called by the job queue worker
   */
  static async processAsyncFilingSummarization(
    jobId: string,
    payload: AsyncFilingJob
  ): Promise<AsyncSummaryResult> {
    const startTime = Date.now();
    const correlationId = `async-${jobId}`;
    
    asyncLogger.info('Starting async filing summarization', {
      jobId,
      filingId: payload.filingId,
      ticker: payload.ticker,
      correlationId
    });
    
    // Initialize progress tracker for 60-second checkpoints
    const progressTracker = ProgressCheckpointService.createProgressTracker(jobId, 'FILING_FETCH');
    await progressTracker(5, { 
      currentStep: 'Starting filing processing',
      timeElapsed: Date.now() - startTime
    });
    
    try {
      // Use direct transaction processing instead of FilingTransactionManager
      // since we need to create SecFiling records on-demand
      const result = await prisma.$transaction(async (tx) => {
        // Step 1: Find or create ticker record
        // Since Ticker is user-specific, we need to find the user's ticker or create one
        const ticker = await tx.ticker.upsert({
          where: { 
            userId_symbol: {
              userId: payload.userId,
              symbol: payload.ticker
            }
          },
          update: {},
          create: {
            symbol: payload.ticker,
            companyName: `Company for ${payload.ticker}`, // Default name
            userId: payload.userId
          }
        });

        // Step 2: Check if filing already exists in SecFiling table
        let secFiling = await tx.secFiling.findFirst({
          where: {
            accessionNumber: payload.filingId, // filingId is the accession number
            tickerId: ticker.id
          }
        });

        // Step 3: Create SecFiling record if it doesn't exist
        if (!secFiling) {
          asyncLogger.info('Creating SecFiling record for async processing', {
            jobId,
            filingId: payload.filingId,
            ticker: payload.ticker
          });

          secFiling = await tx.secFiling.create({
            data: {
              tickerId: ticker.id,
              formType: payload.formType,
              filingDate: new Date(), // Use current date if not provided
              secUrl: payload.filingUrl,
              accessionNumber: payload.filingId,
              companyName: `Company for ${payload.ticker}`,
              cik: '' // Will be updated when available
            }
          });
        }

        // Step 4: Check if summary was already processed by another job
        const existingSummary = await tx.summary.findFirst({
          where: {
            secFilingId: secFiling.id,
            userId: payload.userId
          }
        });
        
        if (existingSummary) {
          asyncLogger.info('Filing already processed, skipping', {
            jobId,
            existingSummaryId: existingSummary.id,
            secFilingId: secFiling.id
          });
          
          return {
            summaryId: existingSummary.id,
            success: true,
            skipped: true
          };
        }
        
        // Step 5: Fetch and parse filing content
        await progressTracker(25, { 
          currentStep: 'Fetching filing content from SEC',
          timeElapsed: Date.now() - startTime
        });
        
        const filingContent = await this.fetchFilingContent(payload.filingUrl);
        
        await progressTracker(40, { 
          currentStep: 'Content fetched, starting AI processing',
          itemsProcessed: 1,
          totalItems: 3,
          timeElapsed: Date.now() - startTime
        });
        
        // Step 6: Generate AI summary with retry logic
        const aiStartTime = new Date();
        const summaryResult = await generateAISummaryWithRetry(
          filingContent,
          {
            formType: payload.formType,
            filingDate: new Date().toISOString(),
            filingUrl: payload.filingUrl
          },
          {
            ticker: payload.ticker,
            name: `Company for ${payload.ticker}`
          },
          2 // Max retries for async processing
        );
        const aiEndTime = new Date();
        
        if (summaryResult.processingStatus !== 'SUCCESS') {
          throw new Error(`AI summarization failed: ${summaryResult.processingError}`);
        }

        // Track API cost for this operation
        if (summaryResult.tokensUsed && summaryResult.cost && summaryResult.model) {
          await CostMonitorService.trackApiCall({
            jobId,
            model: summaryResult.model,
            inputTokens: Math.floor(summaryResult.tokensUsed * 0.8), // Estimate 80% input
            outputTokens: Math.floor(summaryResult.tokensUsed * 0.2), // Estimate 20% output
            requestTime: aiStartTime,
            responseTime: aiEndTime,
            success: true
          });
        }

        await progressTracker(75, { 
          currentStep: 'AI processing complete, creating summary record',
          itemsProcessed: 2,
          totalItems: 3,
          timeElapsed: Date.now() - startTime
        });
        
        // Step 7: Create summary record linked to SecFiling
        const summary = await tx.summary.create({
          data: {
            id: uuidv4(),
            secFilingId: secFiling.id, // Link to SecFiling instead of filingId
            userId: payload.userId,
            ticker: payload.ticker,
            formType: payload.formType,
            summary: summaryResult.summary,
            keyPoints: summaryResult.keyPoints,
            processingStatus: 'COMPLETED',
            tokensUsed: summaryResult.tokensUsed || 0,
            cost: summaryResult.cost || 0,
            model: summaryResult.model || 'unknown',
            processingTime: summaryResult.processingTime || 0,
            correlationId
          }
        });
        
        return {
          summaryId: summary.id,
          success: true,
          cost: summaryResult.cost,
          tokensUsed: summaryResult.tokensUsed,
          model: summaryResult.model,
          processingTime: summaryResult.processingTime,
          fallbackUsed: summaryResult.modelFallbackUsed
        };
      }, {
        timeout: 600000 // 10 minutes for async processing (increased for complex filings)
      });
      
      const processingTime = Date.now() - startTime;
      
      // Record success metrics
      monitoring.incrementCounter('async_filing.completed', 1, {
        priority: payload.priority,
        formType: payload.formType,
        fallbackUsed: result.fallbackUsed ? 'true' : 'false'
      });
      
      monitoring.recordTiming('async_filing.processing_time', processingTime);
      
      // Update progress to email sending phase
      const emailProgressTracker = ProgressCheckpointService.createProgressTracker(jobId, 'EMAIL_SENDING');
      await emailProgressTracker(90, { 
        currentStep: 'Triggering email notification',
        itemsProcessed: 3,
        totalItems: 3,
        timeElapsed: Date.now() - startTime
      });

      // Trigger email notification if configured
      if (!result.skipped) {
        await this.triggerEmailNotification(payload.userId, result.summaryId);
      }

      // Final progress checkpoint
      await emailProgressTracker(100, { 
        currentStep: 'Processing complete',
        itemsProcessed: 3,
        totalItems: 3,
        timeElapsed: Date.now() - startTime
      });
      
      asyncLogger.info('Async filing summarization completed', {
        jobId,
        summaryId: result.summaryId,
        processingTime,
        cost: result.cost,
        correlationId
      });
      
      return {
        ...result,
        processingTime
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Record failure metrics
      monitoring.incrementCounter('async_filing.failed', 1, {
        priority: payload.priority,
        formType: payload.formType,
        error: errorMessage
      });
      
      asyncLogger.error('Async filing summarization failed', {
        jobId,
        filingId: payload.filingId,
        error: errorMessage,
        processingTime,
        correlationId
      });
      
      return {
        summaryId: '',
        success: false,
        error: errorMessage,
        processingTime
      };
    }
  }
  
  /**
   * Fetch filing content from URL
   */
  private static async fetchFilingContent(filingUrl: string): Promise<string> {
    const response = await fetch(filingUrl, {
      headers: {
        'User-Agent': 'TLDRSEC.AI/1.0 (https://tldrsec.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch filing: ${response.status} ${response.statusText}`);
    }
    
    return await response.text();
  }
  
  /**
   * Calculate priority-based delay for job scheduling
   */
  private static calculatePriorityDelay(priority: string): number {
    switch (priority) {
      case 'HIGH': return 0; // Immediate
      case 'MEDIUM': return 30000; // 30 seconds
      case 'LOW': return 120000; // 2 minutes
      default: return 60000; // 1 minute default
    }
  }
  
  /**
   * Get numeric priority score for job queue ordering
   */
  private static getPriorityScore(priority: string): number {
    switch (priority) {
      case 'HIGH': return 10;
      case 'MEDIUM': return 5;
      case 'LOW': return 1;
      default: return 3;
    }
  }
  
  /**
   * Estimate completion time based on current queue depth
   */
  private static async estimateCompletionTime(priority: string): Promise<Date> {
    try {
      // Get current queue depth for this priority and higher
      const queueDepth = await prisma.jobQueue.count({
        where: {
          jobType: 'ASYNC_SUMMARIZE_FILING',
          status: {
            in: ['PENDING', 'PROCESSING', 'RETRYING']
          },
          priority: {
            gte: this.getPriorityScore(priority)
          }
        }
      });
      
      // Estimate processing time: base time + queue delay
      const baseProcessingTime = 45000; // 45 seconds average
      const queueDelay = queueDepth * baseProcessingTime * 0.5; // 50% concurrency factor
      
      return new Date(Date.now() + this.calculatePriorityDelay(priority) + queueDelay);
    } catch (error) {
      // Fallback estimate if DB query fails
      return new Date(Date.now() + this.calculatePriorityDelay(priority) + 120000);
    }
  }
  
  /**
   * Trigger email notification for completed summary
   */
  private static async triggerEmailNotification(userId: string, summaryId: string): Promise<void> {
    try {
      // Queue email notification job
      await JobQueueService.addJob({
        jobType: 'SEND_FILING_NOTIFICATION',
        payload: {
          userId,
          summaryId,
          notificationType: 'async_summary_complete'
        },
        priority: 3,
        scheduledFor: new Date(Date.now() + 5000), // 5 second delay
        maxAttempts: 3
      });
    } catch (error) {
      asyncLogger.error('Failed to queue email notification', {
        userId,
        summaryId,
        error
      });
    }
  }
  
  /**
   * Get async processing status for a filing
   */
  static async getProcessingStatus(filingId: string, userId: string): Promise<{
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NOT_FOUND';
    jobId?: string;
    summaryId?: string;
    estimatedCompletionTime?: Date;
    error?: string;
  }> {
    try {
      // Check for existing summary
      const summary = await prisma.summary.findFirst({
        where: {
          filingId,
          userId
        }
      });
      
      if (summary) {
        return {
          status: 'COMPLETED',
          summaryId: summary.id
        };
      }
      
      // Check for active job
      const job = await prisma.jobQueue.findFirst({
        where: {
          jobType: 'ASYNC_SUMMARIZE_FILING',
          payload: {
            path: ['filingId'],
            equals: filingId
          },
          status: {
            in: ['PENDING', 'PROCESSING', 'RETRYING']
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      if (job) {
        return {
          status: job.status === 'PROCESSING' ? 'PROCESSING' : 'QUEUED',
          jobId: job.id,
          estimatedCompletionTime: job.scheduledFor
        };
      }
      
      // Check for failed job
      const failedJob = await prisma.jobQueue.findFirst({
        where: {
          jobType: 'ASYNC_SUMMARIZE_FILING',
          payload: {
            path: ['filingId'],
            equals: filingId
          },
          status: 'FAILED'
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
      
      if (failedJob) {
        return {
          status: 'FAILED',
          jobId: failedJob.id,
          error: failedJob.lastError || 'Unknown error'
        };
      }
      
      return { status: 'NOT_FOUND' };
    } catch (error) {
      asyncLogger.error('Failed to get processing status', {
        filingId,
        userId,
        error
      });
      
      return {
        status: 'FAILED',
        error: 'Failed to retrieve status'
      };
    }
  }
}

// Export enhanced job types
export const ASYNC_JOB_TYPES = [
  'ASYNC_SUMMARIZE_FILING',
  'SEND_FILING_NOTIFICATION',
  'ASYNC_EMAIL_DIGEST',
  'ASYNC_FILING_CLEANUP'
] as const;

export type AsyncJobType = typeof ASYNC_JOB_TYPES[number];