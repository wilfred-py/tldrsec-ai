/**
 * Progress Checkpoint Service
 * 
 * Provides time-based progress tracking for long-running jobs to enable
 * timeout monitoring and admin visibility into job execution status
 */

import { logger } from '../logging/index';
import { monitoring } from '../monitoring/index';
import { getPrismaClient } from '../db/prisma';
import { v4 as uuidv4 } from 'uuid';

const checkpointLogger = logger.child('progress-checkpoint');
// Lazy accessor to avoid build-time initialization
const getPrisma = () => getPrismaClient();

export interface ProgressUpdate {
  jobId: string;
  phase: 'FILING_FETCH' | 'AI_PROCESSING' | 'EMAIL_SENDING' | 'CLEANUP';
  progress: number; // 0-100 percentage
  details?: {
    currentStep?: string;
    itemsProcessed?: number;
    totalItems?: number;
    timeElapsed?: number;
    estimatedTimeRemaining?: number;
    errorCount?: number;
    warnings?: string[];
    metadata?: Record<string, any>;
  };
}

export interface ProgressHistory {
  id: string;
  jobId: string;
  phase: string;
  progress: number;
  details: any;
  startedAt: Date;
  updatedAt: Date;
}

export interface TimeoutPattern {
  phase: string;
  averageTimeoutMinutes: number;
  timeoutCount: number;
  totalJobs: number;
  timeoutRate: number;
  commonCauses: string[];
}

/**
 * Progress Checkpoint Service
 * Tracks job progress with 60-second intervals for timeout monitoring
 */
export class ProgressCheckpointService {
  private static readonly CHECKPOINT_INTERVAL_MS = 60000; // 60 seconds
  private static readonly TIMEOUT_THRESHOLD_MS = 600000; // 10 minutes
  
  /**
   * Update progress for a job
   * Creates checkpoint entry with 60-second time-based tracking
   */
  static async updateProgress(update: ProgressUpdate): Promise<void> {
    try {
      const now = new Date();
      
      await getPrisma().jobProgress.create({
        data: {
          id: uuidv4(),
          jobId: update.jobId,
          phase: update.phase,
          progress: update.progress,
          details: update.details || {},
          startedAt: now,
          updatedAt: now
        }
      });

      // Record progress metrics
      monitoring.recordValue('job_progress.checkpoint', update.progress, {
        jobId: update.jobId,
        phase: update.phase
      });

      checkpointLogger.info('Progress checkpoint created', {
        jobId: update.jobId,
        phase: update.phase,
        progress: update.progress,
        timestamp: now.toISOString()
      });

      // Check if job is approaching timeout threshold
      await this.checkForTimeoutRisk(update.jobId);

    } catch (error) {
      checkpointLogger.error('Failed to update progress checkpoint', {
        jobId: update.jobId,
        phase: update.phase,
        error: error.message
      });
      
      // Don't throw - progress tracking is monitoring only
      monitoring.incrementCounter('job_progress.checkpoint_errors', 1, {
        jobId: update.jobId,
        phase: update.phase
      });
    }
  }

