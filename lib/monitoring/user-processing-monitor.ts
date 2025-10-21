/**
 * User Processing Monitoring Integration
 * 
 * Provides comprehensive monitoring for user processing operations in the
 * SEC filing pipeline. Tracks processing success rates, performance metrics,
 * and integrates with the pipeline health monitoring system.
 */

import { logger } from '../logging';
import { recordUserProcessing } from './pipeline-health-monitoring-system';
import type { DatabaseUser, ProcessUserResult, TierStatus, CronResults } from '../cron/types';

const userProcessingLogger = logger.child('user-processing-monitor');

// User processing metrics types
export interface UserProcessingMetrics {
  totalUsers: number;
  successfulUsers: number;
  failedUsers: number;
  averageProcessingTime: number;
  totalFilingsProcessed: number;
  totalCostIncurred: number;
  errorsByType: Record<string, number>;
  processingByTier: Record<string, {
    users: number;
    filings: number;
    cost: number;
    successRate: number;
  }>;
  lastProcessingTime: Date;
}

export interface UserProcessingSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  usersToProcess: number;
  usersProcessed: number;
  usersSuccessful: number;
  usersFailed: number;
  totalFilings: number;
  totalCost: number;
  averageTimePerUser: number;
  errors: Array<{
    userId: string;
    error: string;
    errorType?: string;
    timestamp: Date;
  }>;
}

export interface UserProcessingResult {
  success: boolean;
  userId: string;
  processingTime: number;
  filingsProcessed?: number;
  cost?: number;
  error?: string;
  errorType?: string;
  tier?: string;
  metadata?: Record<string, any>;
}

/**
 * User Processing Monitor
 * 
 * Provides monitoring, metrics collection, and health tracking for user processing operations
 */
export class UserProcessingMonitor {
  private static instance: UserProcessingMonitor;
  private sessions = new Map<string, UserProcessingSession>();
  private globalMetrics: UserProcessingMetrics = this.initializeMetrics();
  private processingTimes: number[] = [];
  private readonly maxProcessingTimeHistory = 100;

  private constructor() {}

  public static getInstance(): UserProcessingMonitor {
    if (!UserProcessingMonitor.instance) {
      UserProcessingMonitor.instance = new UserProcessingMonitor();
    }
    return UserProcessingMonitor.instance;
  }

  /**
   * Start a new user processing session
   */
  startProcessingSession(sessionId: string, usersToProcess: number): UserProcessingSession {
    const session: UserProcessingSession = {
      sessionId,
      startTime: new Date(),
      usersToProcess,
      usersProcessed: 0,
      usersSuccessful: 0,
      usersFailed: 0,
      totalFilings: 0,
      totalCost: 0,
      averageTimePerUser: 0,
      errors: []
    };

    this.sessions.set(sessionId, session);

    userProcessingLogger.info('Started user processing session', {
      sessionId,
      usersToProcess,
      startTime: session.startTime
    });

    return session;
  }

  /**
   * Record processing result for a single user with comprehensive monitoring
   */
  async recordUserProcessingResult(
    sessionId: string,
    result: UserProcessingResult
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      userProcessingLogger.warn('Attempted to record result for unknown session', {
        sessionId,
        userId: result.userId
      });
      return;
    }

    // Update session metrics
    session.usersProcessed++;
    
    if (result.success) {
      session.usersSuccessful++;
      session.totalFilings += result.filingsProcessed || 0;
      session.totalCost += result.cost || 0;
    } else {
      session.usersFailed++;
      session.errors.push({
        userId: result.userId,
        error: result.error || 'Unknown error',
        errorType: result.errorType,
        timestamp: new Date()
      });
    }

    // Update global metrics
    this.updateGlobalMetrics(result);

    // Record processing time
    this.recordProcessingTime(result.processingTime);

    // Record in pipeline health monitoring system
    recordUserProcessing(
      result.userId,
      'user_filing_processing',
      result.success,
      result.processingTime,
      {
        tier: result.tier,
        filingsProcessed: result.filingsProcessed,
        cost: result.cost,
        errorType: result.errorType,
        sessionId
      }
    );

