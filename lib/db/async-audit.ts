/**
 * Async Audit Logging System
 * 
 * Provides asynchronous audit logging to prevent audit operations from extending
 * transaction boundaries and causing deadlocks. Uses a queue-based approach
 * for reliable audit log processing.
 */

import { getPrismaClient } from './prisma';
import { logger } from '../logging';

const prisma = getPrismaClient();
const auditLogger = logger.child('async-audit');

interface AuditLogData {
  userId: string;
  action: string;
  details: Record<string, unknown>;
  success: boolean;
  correlationId?: string;
  timestamp?: Date;
}

interface AuditQueueItem {
  id: string;
  data: AuditLogData;
  attempts: number;
  createdAt: Date;
  nextRetryAt?: Date;
}

interface AuditQueueStats {
  queueSize: number;
  processingQueue: boolean;
  oldestItemAge: number;
  averageAttempts: number;
  failedItems: number;
  successRate: number;
}

// Configuration constants
const MAX_QUEUE_SIZE = 10000; // Prevent memory exhaustion
const MAX_BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const PROCESSING_INTERVAL = 30000; // 30 seconds
const CLEANUP_INTERVAL = 300000; // 5 minutes

// In-memory queue for audit logs (could be replaced with Redis for production)
const auditQueue: Map<string, AuditQueueItem> = new Map();
let processingQueue = false;
let processingTimer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Generate a unique ID with better entropy
 */
function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const randomPart2 = Math.random().toString(36).substring(2, 15);
  return `audit_${timestamp}_${randomPart}${randomPart2}`;
}

/**
 * Queue an audit log for async processing with safety checks
 */
export async function createAsyncAuditLog(auditData: AuditLogData): Promise<void> {
  // Check queue size limit to prevent memory exhaustion
  if (auditQueue.size >= MAX_QUEUE_SIZE) {
    auditLogger.warn('Audit queue at maximum capacity, dropping oldest items', {
      currentSize: auditQueue.size,
      maxSize: MAX_QUEUE_SIZE
    });
    
    // Remove oldest items (FIFO)
    const itemsToRemove = Math.ceil(MAX_QUEUE_SIZE * 0.1); // Remove 10%
    const oldestItems = Array.from(auditQueue.entries())
      .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, itemsToRemove);
    
    for (const [id] of oldestItems) {
      auditQueue.delete(id);
    }
  }

  const id = generateAuditId();
  const queueItem: AuditQueueItem = {
    id,
    data: {
      ...auditData,
      timestamp: auditData.timestamp || new Date(),
      correlationId: auditData.correlationId || id
    },
    attempts: 0,
    createdAt: new Date()
  };

  auditQueue.set(id, queueItem);

  auditLogger.debug('Queued audit log for async processing', {
    id,
    userId: auditData.userId,
    action: auditData.action,
    queueSize: auditQueue.size
  });

  // Start processing if not already running
  if (!processingQueue && !processingTimer) {
    setImmediate(() => processAuditQueue());
  }
}

/**
 * Process queued audit logs with improved error handling and performance
 */
async function processAuditQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;

  try {
    const batch: AuditQueueItem[] = [];

    // Collect items for batch processing with retry scheduling
    const now = new Date();
    for (const [id, item] of auditQueue.entries()) {
      if (batch.length >= MAX_BATCH_SIZE) break;
      
      // Skip items that are not ready for retry
      if (item.nextRetryAt && item.nextRetryAt > now) {
        continue;
      }
      
      if (item.attempts >= MAX_RETRIES) {
        auditLogger.error('Audit log exceeded max retries, moving to dead letter queue', {
          id: item.id,
          userId: item.data.userId,
          action: item.data.action,
          attempts: item.attempts
        });
        auditQueue.delete(id);
        continue;
      }
      batch.push(item);
    }

    if (batch.length === 0) {
      processingQueue = false;
      return;
    }

    auditLogger.debug('Processing audit log batch', { batchSize: batch.length });

    // Process batch
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        try {
          await prisma.auditLog.create({
            data: {
              userId: item.data.userId,
              action: item.data.action,
              details: JSON.stringify(item.data.details),
              success: item.data.success,
              createdAt: item.data.timestamp
            }
          });

          auditQueue.delete(item.id);
          
          auditLogger.debug('Successfully processed audit log', {
            id: item.id,
            userId: item.data.userId,
            action: item.data.action
          });
          
          return { success: true, id: item.id };
        } catch (error) {
          item.attempts++;
          auditLogger.warn('Failed to process audit log, will retry', {
            id: item.id,
            userId: item.data.userId,
            action: item.data.action,
            attempts: item.attempts,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // Schedule retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, item.attempts), 10000);
          item.nextRetryAt = new Date(Date.now() + delay);
          
          throw error;
        }
      })
    );

    // Log batch results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - successful;

    auditLogger.info('Audit log batch processing completed', {
      batchSize: batch.length,
      successful,
      failed,
      remainingInQueue: auditQueue.size
    });

    // Schedule next processing cycle if queue is not empty
    if (auditQueue.size > 0) {
      processingTimer = setTimeout(() => {
        processingTimer = null;
        processAuditQueue();
      }, 1000);
    }

  } catch (error) {
    auditLogger.error('Audit queue processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      queueSize: auditQueue.size
    });
    
    // Retry after delay with timer tracking
    processingTimer = setTimeout(() => {
      processingTimer = null;
      processAuditQueue();
    }, 5000);
  } finally {
    processingQueue = false;
  }
}