  /**
   * Get progress history for a job
   */
  static async getProgress(jobId: string): Promise<ProgressHistory[]> {
    try {
      const progressRecords = await getPrisma().jobProgress.findMany({
        where: { jobId },
        orderBy: { updatedAt: 'asc' }
      });

      return progressRecords.map(record => ({
        id: record.id,
        jobId: record.jobId,
        phase: record.phase,
        progress: record.progress,
        details: record.details,
        startedAt: record.startedAt,
        updatedAt: record.updatedAt
      }));

    } catch (error) {
      checkpointLogger.error('Failed to get progress history', {
        jobId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Analyze timeout patterns for admin insights
   */
  static async analyzeTimeoutPatterns(
    startDate: Date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    endDate: Date = new Date()
  ): Promise<TimeoutPattern[]> {
    try {
      // Get jobs that were flagged for timeout
      const timeoutJobs = await getPrisma().jobQueue.findMany({
        where: {
          timeoutFlagged: true,
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          progress: {
            orderBy: { updatedAt: 'desc' },
            take: 1 // Get last progress update
          }
        }
      });

      // Get total jobs for comparison
      const totalJobs = await getPrisma().jobQueue.count({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      // Group by phase and analyze patterns
      const phasePatterns = new Map<string, {
        timeoutCount: number;
        totalJobs: number;
        timeoutTimes: number[];
        errors: string[];
      }>();

      for (const job of timeoutJobs) {
        const lastProgress = job.progress[0];
        const phase = lastProgress?.phase || 'UNKNOWN';
        
        if (!phasePatterns.has(phase)) {
          phasePatterns.set(phase, {
            timeoutCount: 0,
            totalJobs: 0,
            timeoutTimes: [],
            errors: []
          });
        }

        const pattern = phasePatterns.get(phase)!;
        pattern.timeoutCount++;
        
        if (job.executionTime) {
          pattern.timeoutTimes.push(job.executionTime);
        }
        
        if (job.lastError) {
          pattern.errors.push(job.lastError);
        }
      }

      // Convert to timeout patterns
      const patterns: TimeoutPattern[] = [];
      
      for (const [phase, data] of phasePatterns.entries()) {
        const averageTimeoutMinutes = data.timeoutTimes.length > 0
          ? data.timeoutTimes.reduce((a, b) => a + b, 0) / data.timeoutTimes.length / 60000
          : 0;

        // Analyze common error causes
        const errorCounts = data.errors.reduce((acc, error) => {
          const key = error.toLowerCase();
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const commonCauses = Object.entries(errorCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3)
          .map(([cause]) => cause);

        patterns.push({
          phase,
          averageTimeoutMinutes,
          timeoutCount: data.timeoutCount,
          totalJobs,
          timeoutRate: data.timeoutCount / Math.max(totalJobs, 1),
          commonCauses
        });
      }

      return patterns.sort((a, b) => b.timeoutRate - a.timeoutRate);

    } catch (error) {
      checkpointLogger.error('Failed to analyze timeout patterns', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Flag long-running jobs (>10 minutes) for timeout monitoring
   */
  static async flagLongRunningJobs(): Promise<string[]> {
    try {
      const tenMinutesAgo = new Date(Date.now() - this.TIMEOUT_THRESHOLD_MS);
      
      // Find jobs that started more than 10 minutes ago and are still running
      const longRunningJobs = await getPrisma().jobQueue.findMany({
        where: {
          status: {
            in: ['PENDING', 'PROCESSING']
          },
          startedAt: {
            lte: tenMinutesAgo
          },
          timeoutFlagged: false
        }
      });

      const flaggedJobIds: string[] = [];

      // Flag these jobs for timeout
      for (const job of longRunningJobs) {
        await getPrisma().jobQueue.update({
          where: { id: job.id },
          data: { 
            timeoutFlagged: true,
            lastError: `Job flagged for timeout after ${this.TIMEOUT_THRESHOLD_MS / 60000} minutes`
          }
        });

        flaggedJobIds.push(job.id);
        
        monitoring.incrementCounter('job_queue.timeout_flagged', 1, {
          jobType: job.jobType,
          priority: String(job.priority)
        });
      }

      if (flaggedJobIds.length > 0) {
        checkpointLogger.warn('Flagged long-running jobs for timeout', {
          jobCount: flaggedJobIds.length,
          thresholdMinutes: this.TIMEOUT_THRESHOLD_MS / 60000,
          flaggedJobs: flaggedJobIds
        });
      }

      return flaggedJobIds;

    } catch (error) {
      checkpointLogger.error('Failed to flag long-running jobs', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Check if a specific job is approaching timeout threshold
   */
  private static async checkForTimeoutRisk(jobId: string): Promise<void> {
    try {
      const job = await getPrisma().jobQueue.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          startedAt: true,
          status: true,
          timeoutFlagged: true
        }
      });

      if (!job || !job.startedAt || job.timeoutFlagged) {
        return;
      }

      const runningTime = Date.now() - job.startedAt.getTime();
      const timeoutWarningThreshold = this.TIMEOUT_THRESHOLD_MS * 0.8; // 80% of threshold

      if (runningTime > timeoutWarningThreshold) {
        checkpointLogger.warn('Job approaching timeout threshold', {
          jobId,
          runningTimeMinutes: runningTime / 60000,
          thresholdMinutes: this.TIMEOUT_THRESHOLD_MS / 60000,
          warningThresholdMinutes: timeoutWarningThreshold / 60000
        });

        monitoring.incrementCounter('job_queue.timeout_warning', 1, {
          jobId
        });
      }

    } catch (error) {
      checkpointLogger.error('Failed to check timeout risk', {
        jobId,
        error: error.message
      });
    }
  }

  /**
   * Create a time-based progress tracker for a job
   * Returns a function that can be called to update progress every 60 seconds
   */
  static createProgressTracker(
    jobId: string,
    phase: ProgressUpdate['phase']
  ): (progress: number, details?: ProgressUpdate['details']) => Promise<void> {
    let lastUpdate = 0;
    
    return async (progress: number, details?: ProgressUpdate['details']): Promise<void> => {
      const now = Date.now();
      
      // Only update if 60 seconds have passed since last update
      if (now - lastUpdate >= this.CHECKPOINT_INTERVAL_MS) {
        await this.updateProgress({
          jobId,
          phase,
          progress,
          details: {
            ...details,
            timeElapsed: now - (details?.timeElapsed || now),
            lastCheckpoint: new Date().toISOString()
          }
        });
        
        lastUpdate = now;
      }
    };
  }

  /**
   * Clean up old progress records (older than 30 days)
   */
  static async cleanupOldProgress(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const deletedCount = await getPrisma().jobProgress.deleteMany({
        where: {
          updatedAt: {
            lt: thirtyDaysAgo
          }
        }
      });

      if (deletedCount.count > 0) {
        checkpointLogger.info('Cleaned up old progress records', {
          deletedCount: deletedCount.count,
          beforeDate: thirtyDaysAgo.toISOString()
        });
      }

      return deletedCount.count;

    } catch (error) {
      checkpointLogger.error('Failed to cleanup old progress records', {
        error: error.message
      });
      return 0;
    }
  }
}