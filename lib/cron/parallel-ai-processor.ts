/**
 * Parallel AI Processing Engine for SEC Filing Summarization
 * 
 * Optimizations:
 * - Concurrent AI processing with intelligent backpressure management
 * - Circuit breaker integration for timeout protection
 * - Token usage optimization and cost tracking
 * - Smart queue management for optimal resource utilization
 * - Error isolation to prevent single failures from affecting the batch
 */

import { logger } from '../logging';
import { performanceMetrics } from '../monitoring/performanceMetrics';
import type { IntelligentCircuitBreaker } from '../services/circuitBreaker';

const parallelLogger = logger.child('parallel-ai-processor');

export interface ParallelAITask {
  id: string;
  filing: Record<string, unknown>;
  user: Record<string, unknown>;
  tier: string;
  tickerData: {
    symbol: string;
    cik: string;
    companyName: string;
  };
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BACKLOG';
  estimatedProcessingTime: number;
}

export interface ParallelAIResult {
  taskId: string;
  success: boolean;
  cost: number;
  processingTime: number;
  tokensUsed?: number;
  error?: string;
  cacheHit?: boolean;
}

export interface ParallelProcessingResult {
  totalTasks: number;
  completedTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalCost: number;
  totalTokens: number;
  averageProcessingTime: number;
  concurrencyAchieved: number;
  processingTime: number;
  errors: string[];
  cacheHitRate: number;
}

export interface ProcessingQueue {
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BACKLOG';
  tasks: ParallelAITask[];
  maxConcurrency: number;
  timeoutMs: number;
}

export class ParallelAIProcessor {
  private maxConcurrency: number;
  private circuitBreaker: IntelligentCircuitBreaker;
  private activePromises: Map<string, Promise<ParallelAIResult>> = new Map();
  private completedTasks: ParallelAIResult[] = [];
  private processingStartTime: number = 0;

