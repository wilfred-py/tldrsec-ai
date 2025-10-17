/**
 * Job Processing API Endpoint - Phase 2 Implementation
 * 
 * Provides HTTP endpoint for background job processing
 * Can be called by external schedulers or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging/index';
import { monitoring } from '../../../../lib/monitoring/index';
import { getJobWorker } from '../../../../lib/job-queue/worker';
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { generateSecureExecutionId } from '../../../../lib/security/secure-random';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time

const processLogger = logger.child('job-process-api');

/**
 * Process background jobs endpoint
 * Can be called manually or by external schedulers
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('job-process');
  
  processLogger.info('Job processing request started', {
    executionId,
    timestamp: new Date().toISOString()
  });

  try {
    // Optional authentication check (can be disabled for internal calls)
    const requireAuth = request.headers.get('x-require-auth') === 'true';
    
    if (requireAuth) {
      const authResult = await CronAuthService.validateCronRequest(request);
      if (!authResult.isValid) {
        processLogger.error('Authentication failed for job processing', {
          executionId,
          error: authResult.error,
          clientIP: authResult.clientIP
        });
        
        return NextResponse.json(
          { 
            success: false, 
            executionId,
            error: 'Authentication failed',
            reason: authResult.error || 'Invalid credentials'
          },
          { status: 401 }
        );
      }
    }

    // Get worker instance
    const worker = getJobWorker();
    const workerStatus = worker.getStatus();

    processLogger.info('Worker status before processing', {
      executionId,
      workerId: workerStatus.workerId,
      isRunning: workerStatus.isRunning,
      activeJobs: workerStatus.activeJobs
    });

    // Ensure worker is running
    if (!workerStatus.isRunning) {
      processLogger.info('Starting worker for job processing', { executionId });
      await worker.start();
    }

    // Process a batch of jobs
    const batchResult = await worker.processBatch();

    const totalTime = Date.now() - startTime;

    // Record metrics
    monitoring.incrementCounter('job_process_api.requests', 1);
    monitoring.recordTiming('job_process_api.duration', totalTime);
    
    if (batchResult.processed > 0) {
      monitoring.incrementCounter('job_process_api.jobs_processed', batchResult.processed);
    }
    
    if (batchResult.errors > 0) {
      monitoring.incrementCounter('job_process_api.jobs_failed', batchResult.errors);
    }

    processLogger.info('Job processing completed', {
      executionId,
      processed: batchResult.processed,
      errors: batchResult.errors,
      totalTime,
      workerId: workerStatus.workerId
    });

    return NextResponse.json({
      success: true,
      executionId,
      message: `Processed ${batchResult.processed} jobs`,
      data: {
        jobsProcessed: batchResult.processed,
        jobsErrored: batchResult.errors,
        workerId: workerStatus.workerId,
        activeJobs: worker.getStatus().activeJobs
      },
      metadata: {
        processingTime: totalTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    processLogger.error('Job processing failed', {
      executionId,
      error: errorMessage,
      totalTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Record error metrics
    monitoring.incrementCounter('job_process_api.errors', 1);

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: errorMessage,
        code: 'JOB_PROCESSING_ERROR',
        metadata: {
          processingTime: totalTime,
          retryable: true
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Get job processing status
 */
export async function GET(request: NextRequest) {
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('job-status');
  
  try {
    const worker = getJobWorker();
    const status = worker.getStatus();

    // Get basic queue statistics
    const { JobQueueService } = await import('../../../../lib/job-queue/index');
    
    const pendingJobs = await JobQueueService.getJobsToProcess(50);
    const jobStats = {
      pending: pendingJobs.length,
      byType: pendingJobs.reduce((acc, job) => {
        acc[job.jobType] = (acc[job.jobType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    processLogger.info('Job status requested', {
      executionId,
      workerStatus: status,
      queueStats: jobStats
    });

    return NextResponse.json({
      success: true,
      executionId,
      worker: status,
      queue: jobStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    processLogger.error('Failed to get job status', {
      executionId,
      error: errorMessage
    });

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: errorMessage
      },
      { status: 500 }
    );
  }
}

/**
 * Start the job worker
 */
export async function PUT(request: NextRequest) {
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('job-start');
  
  try {
    const worker = getJobWorker();
    await worker.start();
    
    const status = worker.getStatus();

    processLogger.info('Job worker started via API', {
      executionId,
      workerId: status.workerId
    });

    return NextResponse.json({
      success: true,
      executionId,
      message: 'Job worker started',
      worker: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    processLogger.error('Failed to start job worker', {
      executionId,
      error: errorMessage
    });

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: errorMessage
      },
      { status: 500 }
    );
  }
}

/**
 * Stop the job worker
 */
export async function DELETE(request: NextRequest) {
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('job-stop');
  
  try {
    const { stopGlobalWorker } = await import('../../../../lib/job-queue/worker');
    await stopGlobalWorker();

    processLogger.info('Job worker stopped via API', {
      executionId
    });

    return NextResponse.json({
      success: true,
      executionId,
      message: 'Job worker stopped',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    processLogger.error('Failed to stop job worker', {
      executionId,
      error: errorMessage
    });

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: errorMessage
      },
      { status: 500 }
    );
  }
}