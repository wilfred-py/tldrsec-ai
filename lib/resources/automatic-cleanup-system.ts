/**
 * Automatic Resource Cleanup System
 * 
 * Provides centralized resource lifecycle management to prevent memory leaks
 * by tracking and automatically cleaning up intervals, timeouts, and processing contexts.
 */

import { logger } from '../logging';

const cleanupLogger = logger.child('resource-cleanup');

/**
 * Processing context interface
 */
export interface ProcessingContext {
  id: string;
  type: 'filing' | 'batch' | 'stream' | 'generic';
  startTime: Date;
  metadata?: Record<string, unknown>;
  resources: Set<string>;
}

/**
 * Resource cleanup system for managing intervals, timeouts, and processing contexts
 */
export class ResourceCleanupSystem {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private contexts: Map<string, ProcessingContext> = new Map();
  private cleanupHandlers: Map<string, () => Promise<void> | void> = new Map();
  
  /**
   * Create a managed interval that will be automatically cleaned up
   */
  createInterval(callback: () => void, ms: number, contextId?: string): { id: string; interval: NodeJS.Timeout } {
    const id = `interval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const interval = setInterval(() => {
      try {
        callback();
      } catch (error) {
        cleanupLogger.error(`Interval callback error for ${id}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue interval execution despite callback errors
      }
    }, ms);
    
    this.intervals.set(id, interval);
    
    // Associate with context if provided
    if (contextId && this.contexts.has(contextId)) {
      this.contexts.get(contextId)!.resources.add(`interval:${id}`);
    }
    
    cleanupLogger.debug(`Created interval ${id}`, {
      intervalMs: ms,
      contextId,
      totalIntervals: this.intervals.size
    });
    
    return { id, interval };
  }
  
  /**
   * Create a managed timeout that will be automatically cleaned up
   */
  createTimeout(callback: () => void, ms: number, contextId?: string): { id: string; timeout: NodeJS.Timeout } {
    const id = `timeout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timeout = setTimeout(() => {
      try {
        callback();
      } catch (error) {
        cleanupLogger.error(`Timeout callback error for ${id}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        // Auto-remove completed timeout
        this.timeouts.delete(id);
        
        if (contextId && this.contexts.has(contextId)) {
          this.contexts.get(contextId)!.resources.delete(`timeout:${id}`);
        }
      }
    }, ms);
    
    this.timeouts.set(id, timeout);
    
    // Associate with context if provided
    if (contextId && this.contexts.has(contextId)) {
      this.contexts.get(contextId)!.resources.add(`timeout:${id}`);
    }
    
    cleanupLogger.debug(`Created timeout ${id}`, {
      timeoutMs: ms,
      contextId,
      totalTimeouts: this.timeouts.size
    });
    
    return { id, timeout };
  }
  
  /**
   * Create a processing context for grouping related resources
   */
  createContext(type: ProcessingContext['type'], metadata?: Record<string, unknown>): string {
    const id = `ctx_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const context: ProcessingContext = {
      id,
      type,
      startTime: new Date(),
      metadata,
      resources: new Set()
    };
    
    this.contexts.set(id, context);
    
    cleanupLogger.debug(`Created processing context ${id}`, {
      type,
      metadata,
      totalContexts: this.contexts.size
    });
    
    return id;
  }
  
  /**
   * Register a custom cleanup handler for a context
   */
  registerCleanupHandler(contextId: string, handler: () => Promise<void> | void): void {
    this.cleanupHandlers.set(contextId, handler);
  }
  
  /**
   * Clear a specific interval
   */
  clearInterval(intervalId: string): boolean {
    const interval = this.intervals.get(intervalId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(intervalId);
      
      cleanupLogger.debug(`Cleared interval ${intervalId}`, {
        remainingIntervals: this.intervals.size
      });
      
      return true;
    }
    return false;
  }
  
  /**
   * Clear a specific timeout
   */
  clearTimeout(timeoutId: string): boolean {
    const timeout = this.timeouts.get(timeoutId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(timeoutId);
      
      cleanupLogger.debug(`Cleared timeout ${timeoutId}`, {
        remainingTimeouts: this.timeouts.size
      });
      
      return true;
    }
    return false;
  }
  
  /**
   * Clean up a specific context and all its associated resources
   */
  async cleanupContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (!context) {
      cleanupLogger.warn(`Context ${contextId} not found for cleanup`);
      return;
    }
    
    try {
      // Execute custom cleanup handler if registered
      const handler = this.cleanupHandlers.get(contextId);
      if (handler) {
        await handler();
        this.cleanupHandlers.delete(contextId);
      }
      
      // Clean up associated resources
      const resourcesCleared = [];
      for (const resourceRef of context.resources) {
        const [type, resourceId] = resourceRef.split(':');
        if (type === 'interval' && this.clearInterval(resourceId)) {
          resourcesCleared.push(resourceRef);
        } else if (type === 'timeout' && this.clearTimeout(resourceId)) {
          resourcesCleared.push(resourceRef);
        }
      }
      
      // Remove the context
      this.contexts.delete(contextId);
      
      const duration = Date.now() - context.startTime.getTime();
      cleanupLogger.info(`Cleaned up context ${contextId}`, {
        type: context.type,
        duration,
        resourcesCleared: resourcesCleared.length,
        totalResourcesTracked: context.resources.size
      });
      
    } catch (error) {
      cleanupLogger.error(`Error cleaning up context ${contextId}`, {
        error: error instanceof Error ? error.message : String(error),
        contextType: context.type
      });
    }
  }
  
  /**
   * Clean up all resources (intervals, timeouts, and contexts)
   */
  async cleanup(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Clear all intervals
      const intervalCount = this.intervals.size;
      for (const [_id, interval] of this.intervals.entries()) {
        clearInterval(interval);
      }
      this.intervals.clear();
      
      // Clear all timeouts
      const timeoutCount = this.timeouts.size;
      for (const [_id, timeout] of this.timeouts.entries()) {
        clearTimeout(timeout);
      }
      this.timeouts.clear();
      
      // Clean up all contexts with their custom handlers
      const contextCount = this.contexts.size;
      const contextIds = Array.from(this.contexts.keys());
      
      for (const contextId of contextIds) {
        await this.cleanupContext(contextId);
      }
      
      // Clear cleanup handlers
      this.cleanupHandlers.clear();
      
      const duration = Date.now() - startTime;
      cleanupLogger.info(`Complete resource cleanup completed`, {
        intervalsCleared: intervalCount,
        timeoutsCleared: timeoutCount,
        contextsCleared: contextCount,
        cleanupDuration: duration
      });
      
    } catch (error) {
      cleanupLogger.error(`Error during complete cleanup`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get current resource usage statistics
   */
  getResourceStats(): {
    intervals: number;
    timeouts: number;
    contexts: number;
    cleanupHandlers: number;
  } {
    return {
      intervals: this.intervals.size,
      timeouts: this.timeouts.size,
      contexts: this.contexts.size,
      cleanupHandlers: this.cleanupHandlers.size
    };
  }
  
  /**
   * Clean up resources older than the specified age (in milliseconds)
   */
  async cleanupOldResources(maxAge: number = 3600000): Promise<void> { // Default 1 hour
    const cutoffTime = new Date(Date.now() - maxAge);
    const oldContexts = Array.from(this.contexts.entries())
      .filter(([_, context]) => context.startTime < cutoffTime)
      .map(([id, _]) => id);
    
    if (oldContexts.length > 0) {
      cleanupLogger.info(`Cleaning up ${oldContexts.length} old contexts`, {
        maxAge,
        cutoffTime: cutoffTime.toISOString()
      });
      
      for (const contextId of oldContexts) {
        await this.cleanupContext(contextId);
      }
    }
  }
  
  /**
   * Register process exit handlers for automatic cleanup
   */
  registerProcessExitCleanup(): void {
    const exitHandler = async () => {
      cleanupLogger.info('Process exit detected, performing cleanup...');
      await this.cleanup();
      process.exit(0);
    };
    
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);
    process.on('exit', () => {
      // Synchronous cleanup only for exit event
      const intervalCount = this.intervals.size;
      const timeoutCount = this.timeouts.size;
      
      for (const interval of this.intervals.values()) {
        clearInterval(interval);
      }
      for (const timeout of this.timeouts.values()) {
        clearTimeout(timeout);
      }
      
      if (intervalCount > 0 || timeoutCount > 0) {
        console.log(`Cleaned up ${intervalCount} intervals and ${timeoutCount} timeouts on exit`);
      }
    });
    
    cleanupLogger.info('Process exit cleanup handlers registered');
  }
}

// Export singleton instance
export const resourceCleanupSystem = new ResourceCleanupSystem();

// Auto-register process exit cleanup
resourceCleanupSystem.registerProcessExitCleanup();

// Auto-cleanup old resources every 30 minutes
setInterval(() => {
  resourceCleanupSystem.cleanupOldResources().catch(error => {
    cleanupLogger.error('Failed to cleanup old resources', {
      error: error instanceof Error ? error.message : String(error)
    });
  });
}, 30 * 60 * 1000); // 30 minutes