  constructor(maxConcurrency: number, circuitBreaker: IntelligentCircuitBreaker) {
    this.maxConcurrency = maxConcurrency;
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Process multiple AI tasks in parallel with intelligent concurrency control
   */
  async processParallelAITasks(
    tasks: ParallelAITask[],
    maxProcessingTime: number = 240000 // 4 minutes for safety buffer
  ): Promise<ParallelProcessingResult> {
    this.processingStartTime = Date.now();
    const result: ParallelProcessingResult = {
      totalTasks: tasks.length,
      completedTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalCost: 0,
      totalTokens: 0,
      averageProcessingTime: 0,
      concurrencyAchieved: 0,
      processingTime: 0,
      errors: [],
      cacheHitRate: 0
    };

    if (tasks.length === 0) {
      result.processingTime = Date.now() - this.processingStartTime;
      return result;
    }

    parallelLogger.info(`Starting parallel AI processing for ${tasks.length} tasks`, {
      maxConcurrency: this.maxConcurrency,
      maxProcessingTime,
      tasksByPriority: this.groupTasksByPriority(tasks)
    });

    // Sort tasks by priority for optimal processing order
    const prioritizedTasks = this.prioritizeTasks(tasks);
    
    // Create processing queues by priority
    const queues = this.createPriorityQueues(prioritizedTasks);

    try {
      // Process each priority queue with appropriate concurrency
      for (const queue of queues) {
        const queueStartTime = Date.now();
        
        // Check circuit breaker before processing each queue
        const timeConstraints = this.circuitBreaker.calculateTimeConstraints();
        if (!timeConstraints.shouldContinue) {
          parallelLogger.warn(`Circuit breaker stopping parallel processing`, {
            remainingTime: timeConstraints.remaining,
            queuePriority: queue.priority,
            remainingTasks: queue.tasks.length
          });
          break;
        }

        // Calculate remaining time for this queue
        const remainingTime = Math.min(
          timeConstraints.remaining - 30000, // Leave 30s buffer
          maxProcessingTime - (Date.now() - this.processingStartTime)
        );

        if (remainingTime <= 0) {
          parallelLogger.warn(`No remaining time for queue processing`, {
            queuePriority: queue.priority,
            remainingTasks: queue.tasks.length
          });
          break;
        }

        parallelLogger.info(`Processing ${queue.priority} priority queue`, {
          tasksInQueue: queue.tasks.length,
          maxConcurrency: queue.maxConcurrency,
          remainingTime,
          timeoutMs: queue.timeoutMs
        });

        // Process queue with timeout protection
        const queueResult = await Promise.race([
          this.processQueue(queue),
          this.createTimeoutPromise(remainingTime, queue.priority)
        ]);

        // Update result metrics
        this.updateResultMetrics(result, queueResult);

        const queueDuration = Date.now() - queueStartTime;
        parallelLogger.info(`Completed ${queue.priority} priority queue`, {
          completedTasks: queueResult.completedTasks,
          successfulTasks: queueResult.successfulTasks,
          failedTasks: queueResult.failedTasks,
          queueDurationMs: queueDuration,
          averageConcurrency: queueResult.concurrencyAchieved
        });

        // Update concurrency metrics
        result.concurrencyAchieved = Math.max(result.concurrencyAchieved, queueResult.concurrencyAchieved);
      }

      // Calculate final metrics
      this.calculateFinalMetrics(result);

      parallelLogger.info(`Parallel AI processing completed`, {
        ...result,
        efficiency: result.totalTasks > 0 ? ((result.successfulTasks / result.totalTasks) * 100).toFixed(1) + '%' : 'N/A'
      });

    } catch (error) {
      parallelLogger.error('Parallel AI processing failed', { error });
      result.errors.push(error instanceof Error ? error.message : 'Unknown parallel processing error');
    }

    result.processingTime = Date.now() - this.processingStartTime;
    
    // Record performance metrics
    performanceMetrics.recordBatchProcessingMetrics({
      totalFilings: result.totalTasks,
      processedFilings: result.completedTasks,
      successfulUsers: result.successfulTasks,
      skippedFilings: result.totalTasks - result.completedTasks,
      errors: result.errors,
      processingTime: result.processingTime
    });

    return result;
  }

  /**
   * Process a single priority queue with controlled concurrency
   */
  private async processQueue(queue: ProcessingQueue): Promise<ParallelProcessingResult> {
    const queueResult: ParallelProcessingResult = {
      totalTasks: queue.tasks.length,
      completedTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalCost: 0,
      totalTokens: 0,
      averageProcessingTime: 0,
      concurrencyAchieved: 0,
      processingTime: 0,
      errors: [],
      cacheHitRate: 0
    };

    const startTime = Date.now();
    const semaphore = new Semaphore(queue.maxConcurrency);
    const processingPromises: Promise<void>[] = [];
    let maxConcurrentTasks = 0;

    for (const task of queue.tasks) {
      // Create promise for each task with semaphore control
      const taskPromise = this.processTaskWithSemaphore(task, semaphore, queue.timeoutMs)
        .then(result => {
          this.completedTasks.push(result);
          queueResult.completedTasks++;
          
          if (result.success) {
            queueResult.successfulTasks++;
            queueResult.totalCost += result.cost;
            queueResult.totalTokens += result.tokensUsed || 0;
          } else {
            queueResult.failedTasks++;
            if (result.error) {
              queueResult.errors.push(result.error);
            }
          }
          
          // Track peak concurrency
          maxConcurrentTasks = Math.max(maxConcurrentTasks, semaphore.getActiveCount());
        })
        .catch(error => {
          parallelLogger.error(`Task ${task.id} failed with exception`, { error });
          queueResult.failedTasks++;
          queueResult.errors.push(error instanceof Error ? error.message : 'Unknown task error');
        });

      processingPromises.push(taskPromise);
    }

    // Wait for all tasks to complete
    await Promise.allSettled(processingPromises);

    queueResult.concurrencyAchieved = maxConcurrentTasks;
    queueResult.processingTime = Date.now() - startTime;

    return queueResult;
  }

  /**
   * Process a single task with semaphore control and circuit breaker protection
   */
  private async processTaskWithSemaphore(
    task: ParallelAITask,
    semaphore: Semaphore,
    _timeoutMs: number
  ): Promise<ParallelAIResult> {
    const taskStartTime = Date.now();
    
    return semaphore.acquire(async () => {
      try {
        // Check circuit breaker before processing
        const shouldProcess = this.circuitBreaker.shouldProcessFiling(task.priority);
        if (!shouldProcess.shouldProcess) {
          return {
            taskId: task.id,
            success: false,
            cost: 0,
            processingTime: Date.now() - taskStartTime,
            error: `Circuit breaker blocked task: ${shouldProcess.reason}`
          };
        }

        // Use circuit breaker wrapper for processing
        const processResult = await this.circuitBreaker.wrapProcessing(
          async () => {
            return await this.processSingleAITask(task);
          },
          task.priority,
          task.estimatedProcessingTime
        );

        if (processResult.skipped) {
          return {
            taskId: task.id,
            success: false,
            cost: 0,
            processingTime: Date.now() - taskStartTime,
            error: 'Circuit breaker skipped task due to time constraints'
          };
        }

        return processResult.result || {
          taskId: task.id,
          success: false,
          cost: 0,
          processingTime: Date.now() - taskStartTime,
          error: 'Circuit breaker returned empty result'
        };

      } catch (error) {
        return {
          taskId: task.id,
          success: false,
          cost: 0,
          processingTime: Date.now() - taskStartTime,
          error: error instanceof Error ? error.message : 'Unknown task processing error'
        };
      }
    });
  }

  /**
   * Process a single AI task (actual AI processing logic)
   */
  private async processSingleAITask(task: ParallelAITask): Promise<ParallelAIResult> {
    const taskStartTime = Date.now();
    
    try {
      // Import the filing processor method
      const { CronFilingProcessor } = await import('./filing-processor');
      
      // Call the existing single filing processing method
      const result = await CronFilingProcessor.processSingleFiling(
        task.filing,
        task.user,
        task.tier,
        { symbol: task.tickerData.symbol, cik: task.tickerData.cik },
        { companyName: task.tickerData.companyName }
      );

      const processingTime = Date.now() - taskStartTime;

      return {
        taskId: task.id,
        success: result.success,
        cost: result.cost,
        processingTime,
        error: result.error,
        cacheHit: result.cost === 0 && result.success // Assume cache hit if no cost incurred
      };

    } catch (error) {
      const processingTime = Date.now() - taskStartTime;
      
      return {
        taskId: task.id,
        success: false,
        cost: 0,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown AI processing error'
      };
    }
  }

  /**
   * Prioritize tasks by importance and time sensitivity
   */
  private prioritizeTasks(tasks: ParallelAITask[]): ParallelAITask[] {
    const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'NORMAL': 2, 'BACKLOG': 3 };
    
    return tasks.sort((a, b) => {
      // First sort by priority
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by estimated processing time (shorter first for better throughput)
      return a.estimatedProcessingTime - b.estimatedProcessingTime;
    });
  }

