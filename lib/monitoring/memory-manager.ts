/**
 * Memory Management and Circuit Breaker System
 * 
 * Provides automatic memory cleanup, monitoring, and circuit breaker protection
 * to prevent out-of-memory errors and ensure stable operation.
 */

import { logger } from '../logging';
import { EventEmitter } from 'events';

interface MemoryMetrics {
  timestamp: Date;
  heapUsed: number; // MB
  heapTotal: number; // MB
  external: number; // MB
  arrayBuffers: number; // MB
  rss: number; // MB
  usage: number; // percentage
  available: number; // MB
}

interface MemoryThresholds {
  warning: number; // percentage
  critical: number; // percentage
  emergency: number; // percentage
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // milliseconds
  monitorWindow: number; // milliseconds
}

enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN'
}

interface CleanupTask {
  id: string;
  name: string;
  priority: number;
  cleanup: () => Promise<number>; // Returns bytes freed
  interval: number; // milliseconds
  lastRun?: Date;
  enabled: boolean;
}

export class MemoryManager extends EventEmitter {
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private metrics: MemoryMetrics[] = [];
  private cleanupTasks: Map<string, CleanupTask> = new Map();
  private circuitBreakerState = CircuitBreakerState.CLOSED;
  private circuitBreakerFailures = 0;
  private circuitBreakerLastFailure?: Date;
  private memoryCache = new Map<string, any>();
  
  // Configuration
  private readonly thresholds: MemoryThresholds = {
    warning: 70,   // 70% memory usage
    critical: 85,  // 85% memory usage  
    emergency: 95  // 95% memory usage
  };
  