    userProcessingLogger.debug('Recorded user processing result', {
      sessionId,
      userId: result.userId,
      success: result.success,
      processingTime: result.processingTime,
      filingsProcessed: result.filingsProcessed,
      cost: result.cost,
      tier: result.tier
    });
  }

  /**
   * Complete a processing session and generate final metrics
   */
  completeProcessingSession(sessionId: string): UserProcessingSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      userProcessingLogger.warn('Attempted to complete unknown session', { sessionId });
      return null;
    }

    session.endTime = new Date();
    const totalTime = session.endTime.getTime() - session.startTime.getTime();
    session.averageTimePerUser = session.usersProcessed > 0 ? totalTime / session.usersProcessed : 0;

    // Log session completion
    userProcessingLogger.info('Completed user processing session', {
      sessionId,
      duration: totalTime,
      usersToProcess: session.usersToProcess,
      usersProcessed: session.usersProcessed,
      usersSuccessful: session.usersSuccessful,
      usersFailed: session.usersFailed,
      successRate: session.usersProcessed > 0 ? (session.usersSuccessful / session.usersProcessed) * 100 : 0,
      totalFilings: session.totalFilings,
      totalCost: session.totalCost,
      averageTimePerUser: session.averageTimePerUser,
      errorCount: session.errors.length
    });

    // Clean up session after some time (keep for analysis)
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 60 * 60 * 1000); // Keep for 1 hour

    return session;
  }

  /**
   * Monitor a single user processing operation
   */
  async monitorUserProcessing<T>(
    userId: string,
    tier: string,
    operation: () => Promise<T>,
    sessionId?: string
  ): Promise<UserProcessingResult> {
    const startTime = Date.now();

    try {
      userProcessingLogger.debug('Starting monitored user processing', {
        userId,
        tier,
        sessionId
      });

      const result = await operation();
      const processingTime = Date.now() - startTime;

      // Extract metrics from result if it's a processing result
      const filingsProcessed = (result as any)?.filingsProcessed || 0;
      const cost = (result as any)?.cost || 0;

      const userResult: UserProcessingResult = {
        success: true,
        userId,
        processingTime,
        filingsProcessed,
        cost,
        tier,
        metadata: { sessionId }
      };

      // Record result if session is provided
      if (sessionId) {
        await this.recordUserProcessingResult(sessionId, userResult);
      }

      userProcessingLogger.debug('User processing completed successfully', {
        userId,
        tier,
        processingTime,
        filingsProcessed,
        cost,
        sessionId
      });

      return userResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = this.categorizeError(error);

      const userResult: UserProcessingResult = {
        success: false,
        userId,
        processingTime,
        error: errorMessage,
        errorType,
        tier,
        metadata: { sessionId }
      };

      // Record result if session is provided
      if (sessionId) {
        await this.recordUserProcessingResult(sessionId, userResult);
      }

      userProcessingLogger.error('User processing failed', error, {
        userId,
        tier,
        processingTime,
        errorType,
        sessionId
      });

      return userResult;
    }
  }

  /**
   * Monitor batch user processing operations
   */
  async monitorBatchProcessing(
    users: Array<{ userId: string; tier: string }>,
    processor: (userId: string, tier: string) => Promise<any>,
    options: {
      sessionId?: string;
      maxConcurrency?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<{
    session: UserProcessingSession;
    results: UserProcessingResult[];
    summary: {
      totalUsers: number;
      successful: number;
      failed: number;
      averageTime: number;
      totalFilings: number;
      totalCost: number;
    };
  }> {
    const { sessionId = `batch_${Date.now()}`, maxConcurrency = 5, timeoutMs = 300000 } = options;

    // Start processing session
    const session = this.startProcessingSession(sessionId, users.length);
    const results: UserProcessingResult[] = [];

    userProcessingLogger.info('Starting batch user processing monitoring', {
      sessionId,
      userCount: users.length,
      maxConcurrency,
      timeoutMs
    });

    try {
      // Process users in batches to control concurrency
      for (let i = 0; i < users.length; i += maxConcurrency) {
        const batch = users.slice(i, i + maxConcurrency);
        
        const batchPromises = batch.map(async ({ userId, tier }) => {
          return this.monitorUserProcessing(
            userId,
            tier,
            async () => {
              // Add timeout to individual operations
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('User processing timeout')), timeoutMs);
              });
              
              return Promise.race([processor(userId, tier), timeoutPromise]);
            },
            sessionId
          );
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        // Collect results
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            // Handle rejected promises
            results.push({
              success: false,
              userId: 'unknown',
              processingTime: timeoutMs,
              error: result.reason?.message || 'Batch processing failed',
              errorType: 'batch_processing_error'
            });
          }
        }
      }

      // Complete session
      const completedSession = this.completeProcessingSession(sessionId);

      // Generate summary
      const summary = {
        totalUsers: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        averageTime: results.reduce((sum, r) => sum + r.processingTime, 0) / results.length,
        totalFilings: results.reduce((sum, r) => sum + (r.filingsProcessed || 0), 0),
        totalCost: results.reduce((sum, r) => sum + (r.cost || 0), 0)
      };

      userProcessingLogger.info('Batch user processing completed', {
        sessionId,
        ...summary,
        successRate: (summary.successful / summary.totalUsers) * 100
      });

      return {
        session: completedSession || session,
        results,
        summary
      };

    } catch (error) {
      userProcessingLogger.error('Batch user processing failed', error, {
        sessionId,
        userCount: users.length
      });

      // Complete session with error
      this.completeProcessingSession(sessionId);

      throw error;
    }
  }

  /**
   * Get current user processing metrics
   */
  getCurrentMetrics(): UserProcessingMetrics {
    return { ...this.globalMetrics };
  }

  /**
   * Get active processing sessions
   */
  getActiveSessions(): UserProcessingSession[] {
    return Array.from(this.sessions.values()).filter(session => !session.endTime);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): UserProcessingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.globalMetrics = this.initializeMetrics();
    this.processingTimes = [];
    this.sessions.clear();
  }

  /**
   * Get health status based on recent processing performance
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    successRate: number;
    averageProcessingTime: number;
    recentErrors: string[];
    recommendations: string[];
  } {
    const { successfulUsers, failedUsers, averageProcessingTime, errorsByType } = this.globalMetrics;
    const totalUsers = successfulUsers + failedUsers;
    const successRate = totalUsers > 0 ? (successfulUsers / totalUsers) * 100 : 100;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];

    // Determine health status
    if (successRate < 75 || averageProcessingTime > 300000) { // 5 minutes
      status = 'unhealthy';
      recommendations.push('Immediate investigation of user processing failures required');
    } else if (successRate < 90 || averageProcessingTime > 120000) { // 2 minutes
      status = 'degraded';
      recommendations.push('Monitor user processing performance closely');
    }

    // Add specific recommendations
    if (errorsByType['timeout'] > 0) {
      recommendations.push('Increase processing timeouts or optimize processing logic');
    }

    if (errorsByType['budget_exceeded'] > 0) {
      recommendations.push('Review user budget limits and processing costs');
    }

    if (errorsByType['concurrency_conflict'] > 0) {
      recommendations.push('Investigate lock contention and concurrent processing issues');
    }

    return {
      status,
      successRate,
      averageProcessingTime,
      recentErrors: Object.keys(errorsByType),
      recommendations
    };
  }

  // Private methods

  private initializeMetrics(): UserProcessingMetrics {
    return {
      totalUsers: 0,
      successfulUsers: 0,
      failedUsers: 0,
      averageProcessingTime: 0,
      totalFilingsProcessed: 0,
      totalCostIncurred: 0,
      errorsByType: {},
      processingByTier: {},
      lastProcessingTime: new Date()
    };
  }

  private updateGlobalMetrics(result: UserProcessingResult): void {
    this.globalMetrics.totalUsers++;
    this.globalMetrics.lastProcessingTime = new Date();

    if (result.success) {
      this.globalMetrics.successfulUsers++;
      this.globalMetrics.totalFilingsProcessed += result.filingsProcessed || 0;
      this.globalMetrics.totalCostIncurred += result.cost || 0;
    } else {
      this.globalMetrics.failedUsers++;
      
      // Track errors by type
      if (result.errorType) {
        this.globalMetrics.errorsByType[result.errorType] = 
          (this.globalMetrics.errorsByType[result.errorType] || 0) + 1;
      }
    }

    // Update tier-specific metrics
    if (result.tier) {
      if (!this.globalMetrics.processingByTier[result.tier]) {
        this.globalMetrics.processingByTier[result.tier] = {
          users: 0,
          filings: 0,
          cost: 0,
          successRate: 0
        };
      }

      const tierMetrics = this.globalMetrics.processingByTier[result.tier];
      tierMetrics.users++;
      
      if (result.success) {
        tierMetrics.filings += result.filingsProcessed || 0;
        tierMetrics.cost += result.cost || 0;
      }
      
      tierMetrics.successRate = (tierMetrics.users > 0) ?
        ((tierMetrics.users - (this.globalMetrics.errorsByType[result.tier] || 0)) / tierMetrics.users) * 100 : 100;
    }
  }

  private recordProcessingTime(processingTime: number): void {
    this.processingTimes.push(processingTime);

    // Keep only recent processing times
    if (this.processingTimes.length > this.maxProcessingTimeHistory) {
      this.processingTimes = this.processingTimes.slice(-this.maxProcessingTimeHistory);
    }

    // Update average processing time
    this.globalMetrics.averageProcessingTime = 
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
  }

  private categorizeError(error: any): string {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('timeout')) return 'timeout';
    if (errorMessage.includes('budget')) return 'budget_exceeded';
    if (errorMessage.includes('lock') || errorMessage.includes('concurrency')) return 'concurrency_conflict';
    if (errorMessage.includes('validation')) return 'validation_error';
    if (errorMessage.includes('database')) return 'database_error';
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) return 'network_error';
    
    return 'unknown_error';
  }
}

/**
 * Enhanced wrapper for CronResults integration
 */
export function enhanceCronResultsWithMonitoring(
  results: CronResults,
  session: UserProcessingSession
): CronResults & { monitoring: { sessionId: string; sessionMetrics: UserProcessingSession } } {
  return {
    ...results,
    monitoring: {
      sessionId: session.sessionId,
      sessionMetrics: session
    }
  };
}

/**
 * Create a monitoring wrapper for user processing functions
 */
export function createUserProcessingWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: any[]) => {
    const monitor = UserProcessingMonitor.getInstance();
    const userId = args[0]?.id || args[0]?.userId || 'unknown';
    const tier = args[1] || 'unknown';
    
    return monitor.monitorUserProcessing(
      userId,
      tier,
      () => fn(...args),
      `wrapper_${operationName}_${Date.now()}`
    );
  }) as T;
}

// Export singleton instance
export const userProcessingMonitor = UserProcessingMonitor.getInstance();

// Export convenience functions
export { recordUserProcessing };

export default userProcessingMonitor;