/**
 * Database Performance Monitor
 * 
 * Provides real-time monitoring of database connection pools, query performance,
 * and resource utilization for production optimization.
 */

import { prisma } from '../db';
import { logger } from '../logging';
import { performance } from 'perf_hooks';

interface DatabaseMetrics {
  timestamp: Date;
  connectionPool: {
    active: number;
    idle: number;
    total: number;
    usage: number; // percentage
    pendingRequests: number;
  };
  queryPerformance: {
    avgQueryTime: number;
    slowQueries: number;
    totalQueries: number;
    queriesPerSecond: number;
  };
  resourceUsage: {
    memoryUsage: number;
    heapUsed: number;
    heapTotal: number;
    cpuUsage?: number;
  };
  health: {
    status: 'healthy' | 'warning' | 'critical';
    latency: number;
    errorRate: number;
    lastError?: string;
  };
}

interface QueryMetric {
  sql: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

export class DatabaseMonitor {
  private metrics: DatabaseMetrics[] = [];
  private queryMetrics: QueryMetric[] = [];
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private queryStartTimes = new Map<string, number>();
  private connectionTester?: NodeJS.Timeout;
  
  // Configuration
  private readonly maxMetricsHistory = 1440; // 24 hours at 1-minute intervals
  private readonly maxQueryHistory = 1000;
  private readonly slowQueryThreshold = 1000; // 1 second
  private readonly healthCheckInterval = 30000; // 30 seconds
  
  constructor() {
    this.setupQueryInterceptor();
  }
  
  /**
   * Start monitoring database performance
   */
  async startMonitoring(intervalMs: number = 60000): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Database monitoring already started');
      return;
    }
    
    this.isMonitoring = true;
    
    logger.info('Starting database performance monitoring', {
      interval: intervalMs,
      slowQueryThreshold: this.slowQueryThreshold
    });
    
