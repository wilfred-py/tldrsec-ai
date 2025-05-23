import { PrismaClient } from '@prisma/client';
import { logger } from '../logging';

// Define metrics types
export interface MetricValue {
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface Metric {
  name: string;
  values: MetricValue[];
  unit?: string;
  description?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: Record<string, ComponentHealth>;
  version: string;
  uptime: number;
  timestamp: Date;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
  lastChecked: Date;
}

// Create a monitoring singleton class
class Monitoring {
  private metrics: Map<string, Metric> = new Map();
  private healthChecks: Map<string, () => Promise<ComponentHealth>> = new Map();
  private startTime: Date = new Date();
  private prisma: PrismaClient;
  private maxMetricValues: number = 1000; // Keep only the last 1000 values per metric
  private componentLogger = logger.child('monitoring');
  private timers: Map<string, number> = new Map(); // Store operation start times

  constructor() {
    this.prisma = new PrismaClient();
    this.registerDefaultHealthChecks();
  }

  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>, unit?: string, description?: string): void {
    // Get or create the metric
    let metric = this.metrics.get(name);
    if (!metric) {
      metric = {
        name,
        values: [],
        unit,
        description
      };
      this.metrics.set(name, metric);
    }

    // Add the new value
    metric.values.push({
      value,
      timestamp: new Date(),
      tags
    });

    // Trim old values if necessary
    if (metric.values.length > this.maxMetricValues) {
      metric.values = metric.values.slice(metric.values.length - this.maxMetricValues);
    }

    // Log for debugging in development
    if (process.env.NODE_ENV !== 'production') {
      this.componentLogger.debug(`Recorded metric: ${name}`, { value, tags });
    }
  }

  /**
   * Record a counter increment
   */
  incrementCounter(name: string, increment: number = 1, tags?: Record<string, string>, description?: string): void {
    this.recordMetric(name, increment, tags, 'count', description);
  }

  /**
   * Record a numeric value for a specific metric
   * 
   * @param metric - The name of the metric to record
   * @param value - The numeric value to record
   * @param tags - Optional tags for the metric
   */
  recordValue(metric: string, value: number, tags: Record<string, string> = {}): void {
    this.incrementCounter(`${metric}.count`, 1, tags);
    
    // In a real monitoring system, this would use a different type of metric
    // like a gauge or histogram. For now, we're logging it for development.
    console.log(`[Monitoring] Value: ${metric} = ${value}`, {
      ...tags,
      value
    });
  }

  /**
   * Start a timer for measuring operation duration
   * 
   * @param operationName - Unique identifier for the operation being timed
   * @returns The operation name for chaining
   */
  startTimer(operationName: string): string {
    this.timers.set(operationName, Date.now());
    return operationName;
  }

  /**
   * Stop a timer and record the duration
   * 
   * @param operationName - The name of the timer to stop (same as used in startTimer)
   * @param tags - Optional tags to associate with the timing data
   * @returns The duration in milliseconds, or undefined if timer wasn't found
   */
  stopTimer(operationName: string, tags: Record<string, string> = {}): number | undefined {
    const startTime = this.timers.get(operationName);
    if (startTime === undefined) {
      this.componentLogger.warn(`Attempted to stop non-existent timer: ${operationName}`);
      return undefined;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(operationName);
    
    // Record the timing data
    this.recordTiming(operationName, duration, tags);
    
    return duration;
  }

  /**
   * Record timing information for performance monitoring
   * 
   * @param metric - The name of the timing metric
   * @param durationMs - Duration in milliseconds
   * @param tags - Optional tags for the metric
   */
  recordTiming(metric: string, durationMs: number, tags: Record<string, string | boolean> = {}): void {
    // Convert boolean values to strings for consistent handling
    const normalizedTags: Record<string, string> = {};
    for (const [key, value] of Object.entries(tags)) {
      normalizedTags[key] = String(value);
    }
    
    this.recordValue(`${metric}.duration_ms`, durationMs, normalizedTags);
    
    // Log times above certain thresholds for easy identification of slow operations
    if (durationMs > 5000) {
      console.warn(`[Monitoring] Slow operation: ${metric} took ${durationMs}ms`, normalizedTags);
    }
  }

  /**
   * Get a specific metric
   */
  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Register a health check function
   */
  registerHealthCheck(name: string, checkFn: () => Promise<ComponentHealth>): void {
    this.healthChecks.set(name, checkFn);
    this.componentLogger.info(`Registered health check: ${name}`);
  }

  /**
   * Run all health checks and return the system health status
   */
  async checkHealth(): Promise<HealthStatus> {
    const components: Record<string, ComponentHealth> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Run all health checks
    for (const [name, checkFn] of this.healthChecks.entries()) {
      try {
        const result = await checkFn();
        components[name] = result;

        // Update overall status based on component status
        if (result.status === 'unhealthy' && overallStatus !== 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        this.componentLogger.error(`Health check failed for ${name}`, error);
        components[name] = {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          lastChecked: new Date()
        };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      components,
      version: process.env.VERSION || '0.1.0',
      uptime: (new Date().getTime() - this.startTime.getTime()) / 1000, // uptime in seconds
      timestamp: new Date()
    };
  }

  /**
   * Register default health checks
   */
  private registerDefaultHealthChecks(): void {
    // Database health check
    this.registerHealthCheck('database', async () => {
      try {
        // Verify database connection with a simple query
        await this.prisma.$queryRaw`SELECT 1`;
        return {
          status: 'healthy',
          message: 'Database connection is healthy',
          lastChecked: new Date()
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Database connection failed',
          lastChecked: new Date()
        };
      }
    });

    // Check memory usage
    this.registerHealthCheck('memory', async () => {
      const memoryUsage = process.memoryUsage();
      const memoryThresholdMB = 1024; // 1GB threshold
      
      const usedMemoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const totalMemoryMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const memoryUsagePercent = (usedMemoryMB / totalMemoryMB) * 100;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Memory usage is normal';
      
      if (usedMemoryMB > memoryThresholdMB) {
        status = 'degraded';
        message = 'Memory usage is high';
      }
      
      if (memoryUsagePercent > 90) {
        status = 'unhealthy';
        message = 'Memory usage is critically high';
      }
      
      return {
        status,
        message,
        details: {
          usedMemoryMB,
          totalMemoryMB,
          memoryUsagePercent: Math.round(memoryUsagePercent)
        },
        lastChecked: new Date()
      };
    });

    // You could add other checks like:
    // - SEC API availability
    // - Job queue health
    // - Recent job success rates
  }

  /**
   * Track API response time
   */
  trackApiCall(path: string, method: string, statusCode: number, startTime: number): void {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    this.recordTiming('api.response_time', duration, { 
      path, 
      method,
      statusCode: statusCode.toString()
    });
    
    this.incrementCounter('api.requests', 1, { 
      path, 
      method,
      statusCode: statusCode.toString()
    });
  }

  /**
   * Track SEC filing operations
   */
  trackFilingOperation(operation: string, filingType: string, count: number = 1): void {
    this.incrementCounter('sec.filings', count, { 
      operation, 
      filingType 
    });
  }

  /**
   * Track job operations
   */
  trackJobOperation(jobType: string, operation: string, durationMs?: number): void {
    this.incrementCounter(`jobs.${operation}`, 1, { jobType });
    
    if (durationMs !== undefined) {
      this.recordTiming('jobs.duration', durationMs, { 
        jobType, 
        operation 
      });
    }
  }
}

// Create and export a singleton instance
export const monitoring = new Monitoring(); 