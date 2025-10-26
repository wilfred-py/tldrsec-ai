/**
 * Batch Job Worker API Endpoint
 * 
 * Processes multiple jobs in batches to improve throughput while
 * respecting Vercel's 60-second timeout limit
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging/index';
import { monitoring } from '../../../../lib/monitoring/index';
import { getJobWorker } from '../../../../lib/job-queue/worker';
import { QueueManagerService } from '../../../../lib/job-queue/queue-manager';
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { generateSecureExecutionId } from '../../../../lib/security/secure-random';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 50; // 50 seconds to stay within Vercel limits

const workerLogger = logger.child('batch-job-worker');

/**
 * Process batch of background jobs endpoint
 * Processes up to 10 jobs with 50-second timeout protection
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('batch-worker');
  
  workerLogger.info('Batch job processing request started', {
    executionId,
    timestamp: new Date().toISOString()
  });

  try {
    // Optional authentication check
    const requireAuth = request.headers.get('x-require-auth') === 'true';
    
    if (requireAuth) {
      const authResult = await CronAuthService.validateCronRequest(request);
      if (!authResult.isValid) {
        workerLogger.error('Authentication failed for batch job processing', {
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

    workerLogger.info('Worker status before batch processing', {
      executionId,
      workerId: workerStatus.workerId,
      isRunning: workerStatus.isRunning,
      activeJobs: workerStatus.activeJobs
    });

    // Ensure worker is running
    if (!workerStatus.isRunning) {
      workerLogger.info('Starting worker for batch processing', { executionId });
      await worker.start();
    }

    // Process multiple batches within time limit
    const timeoutMs = 45000; // 45 seconds to leave buffer
    let totalProcessed = 0;
    let totalErrors = 0;
    let batchCount = 0;
    const maxBatches = 10; // Limit number of batches

    while (Date.now() - startTime < timeoutMs && batchCount < maxBatches) {
      const batchStartTime = Date.now();
      
      // Process one batch
      const batchResult = await worker.processBatch();
      
      if (batchResult.processed === 0 && batchResult.errors === 0) {
        // No more jobs to process
        workerLogger.info('No more jobs available, stopping batch processing', {
          executionId,
          batchCount,
          totalProcessed,
          totalErrors
        });
        break;
      }
      
      totalProcessed += batchResult.processed;
      totalErrors += batchResult.errors;
      batchCount++;
      
      const batchTime = Date.now() - batchStartTime;
      workerLogger.info('Batch completed', {
        executionId,
        batchNumber: batchCount,
        processed: batchResult.processed,
        errors: batchResult.errors,
        batchTime,
        totalProcessed,
        totalErrors
      });
      
      // Short delay between batches to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const totalTime = Date.now() - startTime;

    // Evaluate worker scaling based on queue conditions
    let scalingDecision;
    try {
      scalingDecision = await QueueManagerService.scaleWorkers();
      workerLogger.info('Worker scaling evaluation completed', {
        executionId,
        scalingAction: scalingDecision.action,
        currentWorkers: scalingDecision.currentWorkerCount,
        targetWorkers: scalingDecision.targetWorkerCount,
        queueUtilization: scalingDecision.queueUtilization,
        reason: scalingDecision.reason
      });
    } catch (error) {
      workerLogger.error('Worker scaling evaluation failed', {
        executionId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue without scaling on error
    }

    // Record metrics
    monitoring.incrementCounter('batch_worker_api.requests', 1);
    monitoring.recordTiming('batch_worker_api.duration', totalTime);
    
    if (totalProcessed > 0) {
      monitoring.incrementCounter('batch_worker_api.jobs_processed', totalProcessed);
    }
    
    if (totalErrors > 0) {
      monitoring.incrementCounter('batch_worker_api.jobs_failed', totalErrors);
    }

    const finalWorkerStatus = worker.getStatus();

    workerLogger.info('Batch job processing completed', {
      executionId,
      batchesProcessed: batchCount,
      totalProcessed,
      totalErrors,
      totalTime,
      workerId: finalWorkerStatus.workerId,
      activeJobs: finalWorkerStatus.activeJobs
    });

    return NextResponse.json({
      success: true,
      executionId,
      message: `Processed ${totalProcessed} jobs across ${batchCount} batches`,
      data: {
        batchesProcessed: batchCount,
        jobsProcessed: totalProcessed,
        jobsErrored: totalErrors,
        workerId: finalWorkerStatus.workerId,
        activeJobs: finalWorkerStatus.activeJobs,
        timeoutReached: Date.now() - startTime >= timeoutMs
      },
      scaling: scalingDecision ? {
        action: scalingDecision.action,
        currentWorkers: scalingDecision.currentWorkerCount,
        targetWorkers: scalingDecision.targetWorkerCount,
        queueUtilization: scalingDecision.queueUtilization,
        recommendation: scalingDecision.recommendedAction
      } : undefined,
      metadata: {
        processingTime: totalTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    workerLogger.error('Batch job processing failed', {
      executionId,
      error: errorMessage,
      totalTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Record error metrics
    monitoring.incrementCounter('batch_worker_api.errors', 1);

    return NextResponse.json(
      {
        success: false,
        executionId,
        error: errorMessage,
        code: 'BATCH_PROCESSING_ERROR',
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
 * Get batch worker status and queue information
 */
export async function GET(request: NextRequest) {
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('batch-status');
  
  try {
    const worker = getJobWorker();
    const status = worker.getStatus();

    // Get extended queue statistics from QueueManagerService
    const queueMetrics = await QueueManagerService.getQueueMetrics();
    const workerStatus = QueueManagerService.getWorkerStatus();
    const scalingConfig = QueueManagerService.getScalingConfig();
    
    const queueStats = {
      pending: queueMetrics.pendingJobs,
      processing: queueMetrics.processingJobs,
      queueDepth: queueMetrics.queueDepth,
      avgProcessingTime: queueMetrics.avgProcessingTime,
      oldestJobAge: queueMetrics.oldestPendingJobAge,
      byType: queueMetrics.jobTypeDistribution,
      byPriority: queueMetrics.priorityDistribution
    };

    workerLogger.info('Batch worker status requested', {
      executionId,
      workerStatus: status,
      queueStats
    });

    return NextResponse.json({
      success: true,
      executionId,
      worker: status,
      queue: queueStats,
      scaling: {
        config: scalingConfig,
        workers: workerStatus,
        utilization: queueStats.queueDepth > 0 ? 
          queueStats.queueDepth / (workerStatus.length * scalingConfig.maxJobsPerWorker) : 0
      },
      recommendations: {
        shouldTriggerProcessing: queueStats.pending > 0,
        estimatedProcessingTime: Math.ceil(queueStats.pending / 5) * 45, // Rough estimate
        priority: queueStats.byPriority['priority_10'] > 0 ? 'HIGH' : 
                 queueStats.byPriority['priority_5'] > 0 ? 'MEDIUM' : 'LOW',
        scalingAction: queueStats.queueDepth > (workerStatus.length * scalingConfig.maxJobsPerWorker * 0.75) ? 
          'Consider scaling up workers' : 
          queueStats.queueDepth < (workerStatus.length * scalingConfig.maxJobsPerWorker * 0.25) ? 
          'Consider scaling down workers' : 'Current capacity adequate'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    workerLogger.error('Failed to get batch worker status', {
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