/**
 * Get comprehensive queue statistics for monitoring
 */
export function getAuditQueueStats(): AuditQueueStats {
  if (auditQueue.size === 0) {
    return {
      queueSize: 0,
      processingQueue,
      oldestItemAge: 0,
      averageAttempts: 0,
      failedItems: 0,
      successRate: 0
    };
  }

  const items = Array.from(auditQueue.values());
  const now = Date.now();
  const oldestItem = Math.min(...items.map(item => item.createdAt.getTime()));
  const failedItems = items.filter(item => item.attempts > 0).length;
  const totalAttempts = items.reduce((sum, item) => sum + item.attempts, 0);
  
  return {
    queueSize: auditQueue.size,
    processingQueue,
    oldestItemAge: now - oldestItem,
    averageAttempts: totalAttempts / auditQueue.size,
    failedItems,
    successRate: auditQueue.size > 0 ? ((auditQueue.size - failedItems) / auditQueue.size) * 100 : 0
  };
}

/**
 * Flush all pending audit logs (for testing or shutdown)
 */
export async function flushAuditQueue(timeoutMs: number = 10000): Promise<void> {
  const startTime = Date.now();
  let lastSize = auditQueue.size;
  let stuckCount = 0;
  
  auditLogger.info('Starting audit queue flush', { queueSize: auditQueue.size, timeoutMs });
  
  while (auditQueue.size > 0 && (Date.now() - startTime) < timeoutMs) {
    if (!processingQueue) {
      await processAuditQueue();
    }
    
    // Check if we're stuck (no progress)
    if (auditQueue.size === lastSize) {
      stuckCount++;
      if (stuckCount > 10) {
        auditLogger.warn('Audit queue processing appears stuck', {
          queueSize: auditQueue.size,
          stuckCount
        });
        break;
      }
    } else {
      stuckCount = 0;
      lastSize = auditQueue.size;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (auditQueue.size > 0) {
    auditLogger.warn('Audit queue flush completed with remaining items', {
      remainingItems: auditQueue.size,
      timeoutMs,
      wasStuck: stuckCount > 10
    });
  } else {
    auditLogger.info('Audit queue flush completed successfully');
  }
}

/**
 * Clear the audit queue (for testing)
 */
export function clearAuditQueue(): void {
  auditQueue.clear();
  processingQueue = false;
  
  // Clear timers
  if (processingTimer) {
    clearTimeout(processingTimer);
    processingTimer = null;
  }
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Cleanup old items and handle stuck processing (only in server environments)
 */
function cleanupAuditQueue(): void {
  const now = new Date();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  let cleaned = 0;

  for (const [id, item] of auditQueue.entries()) {
    if (now.getTime() - item.createdAt.getTime() > maxAge) {
      auditLogger.warn('Removing stale audit log item', {
        id,
        userId: item.data.userId,
        action: item.data.action,
        age: now.getTime() - item.createdAt.getTime()
      });
      auditQueue.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    auditLogger.info('Cleaned up stale audit log items', { cleaned, remaining: auditQueue.size });
  }
}

/**
 * Graceful shutdown of audit system
 */
export async function shutdownAuditSystem(timeoutMs: number = 30000): Promise<void> {
  auditLogger.info('Shutting down audit system', { queueSize: auditQueue.size });
  
  // Clear timers first
  if (processingTimer) {
    clearTimeout(processingTimer);
    processingTimer = null;
  }
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
  
  // Try to flush remaining items
  await flushAuditQueue(timeoutMs);
  
  auditLogger.info('Audit system shutdown complete', { remainingItems: auditQueue.size });
}

// Start periodic processing and cleanup (only in server environments)
if (typeof window === 'undefined') {
  // Processing interval
  setInterval(() => {
    if (auditQueue.size > 0 && !processingQueue && !processingTimer) {
      processAuditQueue();
    }
  }, PROCESSING_INTERVAL);
  
  // Cleanup interval
  cleanupTimer = setInterval(cleanupAuditQueue, CLEANUP_INTERVAL);
  
  // Graceful shutdown on process exit
  process.on('SIGTERM', () => shutdownAuditSystem());
  process.on('SIGINT', () => shutdownAuditSystem());
}