  private readonly circuitBreaker: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000, // 1 minute
    monitorWindow: 300000 // 5 minutes
  };
  
  private readonly maxMetricsHistory = 1440; // 24 hours at 1-minute intervals
  private readonly maxCacheSize = 1000;
  private readonly maxCacheAge = 3600000; // 1 hour
  
  constructor() {
    super();
    this.setupDefaultCleanupTasks();
    this.setupProcessMemoryWarnings();
  }
  
  /**
   * Start memory monitoring and cleanup
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) {
      logger.warn('Memory monitoring already started');
      return;
    }
    
    this.isMonitoring = true;
    
    logger.info('Starting memory management', {
      interval: intervalMs,
      thresholds: this.thresholds,
      cleanupTasks: this.cleanupTasks.size
    });
    
    // Start memory monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMemoryMetrics();
      this.checkMemoryThresholds();
    }, intervalMs);
    
    // Start cleanup tasks
    this.cleanupInterval = setInterval(() => {
      this.runCleanupTasks().catch(error => {
        logger.error('Error in cleanup tasks', { error });
      });
    }, 30000); // Run cleanup every 30 seconds
    
    // Collect initial metrics
    this.collectMemoryMetrics();
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    logger.info('Memory monitoring stopped');
  }
  
  /**
   * Get current memory metrics
   */
  getCurrentMemoryMetrics(): MemoryMetrics | null {
    return this.metrics[this.metrics.length - 1] || null;
  }
  
  /**
   * Get memory usage trend
   */
  getMemoryTrend(minutes: number = 60): {
    average: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    peak: number;
    current: number;
  } {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);
    
    if (recentMetrics.length === 0) {
      return { average: 0, trend: 'stable', peak: 0, current: 0 };
    }
    
    const usages = recentMetrics.map(m => m.usage);
    const average = usages.reduce((sum, usage) => sum + usage, 0) / usages.length;
    const peak = Math.max(...usages);
    const current = usages[usages.length - 1];
    
    // Determine trend based on first and last quarter averages
    const quarterSize = Math.floor(recentMetrics.length / 4);
    if (quarterSize > 0) {
      const firstQuarterAvg = usages.slice(0, quarterSize).reduce((sum, u) => sum + u, 0) / quarterSize;
      const lastQuarterAvg = usages.slice(-quarterSize).reduce((sum, u) => sum + u, 0) / quarterSize;
      
      const difference = lastQuarterAvg - firstQuarterAvg;
      const trend = difference > 5 ? 'increasing' : difference < -5 ? 'decreasing' : 'stable';
      
      return { average, trend, peak, current };
    }
    
    return { average, trend: 'stable', peak, current };
  }
  
  /**
   * Register a cleanup task
   */
  registerCleanupTask(task: Omit<CleanupTask, 'lastRun'>): void {
    this.cleanupTasks.set(task.id, { ...task, lastRun: undefined });
    logger.info('Registered cleanup task', { id: task.id, name: task.name });
  }
  
  /**
   * Force immediate cleanup
   */
  async forceCleanup(): Promise<number> {
    logger.warn('Forcing immediate memory cleanup');
    
    let totalFreed = 0;
    const tasks = Array.from(this.cleanupTasks.values())
      .filter(task => task.enabled)
      .sort((a, b) => b.priority - a.priority); // High priority first
    
    for (const task of tasks) {
      try {
        const freed = await task.cleanup();
        totalFreed += freed;
        task.lastRun = new Date();
        
        logger.info('Cleanup task completed', {
          id: task.id,
          name: task.name,
          freedMB: Math.round(freed / 1024 / 1024)
        });
      } catch (error) {
        logger.error('Cleanup task failed', {
          id: task.id,
          name: task.name,
          error
        });
      }
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logger.info('Forced garbage collection');
    }
    
    this.emit('cleanup-completed', { totalFreed });
    return totalFreed;
  }
  
  /**
   * Check if circuit breaker allows operation
   */
  isCircuitBreakerOpen(): boolean {
    return this.circuitBreakerState === CircuitBreakerState.OPEN;
  }
  
  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      const now = Date.now();
      const lastFailureTime = this.circuitBreakerLastFailure?.getTime() || 0;
      
      if (now - lastFailureTime > this.circuitBreaker.timeout) {
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        logger.info('Circuit breaker moved to HALF_OPEN state');
      } else {
        throw new Error(`Circuit breaker is OPEN for ${operationName}`);
      }
    }
    
    try {
      const result = await operation();
      
      if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
        this.circuitBreakerFailures = 0;
        this.circuitBreakerState = CircuitBreakerState.CLOSED;
        logger.info('Circuit breaker moved to CLOSED state');
      }
      
      return result;
    } catch (error) {
      this.recordCircuitBreakerFailure();
      throw error;
    }
  }
  
  /**
   * Add item to managed cache
   */
  setCacheItem(key: string, value: any, ttl?: number): void {
    const expiresAt = ttl ? Date.now() + ttl : Date.now() + this.maxCacheAge;
    
    this.memoryCache.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt,
      size: this.estimateObjectSize(value)
    });
    
    // Cleanup if cache is too large
    if (this.memoryCache.size > this.maxCacheSize) {
      this.cleanupExpiredCacheItems();
    }
  }
  
  /**
   * Get item from managed cache
   */
  getCacheItem<T>(key: string): T | null {
    const item = this.memoryCache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  /**
   * Get memory health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical' | 'emergency';
    currentUsage: number;
    trend: string;
    circuitBreakerState: string;
    recommendations: string[];
  } {
    const current = this.getCurrentMemoryMetrics();
    if (!current) {
      return {
        status: 'critical',
        currentUsage: 0,
        trend: 'unknown',
        circuitBreakerState: this.circuitBreakerState,
        recommendations: ['No memory metrics available']
      };
    }
    
    const trend = this.getMemoryTrend(30);
    const recommendations: string[] = [];
    
    let status: 'healthy' | 'warning' | 'critical' | 'emergency' = 'healthy';
    
    if (current.usage >= this.thresholds.emergency) {
      status = 'emergency';
      recommendations.push('EMERGENCY: Memory usage critically high');
      recommendations.push('Immediate cleanup required');
      recommendations.push('Consider restarting service');
    } else if (current.usage >= this.thresholds.critical) {
      status = 'critical';
      recommendations.push('Memory usage critical - cleanup needed');
      recommendations.push('Monitor for memory leaks');
    } else if (current.usage >= this.thresholds.warning) {
      status = 'warning';
      recommendations.push('Memory usage elevated');
      recommendations.push('Consider enabling more aggressive cleanup');
    }
    
    if (trend.trend === 'increasing') {
      recommendations.push('Memory usage trending upward');
      recommendations.push('Investigate potential memory leaks');
    }
    
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      recommendations.push('Circuit breaker is OPEN - system protection active');
    }
    
    return {
      status,
      currentUsage: current.usage,
      trend: trend.trend,
      circuitBreakerState: this.circuitBreakerState,
      recommendations
    };
  }
  
  /**
   * Collect current memory metrics
   */
  private collectMemoryMetrics(): void {
    const memoryUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    
    const metrics: MemoryMetrics = {
      timestamp: new Date(),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      usage: Math.round((memoryUsage.heapUsed / totalMemory) * 100),
      available: Math.round((totalMemory - memoryUsage.heapUsed) / 1024 / 1024)
    };
    
    this.metrics.push(metrics);
    
    // Cleanup old metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
    
    this.emit('metrics-collected', metrics);
  }
  
  /**
   * Check memory thresholds and trigger alerts
   */
  private checkMemoryThresholds(): void {
    const current = this.getCurrentMemoryMetrics();
    if (!current) return;
    
    if (current.usage >= this.thresholds.emergency) {
      this.emit('memory-emergency', current);
      logger.error('MEMORY EMERGENCY', {
        usage: current.usage,
        heapUsed: current.heapUsed,
        available: current.available
      });
      
      // Force immediate cleanup
      this.forceCleanup().catch(error => {
        logger.error('Emergency cleanup failed', { error });
      });
      
    } else if (current.usage >= this.thresholds.critical) {
      this.emit('memory-critical', current);
      logger.warn('Memory usage critical', {
        usage: current.usage,
        heapUsed: current.heapUsed
      });
      
    } else if (current.usage >= this.thresholds.warning) {
      this.emit('memory-warning', current);
      logger.info('Memory usage warning', {
        usage: current.usage,
        heapUsed: current.heapUsed
      });
    }
  }
  
  /**
   * Run cleanup tasks
   */
  private async runCleanupTasks(): Promise<void> {
    const now = new Date();
    
    for (const task of this.cleanupTasks.values()) {
      if (!task.enabled) continue;
      
      const shouldRun = !task.lastRun || 
        (now.getTime() - task.lastRun.getTime()) >= task.interval;
      
      if (shouldRun) {
        try {
          const freed = await task.cleanup();
          task.lastRun = now;
          
          if (freed > 0) {
            logger.debug('Cleanup task freed memory', {
              id: task.id,
              freedMB: Math.round(freed / 1024 / 1024)
            });
          }
        } catch (error) {
          logger.error('Cleanup task failed', {
            id: task.id,
            error
          });
        }
      }
    }
  }
  
  /**
   * Setup default cleanup tasks
   */
  private setupDefaultCleanupTasks(): void {
    // Cache cleanup
    this.registerCleanupTask({
      id: 'cache-cleanup',
      name: 'Cache Cleanup',
      priority: 8,
      interval: 300000, // 5 minutes
      enabled: true,
      cleanup: async () => {
        const before = this.memoryCache.size;
        this.cleanupExpiredCacheItems();
        const after = this.memoryCache.size;
        return (before - after) * 1024; // Estimate 1KB per item
      }
    });
    
    // Metrics cleanup
    this.registerCleanupTask({
      id: 'metrics-cleanup',
      name: 'Metrics History Cleanup',
      priority: 6,
      interval: 3600000, // 1 hour
      enabled: true,
      cleanup: async () => {
        const before = this.metrics.length;
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
        const after = this.metrics.length;
        return (before - after) * 256; // Estimate 256 bytes per metric
      }
    });
    
    // Garbage collection
    this.registerCleanupTask({
      id: 'garbage-collection',
      name: 'Forced Garbage Collection',
      priority: 9,
      interval: 600000, // 10 minutes
      enabled: typeof global.gc === 'function',
      cleanup: async () => {
        if (global.gc) {
          const before = process.memoryUsage().heapUsed;
          global.gc();
          const after = process.memoryUsage().heapUsed;
          return Math.max(0, before - after);
        }
        return 0;
      }
    });
  }
  
  /**
   * Setup process memory warnings
   */
  private setupProcessMemoryWarnings(): void {
    if (process.listenerCount('warning') === 0) {
      process.on('warning', (warning) => {
        if (warning.name === 'MaxListenersExceededWarning' || 
            warning.message.includes('memory')) {
          logger.warn('Process memory warning', {
            name: warning.name,
            message: warning.message
          });
          this.emit('process-warning', warning);
        }
      });
    }
  }
  
  /**
   * Record circuit breaker failure
   */
  private recordCircuitBreakerFailure(): void {
    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailure = new Date();
    
    if (this.circuitBreakerFailures >= this.circuitBreaker.failureThreshold) {
      this.circuitBreakerState = CircuitBreakerState.OPEN;
      logger.error('Circuit breaker opened due to failures', {
        failures: this.circuitBreakerFailures,
        threshold: this.circuitBreaker.failureThreshold
      });
      this.emit('circuit-breaker-opened');
    }
  }
  
  /**
   * Cleanup expired cache items
   */
  private cleanupExpiredCacheItems(): void {
    const now = Date.now();
    const before = this.memoryCache.size;
    
    for (const [key, item] of this.memoryCache.entries()) {
      if (now > item.expiresAt) {
        this.memoryCache.delete(key);
      }
    }
    
    // If still too large, remove oldest items
    if (this.memoryCache.size > this.maxCacheSize) {
      const entries = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      
      const toRemove = this.memoryCache.size - this.maxCacheSize;
      for (let i = 0; i < toRemove; i++) {
        this.memoryCache.delete(entries[i][0]);
      }
    }
    
    const after = this.memoryCache.size;
    if (before > after) {
      logger.debug('Cache cleanup completed', {
        before,
        after,
        removed: before - after
      });
    }
  }
  
  /**
   * Estimate object memory size
   */
  private estimateObjectSize(obj: any): number {
    const str = JSON.stringify(obj);
    return str.length * 2; // UTF-16 characters = 2 bytes each
  }
}

// Export singleton instance
export const memoryManager = new MemoryManager();

// Auto-start monitoring in production
if (process.env.NODE_ENV === 'production') {
  memoryManager.startMonitoring(60000); // 1-minute intervals
}