  /**
   * Create processing queues by priority with appropriate concurrency limits
   */
  private createPriorityQueues(tasks: ParallelAITask[]): ProcessingQueue[] {
    const queues: ProcessingQueue[] = [];
    const tasksByPriority = this.groupTasksByPriority(tasks);

    // Define queue configurations by priority
    const queueConfigs = {
      'CRITICAL': { maxConcurrency: Math.min(this.maxConcurrency, 2), timeoutMs: 120000 }, // 2 minutes
      'HIGH': { maxConcurrency: Math.min(this.maxConcurrency, 3), timeoutMs: 90000 },      // 1.5 minutes
      'NORMAL': { maxConcurrency: this.maxConcurrency, timeoutMs: 60000 },                 // 1 minute
      'BACKLOG': { maxConcurrency: Math.min(this.maxConcurrency + 1, 4), timeoutMs: 45000 } // 45 seconds
    };

    // Create queues in priority order
    for (const [priority, config] of Object.entries(queueConfigs)) {
      const priorityTasks = tasksByPriority[priority as keyof typeof tasksByPriority] || [];
      if (priorityTasks.length > 0) {
        queues.push({
          priority: priority as 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BACKLOG',
          tasks: priorityTasks,
          maxConcurrency: config.maxConcurrency,
          timeoutMs: config.timeoutMs
        });
      }
    }

    return queues;
  }

  /**
   * Group tasks by priority level
   */
  private groupTasksByPriority(tasks: ParallelAITask[]): Record<string, ParallelAITask[]> {
    return tasks.reduce((groups, task) => {
      if (!groups[task.priority]) {
        groups[task.priority] = [];
      }
      groups[task.priority].push(task);
      return groups;
    }, {} as Record<string, ParallelAITask[]>);
  }

  /**
   * Create a timeout promise for queue processing
   */
  private async createTimeoutPromise(_timeoutMs: number, priority: string): Promise<ParallelProcessingResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Queue processing timeout after ${_timeoutMs}ms for priority: ${priority}`));
      }, _timeoutMs);
    });
  }

  /**
   * Update result metrics from queue processing
   */
  private updateResultMetrics(result: ParallelProcessingResult, queueResult: ParallelProcessingResult): void {
    result.completedTasks += queueResult.completedTasks;
    result.successfulTasks += queueResult.successfulTasks;
    result.failedTasks += queueResult.failedTasks;
    result.totalCost += queueResult.totalCost;
    result.totalTokens += queueResult.totalTokens;
    result.errors.push(...queueResult.errors);
  }

  /**
   * Calculate final metrics for the processing result
   */
  private calculateFinalMetrics(result: ParallelProcessingResult): void {
    // Calculate average processing time
    if (this.completedTasks.length > 0) {
      const totalProcessingTime = this.completedTasks.reduce((sum, task) => sum + task.processingTime, 0);
      result.averageProcessingTime = totalProcessingTime / this.completedTasks.length;
    }

    // Calculate cache hit rate
    const cacheHits = this.completedTasks.filter(task => task.cacheHit).length;
    result.cacheHitRate = this.completedTasks.length > 0 ? (cacheHits / this.completedTasks.length) : 0;
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];
  private activeCount: number = 0;

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.permits > 0) {
        this.permits--;
        this.activeCount++;
        
        this.executeWithCleanup(fn)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.activeCount--;
            this.release();
          });
      } else {
        this.waitQueue.push(() => {
          this.permits--;
          this.activeCount++;
          
          this.executeWithCleanup(fn)
            .then(resolve)
            .catch(reject)
            .finally(() => {
              this.activeCount--;
              this.release();
            });
        });
      }
    });
  }

  private async executeWithCleanup<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw error;
    }
  }

  private release(): void {
    this.permits++;
    
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        next();
      }
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }
}