    // Start periodic metrics collection
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics().catch(error => {
        logger.error('Error collecting database metrics', { error });
      });
    }, intervalMs);
    
    // Start connection health testing
    this.connectionTester = setInterval(() => {
      this.testConnectionHealth().catch(error => {
        logger.error('Database health check failed', { error });
      });
    }, this.healthCheckInterval);
    
    // Collect initial metrics
    await this.collectMetrics();
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
    
    if (this.connectionTester) {
      clearInterval(this.connectionTester);
      this.connectionTester = undefined;
    }
    
    logger.info('Database monitoring stopped');
  }
  
  /**
   * Get current database metrics
   */
  getCurrentMetrics(): DatabaseMetrics | null {
    return this.metrics[this.metrics.length - 1] || null;
  }
  
  /**
   * Get historical metrics
   */
  getHistoricalMetrics(hours: number = 1): DatabaseMetrics[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metrics.filter(metric => metric.timestamp >= cutoff);
  }
  
  /**
   * Get query performance statistics
   */
  getQueryStats(minutes: number = 60): {
    totalQueries: number;
    avgDuration: number;
    slowQueries: number;
    errorRate: number;
    topSlowQueries: QueryMetric[];
  } {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentQueries = this.queryMetrics.filter(q => q.timestamp >= cutoff);
    
    const totalQueries = recentQueries.length;
    const slowQueries = recentQueries.filter(q => q.duration > this.slowQueryThreshold);
    const errorQueries = recentQueries.filter(q => !q.success);
    
    const avgDuration = totalQueries > 0 
      ? recentQueries.reduce((sum, q) => sum + q.duration, 0) / totalQueries 
      : 0;
    
    const errorRate = totalQueries > 0 ? (errorQueries.length / totalQueries) * 100 : 0;
    
    // Get top 5 slowest queries
    const topSlowQueries = [...slowQueries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);
    
    return {
      totalQueries,
      avgDuration,
      slowQueries: slowQueries.length,
      errorRate,
      topSlowQueries
    };
  }
  
  /**
   * Get connection pool health assessment
   */
  getConnectionPoolHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    usage: number;
    recommendations: string[];
  } {
    const current = this.getCurrentMetrics();
    if (!current) {
      return {
        status: 'critical',
        usage: 0,
        recommendations: ['No metrics available - database monitoring not active']
      };
    }
    
    const usage = current.connectionPool.usage;
    const recommendations: string[] = [];
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (usage > 90) {
      status = 'critical';
      recommendations.push('Connection pool usage critically high (>90%)');
      recommendations.push('Consider increasing maximum connection pool size');
      recommendations.push('Investigate long-running transactions and connection leaks');
    } else if (usage > 75) {
      status = 'warning';
      recommendations.push('Connection pool usage high (>75%)');
      recommendations.push('Monitor for potential connection bottlenecks');
      recommendations.push('Consider optimizing query patterns to reduce connection time');
    }
    
    const queryStats = this.getQueryStats(30);
    if (queryStats.errorRate > 5) {
      status = 'critical';
      recommendations.push(`High query error rate: ${queryStats.errorRate.toFixed(1)}%`);
    }
    
    if (queryStats.avgDuration > 500) {
      if (status === 'healthy') status = 'warning';
      recommendations.push(`Slow average query time: ${queryStats.avgDuration.toFixed(1)}ms`);
    }
    
    return {
      status,
      usage,
      recommendations
    };
  }
  
  /**
   * Collect current database metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const startTime = performance.now();
      
      // Test database connectivity and latency
      await prisma.$queryRaw`SELECT 1 as test`;
      const latency = performance.now() - startTime;
      
      // Get process memory usage
      const memoryUsage = process.memoryUsage();
      
      // Calculate connection pool metrics (estimated from query performance)
      const recentQueries = this.getQueryStats(5); // Last 5 minutes
      
      // Estimate connection pool usage based on query patterns
      const estimatedUsage = Math.min(100, Math.max(0, 
        (recentQueries.avgDuration / 100) + // Higher avg time = more usage
        (recentQueries.errorRate * 2) + // Errors suggest resource contention
        (recentQueries.totalQueries / 10) // More queries = more usage
      ));
      
      const metrics: DatabaseMetrics = {
        timestamp: new Date(),
        connectionPool: {
          active: Math.floor(estimatedUsage / 10), // Estimated active connections
          idle: Math.max(0, 20 - Math.floor(estimatedUsage / 5)), // Estimated idle
          total: 20, // Typical default max connections
          usage: estimatedUsage,
          pendingRequests: recentQueries.errorRate > 0 ? Math.floor(recentQueries.errorRate) : 0
        },
        queryPerformance: {
          avgQueryTime: recentQueries.avgDuration,
          slowQueries: recentQueries.slowQueries,
          totalQueries: recentQueries.totalQueries,
          queriesPerSecond: recentQueries.totalQueries / 300 // 5 minutes = 300 seconds
        },
        resourceUsage: {
          memoryUsage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        },
        health: {
          status: latency < 100 ? 'healthy' : latency < 500 ? 'warning' : 'critical',
          latency: Math.round(latency),
          errorRate: recentQueries.errorRate
        }
      };
      
      this.metrics.push(metrics);
      
      // Cleanup old metrics
      if (this.metrics.length > this.maxMetricsHistory) {
        this.metrics = this.metrics.slice(-this.maxMetricsHistory);
      }
      
      // Log performance issues
      if (metrics.health.status === 'critical') {
        logger.warn('Database performance critical', {
          latency: metrics.health.latency,
          connectionUsage: metrics.connectionPool.usage,
          errorRate: metrics.health.errorRate
        });
      }
      
    } catch (error) {
      logger.error('Failed to collect database metrics', { error });
      
      // Add error metric
      this.metrics.push({
        timestamp: new Date(),
        connectionPool: { active: 0, idle: 0, total: 0, usage: 100, pendingRequests: 999 },
        queryPerformance: { avgQueryTime: 0, slowQueries: 0, totalQueries: 0, queriesPerSecond: 0 },
        resourceUsage: { memoryUsage: 0, heapUsed: 0, heapTotal: 0 },
        health: {
          status: 'critical',
          latency: 99999,
          errorRate: 100,
          lastError: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
  
  /**
   * Test database connection health
   */
  private async testConnectionHealth(): Promise<void> {
    try {
      const start = performance.now();
      
      // Test basic connectivity
      await prisma.$queryRaw`SELECT 1`;
      
      // Test connection timeout behavior
      const connectionTest = prisma.$queryRaw`SELECT pg_sleep(0.1), 1 as test`;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      );
      
      await Promise.race([connectionTest, timeoutPromise]);
      
      const duration = performance.now() - start;
      
      if (duration > 1000) {
        logger.warn('Slow database connection detected', { duration });
      }
      
    } catch (error) {
      logger.error('Database connection health check failed', { error });
    }
  }
  
  /**
   * Set up query interceptor to track performance
   */
  private setupQueryInterceptor(): void {
    // Note: Prisma doesn't provide direct query interception
    // This is a simplified approach for demonstration
    // In production, you'd use Prisma middleware or logging extensions
    
    try {
      // Check if prisma is available and has the expected method
      if (!prisma || typeof prisma.$queryRaw !== 'function') {
        logger.warn('Prisma client not available for query interception');
        return;
      }
      
      const originalQuery = prisma.$queryRaw;
      const self = this;
      
      // Only set up proxy if originalQuery exists and is a function
      if (typeof originalQuery === 'function') {
        // Override $queryRaw to track query performance
        (prisma as any).$queryRaw = new Proxy(originalQuery, {
          apply(target, thisArg, argumentsList) {
            const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const startTime = performance.now();
            
            self.queryStartTimes.set(queryId, startTime);
            
            const result = target.apply(thisArg, argumentsList);
            
            // Handle promise result
            if (result && typeof result.then === 'function') {
              return result
                .then((queryResult: any) => {
                  self.recordQueryMetric(queryId, argumentsList[0], true);
                  return queryResult;
                })
                .catch((error: Error) => {
                  self.recordQueryMetric(queryId, argumentsList[0], false, error.message);
                  throw error;
                });
            }
            
            return result;
          }
        });
      }
    } catch (error) {
      logger.warn('Failed to setup query interceptor', { error });
    }
  }
  
  /**
   * Record query performance metric
   */
  private recordQueryMetric(queryId: string, sql: any, success: boolean, error?: string): void {
    const startTime = this.queryStartTimes.get(queryId);
    if (!startTime) return;
    
    const duration = performance.now() - startTime;
    this.queryStartTimes.delete(queryId);
    
    const metric: QueryMetric = {
      sql: typeof sql === 'string' ? sql : JSON.stringify(sql),
      duration,
      timestamp: new Date(),
      success,
      error
    };
    
    this.queryMetrics.push(metric);
    
    // Cleanup old query metrics
    if (this.queryMetrics.length > this.maxQueryHistory) {
      this.queryMetrics = this.queryMetrics.slice(-this.maxQueryHistory);
    }
    
    // Log slow queries
    if (duration > this.slowQueryThreshold) {
      logger.warn('Slow database query detected', {
        duration: Math.round(duration),
        sql: metric.sql.substring(0, 200), // First 200 chars
        success
      });
    }
  }
}

// Export singleton instance
export const databaseMonitor = new DatabaseMonitor();

// Auto-start monitoring in production
if (process.env.NODE_ENV === 'production') {
  databaseMonitor.startMonitoring(60000); // 1-minute intervals
}