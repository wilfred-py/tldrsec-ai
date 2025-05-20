import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logging';
import { monitoring } from '@/lib/monitoring';
import { JobQueueService } from '@/lib/job-queue';
import { 
  appRouterAsyncHandler, 
  createInternalError,
  ApiError,
  ErrorCode
} from '@/lib/error-handling';

// Initialize Prisma client
const prisma = new PrismaClient();

// Component logger
const componentLogger = logger.child('filings-processor');

// Define a type for SEC Filing with necessary fields
interface SECFiling {
  id: string;
  filingType: string;
  url: string;
  tickerId: string;
  filingDate: Date;
  ticker?: {
    symbol: string;
    companyName?: string;
  };
}

/**
 * Process new SEC filings
 * Find unprocessed filings in the database and queue summarization jobs
 */
export const GET = appRouterAsyncHandler(async (request: Request) => {
  const startTime = Date.now();
  
  // Extract parameters
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  
  componentLogger.info(`Starting filing processing job`, { limit });
  
  // Start tracking performance
  monitoring.incrementCounter('filings.processing_started', 1);
  
  try {
    // Find unprocessed filings
    const unprocessedFilings = await prisma.secFiling.findMany({
      where: {
        summary: null
      },
      include: {
        ticker: true
      },
      orderBy: [
        // Process most recent filings first
        { filingDate: 'desc' },
        // Then by filing type priority
        { filingType: 'asc' } 
      ],
      take: limit
    });
    
    componentLogger.info(`Found ${unprocessedFilings.length} unprocessed filings`);
    
    if (unprocessedFilings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unprocessed filings found',
        processed: 0
      });
    }
    
    // Process each filing
    const results = await Promise.all(
      unprocessedFilings.map(async (filing: SECFiling) => {
        try {
          // Create a summary record
          const summary = await prisma.summary.create({
            data: {
              id: uuidv4(),
              filingId: filing.id,
              filingType: filing.filingType,
              filingUrl: filing.url,
              tickerId: filing.tickerId,
              processingStatus: 'PENDING',
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
          
          componentLogger.info(`Created summary record for filing`, {
            filingId: filing.id,
            summaryId: summary.id,
            filingType: filing.filingType,
            ticker: filing.ticker?.symbol
          });
          
          // Determine priority based on filing type
          let priority = 5; // Default priority
          
          // Higher priority for important filing types
          if (filing.filingType === '8-K') {
            priority = 8; // Breaking news gets higher priority
          } else if (filing.filingType === '10-K') {
            priority = 7; // Annual reports are important
          } else if (filing.filingType === '10-Q') {
            priority = 6; // Quarterly reports are also important
          }
          
          // Queue a job to summarize the filing
          const job = await JobQueueService.addJob({
            jobType: 'SUMMARIZE_FILING',
            payload: {
              summaryId: summary.id,
              filingId: filing.id,
              filingType: filing.filingType
            },
            priority,
            idempotencyKey: `summarize-filing-${summary.id}`
          });
          
          componentLogger.info(`Queued job for summarization`, {
            filingId: filing.id,
            summaryId: summary.id,
            jobId: job.id,
            priority
          });
          
          // Track metric for job creation
          monitoring.incrementCounter('filings.job_created', 1, {
            filingType: filing.filingType
          });
          
          return {
            filingId: filing.id,
            summaryId: summary.id,
            jobId: job.id,
            success: true
          };
        } catch (error) {
          componentLogger.error(`Error processing filing ${filing.id}`, {
            filingId: filing.id,
            error
          });
          
          monitoring.incrementCounter('filings.processing_error', 1, {
            filingType: filing.filingType
          });
          
          return {
            filingId: filing.id,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    // Compile results
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log completion
    componentLogger.info(`Completed filing processing`, {
      processed: unprocessedFilings.length,
      succeeded,
      failed,
      duration
    });
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: `Filing processing completed`,
      processed: unprocessedFilings.length,
      succeeded,
      failed,
      duration
    });
  } catch (error) {
    // Track processing failure
    monitoring.incrementCounter('filings.processor_error', 1);
    
    if (error instanceof Error) {
      throw createInternalError(`Failed to process filings: ${error.message}`, { error });
    }
    throw error;
  }
}); 