/**
 * Intelligent Circuit Breaker for 524 Timeout Prevention
 * 
 * Provides dynamic timeout management and graceful degradation
 * to prevent Cloudflare 524 timeout errors in SEC filing processing
 */

import { logger } from '../logging';

export interface CircuitBreakerConfig {
  effectiveTimeoutMs: number;     // 540,000ms (9 minutes)
  minFilingProcessingTime: number; // 90,000ms (1.5 minutes)
  safetyBuffer: number;           // 30,000ms (30 seconds)
  maxConcurrentProcessing: number; // 2 concurrent AI operations
  maxBacklogFilings: number;      // 20 maximum backlog filings per run
}

export interface TimeConstraints {
  startTime: number;
  elapsed: number;
  remaining: number;
  shouldContinue: boolean;
  shouldSkipBacklog: boolean;
  remainingFilingsCapacity: number;
}

export interface ProcessingPriority {
  CRITICAL: number;  // Recent 10-K, 10-Q filings
  HIGH: number;      // Form 4, 8-K filings  
  NORMAL: number;    // Other filings
  BACKLOG: number;   // Historical unprocessed
}

export class IntelligentCircuitBreaker {
  private config: CircuitBreakerConfig;
  private startTime: number;
  private activations: number = 0;
  private skippedFilings: number = 0;
  private processingPriority: ProcessingPriority;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      effectiveTimeoutMs: 540000,     // 9 minutes (match Cloudflare Worker)
      minFilingProcessingTime: 90000, // 1.5 minutes per filing
      safetyBuffer: 30000,            // 30 seconds buffer
      maxConcurrentProcessing: 2,     // Limit concurrent AI calls
      maxBacklogFilings: 20,          // Maximum backlog filings per run
      ...config
    };

    this.processingPriority = {
      CRITICAL: 1,  // Process first
      HIGH: 2,      // Process second
      NORMAL: 3,    // Process third
      BACKLOG: 4    // Process last (skip if time constrained)
    };

    this.startTime = Date.now();
    
    logger.info('Circuit breaker initialized for 524 timeout prevention', {
      config: this.config,
      expectedMaxFilings: Math.floor(this.config.effectiveTimeoutMs / this.config.minFilingProcessingTime)
    });
  }

  /**
   * Calculate current time constraints and processing capacity
   */
  calculateTimeConstraints(): TimeConstraints {
    const now = Date.now();
    const elapsed = now - this.startTime;
    const remaining = this.config.effectiveTimeoutMs - elapsed;
    const shouldContinue = remaining > this.config.safetyBuffer;
    const shouldSkipBacklog = remaining < (this.config.minFilingProcessingTime * 2); // Need 3+ minutes for backlog

    // Calculate how many more filings we can process
    const remainingFilingsCapacity = shouldContinue 
      ? Math.floor((remaining - this.config.safetyBuffer) / this.config.minFilingProcessingTime)
      : 0;

    return {
      startTime: this.startTime,
      elapsed,
      remaining,
      shouldContinue,
      shouldSkipBacklog,
      remainingFilingsCapacity
    };
  }

  /**
   * Determine if we should process a filing based on priority and time constraints
   */
  shouldProcessFiling(
    priority: keyof ProcessingPriority, 
    estimatedProcessingTime?: number
  ): { shouldProcess: boolean; reason: string; timeConstraints: TimeConstraints } {
    const constraints = this.calculateTimeConstraints();
    const processingTime = estimatedProcessingTime || this.config.minFilingProcessingTime;

    // Check if we have enough time for this filing
    if (!constraints.shouldContinue) {
      this.activations++;
      return {
        shouldProcess: false,
        reason: `Circuit breaker active - insufficient time remaining (${constraints.remaining}ms < ${this.config.safetyBuffer}ms safety buffer)`,
        timeConstraints: constraints
      };
    }

    // Check if we have enough time for this specific filing
    if (constraints.remaining < (processingTime + this.config.safetyBuffer)) {
      this.activations++;
      return {
        shouldProcess: false,
        reason: `Circuit breaker active - insufficient time for filing (${constraints.remaining}ms < ${processingTime + this.config.safetyBuffer}ms required)`,
        timeConstraints: constraints
      };
    }

    // Special handling for backlog filings
    if (priority === 'BACKLOG' && constraints.shouldSkipBacklog) {
      this.activations++;
      this.skippedFilings++;
      return {
        shouldProcess: false,
        reason: `Circuit breaker active - skipping backlog processing to prioritize new filings (${constraints.remaining}ms remaining)`,
        timeConstraints: constraints
      };
    }

    // Check processing capacity
    if (constraints.remainingFilingsCapacity <= 0) {
      this.activations++;
      return {
        shouldProcess: false,
        reason: `Circuit breaker active - processing capacity exhausted (${constraints.remainingFilingsCapacity} filings remaining)`,
        timeConstraints: constraints
      };
    }

    return {
      shouldProcess: true,
      reason: `Proceeding with ${priority} priority filing - ${constraints.remainingFilingsCapacity} capacity remaining`,
      timeConstraints: constraints
    };
  }

  /**
   * Prioritize filings based on type and importance
   */
  prioritizeFiling(formType: string): keyof ProcessingPriority {
    const normalizedFormType = formType?.toUpperCase() || '';

    // Critical filings - always process first
    if (normalizedFormType.includes('10-K') || normalizedFormType.includes('10-Q')) {
      return 'CRITICAL';
    }

    // High priority filings
    if (normalizedFormType.includes('8-K') || normalizedFormType.includes('FORM 4')) {
      return 'HIGH';
    }

    // Normal priority for other filings
    return 'NORMAL';
  }

  /**
   * Optimize batch size based on remaining time and processing capacity
   */
  calculateOptimalBatchSize(totalFilings: number, priority: keyof ProcessingPriority): number {
    const constraints = this.calculateTimeConstraints();
    
    // Base batch sizes by priority
    const baseBatchSizes = {
      CRITICAL: 5,  // Process more critical filings in parallel
      HIGH: 3,      // Medium batch size for high priority
      NORMAL: 3,    // Standard batch size
      BACKLOG: 2    // Conservative batch size for backlog
    };

    const baseBatchSize = baseBatchSizes[priority];
    
    // Limit by remaining capacity
    const capacityLimitedBatch = Math.min(baseBatchSize, constraints.remainingFilingsCapacity);
    
    // Limit by concurrent processing constraint
    const concurrencyLimitedBatch = Math.min(capacityLimitedBatch, this.config.maxConcurrentProcessing);
    
    // Ensure we don't exceed total filings
    const finalBatchSize = Math.min(concurrencyLimitedBatch, totalFilings);

    logger.debug('Circuit breaker calculated optimal batch size', {
      priority,
      totalFilings,
      baseBatchSize,
      capacityLimitedBatch,
      concurrencyLimitedBatch,
      finalBatchSize,
      remainingCapacity: constraints.remainingFilingsCapacity,
      timeRemaining: constraints.remaining
    });

    return Math.max(1, finalBatchSize); // Ensure at least 1 if we should process anything
  }

  /**
   * Monitor processing progress and adjust timeouts dynamically
   */
  recordProcessingComplete(
    priority: keyof ProcessingPriority, 
    actualProcessingTime: number, 
    success: boolean
  ): void {
    const constraints = this.calculateTimeConstraints();
    
    logger.info('Circuit breaker recorded processing completion', {
      priority,
      actualProcessingTime,
      estimatedTime: this.config.minFilingProcessingTime,
      success,
      timeRemaining: constraints.remaining,
      processingEfficiency: (this.config.minFilingProcessingTime / actualProcessingTime * 100).toFixed(1) + '%'
    });

    // Update processing time estimates based on actual performance
    if (success && actualProcessingTime > 0) {
      // Use exponential moving average to update estimates
      const alpha = 0.3; // Smoothing factor
      this.config.minFilingProcessingTime = Math.round(
        alpha * actualProcessingTime + (1 - alpha) * this.config.minFilingProcessingTime
      );
    }
  }

  /**
   * Get circuit breaker status and metrics
   */
  getStatus(): {
    isActive: boolean;
    activations: number;
    skippedFilings: number;
    timeConstraints: TimeConstraints;
    config: CircuitBreakerConfig;
  } {
    const constraints = this.calculateTimeConstraints();
    
    return {
      isActive: !constraints.shouldContinue,
      activations: this.activations,
      skippedFilings: this.skippedFilings,
      timeConstraints: constraints,
      config: this.config
    };
  }

  /**
   * Force circuit breaker activation (emergency timeout prevention)
   */
  forceActivation(reason: string): void {
    this.activations++;
    this.config.effectiveTimeoutMs = Date.now() - this.startTime + this.config.safetyBuffer;
    
    logger.warn('Circuit breaker force activated', {
      reason,
      activations: this.activations,
      timeElapsed: Date.now() - this.startTime
    });
  }

  /**
   * Reset circuit breaker for new processing cycle
   */
  reset(): void {
    this.startTime = Date.now();
    this.activations = 0;
    this.skippedFilings = 0;
    
    logger.info('Circuit breaker reset for new processing cycle');
  }

  /**
   * Create a timeout-aware processing wrapper
   */
  async wrapProcessing<T>(
    processingFunction: () => Promise<T>,
    priority: keyof ProcessingPriority,
    estimatedTime?: number
  ): Promise<{ result: T | null; skipped: boolean; reason: string }> {
    const decision = this.shouldProcessFiling(priority, estimatedTime);
    
    if (!decision.shouldProcess) {
      return {
        result: null,
        skipped: true,
        reason: decision.reason
      };
    }

    const processingStart = Date.now();
    
    try {
      const result = await processingFunction();
      const actualTime = Date.now() - processingStart;
      this.recordProcessingComplete(priority, actualTime, true);
      
      return {
        result,
        skipped: false,
        reason: `Processing completed successfully in ${actualTime}ms`
      };
    } catch (error) {
      const actualTime = Date.now() - processingStart;
      this.recordProcessingComplete(priority, actualTime, false);
      
      throw error;
    }
  }
}

/**
 * Create circuit breaker instance with smart defaults
 */
export function createCircuitBreaker(
  workerTimeoutMs: number = 600000,
  config?: Partial<CircuitBreakerConfig>
): IntelligentCircuitBreaker {
  const effectiveTimeoutMs = Math.min(workerTimeoutMs - 60000, 540000); // 1 minute buffer, max 9 minutes
  
  return new IntelligentCircuitBreaker({
    effectiveTimeoutMs,
    ...config
  });
}

/**
 * Export default instance for common usage
 */
export const defaultCircuitBreaker = createCircuitBreaker();