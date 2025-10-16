/**
 * Request Queue Manager for Infrastructure Optimization
 * 
 * Provides intelligent queuing, batching, and parallel processing
 * to prevent 524 timeout errors and optimize resource utilization
 */

import { logger } from '../logging';
import Bottleneck from 'bottleneck';
import { generateSecureRequestId } from '../security/secure-random';

export interface QueuedRequest {
  id: string;
  type: 'filing_processing' | 'ai_summarization' | 'email_delivery';
  priority: number; // 1 (highest) to 10 (lowest)
  payload: unknown;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  timeout: number;
}

export interface ProcessingResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
  retryCount: number;
}

/**
 * High-performance request queue with timeout protection
 */
export class InfrastructureRequestQueue {
  private bottleneck: Bottleneck;
  private processingTimeouts: Map<string, NodeJS.Timeout>;
  private activeRequests: Map<string, QueuedRequest>;
  
  constructor() {
    // Configure bottleneck for optimal performance
    this.bottleneck = new Bottleneck({
      maxConcurrent: 10,          // Process up to 10 requests simultaneously
      minTime: 100,               // Minimum 100ms between requests
      reservoir: 50,              // Process 50 requests per minute
      reservoirRefreshAmount: 50,
      reservoirRefreshInterval: 60 * 1000, // Refresh every minute
      
      // Retry configuration
      retryCount: 3,
      retry: (error: Error, jobInfo: { retryCount: number; options: { id: string } }) => {
        logger.warn(`Request queue retry attempt ${jobInfo.retryCount}`, {
          error: error.message,
          jobId: jobInfo.options.id
        });
        return 5000; // 5 second delay between retries
      }
    });
    
    this.processingTimeouts = new Map();
    this.activeRequests = new Map();
    
    // Monitor queue health
    this.setupMonitoring();
  }

  /**
   * Add request to queue with priority and timeout protection
   */
  async enqueueRequest(request: Omit<QueuedRequest, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
    const queuedRequest: QueuedRequest = {
      ...request,
      id: this.generateRequestId(),
      createdAt: new Date(),
      retryCount: 0
    };

    this.activeRequests.set(queuedRequest.id, queuedRequest);
    
    logger.info(`Request queued`, {
      requestId: queuedRequest.id,
      type: queuedRequest.type,
      priority: queuedRequest.priority,
      timeout: queuedRequest.timeout
    });

    return queuedRequest.id;
  }

  /**
   * Process request with timeout protection and monitoring
   */
  async processRequest<T>(
    requestId: string,
    processor: (payload: unknown) => Promise<T>
  ): Promise<ProcessingResult> {
    const request = this.activeRequests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found in queue`);
    }

    const startTime = Date.now();
    
    try {
      // Set up timeout protection
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Request timeout after ${request.timeout}ms`));
        }, request.timeout);
        
        this.processingTimeouts.set(requestId, timeoutId);
      });

      // Execute with bottleneck and timeout protection
      const result = await this.bottleneck.schedule(
        { priority: request.priority, id: requestId },
        async () => {
          return Promise.race([
            processor(request.payload),
            timeoutPromise
          ]);
        }
      );

      const executionTime = Date.now() - startTime;
      
      // Clean up
      this.clearTimeout(requestId);
      this.activeRequests.delete(requestId);

      logger.info(`Request processed successfully`, {
        requestId,
        type: request.type,
        executionTime,
        retryCount: request.retryCount
      });

      return {
        success: true,
        data: result,
        executionTime,
        retryCount: request.retryCount
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Clean up timeout
      this.clearTimeout(requestId);
      
      // Increment retry count
      request.retryCount++;
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`Request processing failed`, {
        requestId,
        type: request.type,
        error: errorMessage,
        executionTime,
        retryCount: request.retryCount,
        maxRetries: request.maxRetries
      });

      // Check if we should retry
      if (request.retryCount < request.maxRetries && !errorMessage.includes('timeout')) {
        logger.info(`Retrying request`, {
          requestId,
          retryCount: request.retryCount,
          maxRetries: request.maxRetries
        });
        
        // Retry with exponential backoff
        await this.delay(Math.pow(2, request.retryCount) * 1000);
        return this.processRequest(requestId, processor);
      }

      // Max retries exceeded or non-retryable error
      this.activeRequests.delete(requestId);
      
      return {
        success: false,
        error: errorMessage,
        executionTime,
        retryCount: request.retryCount
      };
    }
  }

  /**
   * Process multiple requests in parallel batches
   */
  async processBatch<T>(
    requests: Array<{ id: string; processor: (payload: unknown) => Promise<T> }>,
    batchSize: number = 5
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    // Process in batches to prevent overwhelming the system
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}`, {
        batchSize: batch.length,
        totalRequests: requests.length,
        progress: `${i + batch.length}/${requests.length}`
      });

      // Process batch in parallel
      const batchPromises = batch.map(({ id, processor }) => 
        this.processRequest(id, processor)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Extract results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: result.reason?.message || 'Batch processing failed',
            executionTime: 0,
            retryCount: 0
          });
        }
      }

      // Small delay between batches to prevent overwhelming
      if (i + batchSize < requests.length) {
        await this.delay(500);
      }
    }

    return results;
  }

  /**
   * Get queue statistics for monitoring
   */
  getQueueStats() {
    return {
      activeRequests: this.activeRequests.size,
      queuedJobs: this.bottleneck.queued(),
      runningJobs: this.bottleneck.running(),
      pendingJobs: this.bottleneck.pending(),
      done: this.bottleneck.done,
      failed: this.bottleneck.failed
    };
  }

  /**
   * Clean up resources
   */
  async shutdown() {
    logger.info('Shutting down request queue');
    
    // Clear all timeouts
    for (const [_requestId, timeoutId] of this.processingTimeouts) {
      clearTimeout(timeoutId);
    }
    this.processingTimeouts.clear();
    
    // Clear active requests
    this.activeRequests.clear();
    
    // Stop bottleneck
    await this.bottleneck.stop();
  }

  // Private methods
  private generateRequestId(): string {
    return generateSecureRequestId('req');
  }

  private clearTimeout(requestId: string): void {
    const timeoutId = this.processingTimeouts.get(requestId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.processingTimeouts.delete(requestId);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private setupMonitoring(): void {
    // Log queue stats every 30 seconds
    setInterval(() => {
      const stats = this.getQueueStats();
      if (stats.activeRequests > 0 || stats.queuedJobs > 0) {
        logger.info('Request queue stats', stats);
      }
    }, 30000);

    // Monitor for stuck requests
    setInterval(() => {
      const now = Date.now();
      const stuckThreshold = 10 * 60 * 1000; // 10 minutes
      
      for (const [requestId, request] of this.activeRequests) {
        const age = now - request.createdAt.getTime();
        if (age > stuckThreshold) {
          logger.warn('Potentially stuck request detected', {
            requestId,
            type: request.type,
            age: Math.round(age / 1000),
            retryCount: request.retryCount
          });
        }
      }
    }, 60000); // Check every minute
  }
}

// Export singleton instance
export const infrastructureQueue = new InfrastructureRequestQueue();

// Graceful shutdown handler
if (typeof process !== 'undefined') {
  const gracefulShutdown = async () => {
    logger.info('Graceful shutdown initiated');
    await infrastructureQueue.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}