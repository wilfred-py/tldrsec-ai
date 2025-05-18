import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logging';
// Create a monitoring singleton class
class Monitoring {
    constructor() {
        this.metrics = new Map();
        this.healthChecks = new Map();
        this.startTime = new Date();
        this.maxMetricValues = 1000; // Keep only the last 1000 values per metric
        this.componentLogger = logger.child('monitoring');
        this.prisma = new PrismaClient();
        this.registerDefaultHealthChecks();
    }
    /**
     * Record a metric value
     */
    recordMetric(name, value, tags, unit, description) {
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
    incrementCounter(name, increment = 1, tags, description) {
        this.recordMetric(name, increment, tags, 'count', description);
    }
    /**
     * Record a timing metric in milliseconds
     */
    recordTiming(name, timeMs, tags) {
        this.recordMetric(name, timeMs, tags, 'ms', 'Response time in milliseconds');
    }
    /**
     * Get a specific metric
     */
    getMetric(name) {
        return this.metrics.get(name);
    }
    /**
     * Get all metrics
     */
    getAllMetrics() {
        return Array.from(this.metrics.values());
    }
    /**
     * Register a health check function
     */
    registerHealthCheck(name, checkFn) {
        this.healthChecks.set(name, checkFn);
        this.componentLogger.info(`Registered health check: ${name}`);
    }
    /**
     * Run all health checks and return the system health status
     */
    async checkHealth() {
        const components = {};
        let overallStatus = 'healthy';
        // Run all health checks
        for (const [name, checkFn] of this.healthChecks.entries()) {
            try {
                const result = await checkFn();
                components[name] = result;
                // Update overall status based on component status
                if (result.status === 'unhealthy' && overallStatus !== 'unhealthy') {
                    overallStatus = 'unhealthy';
                }
                else if (result.status === 'degraded' && overallStatus === 'healthy') {
                    overallStatus = 'degraded';
                }
            }
            catch (error) {
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
    registerDefaultHealthChecks() {
        // Database health check
        this.registerHealthCheck('database', async () => {
            try {
                // Verify database connection with a simple query
                await this.prisma.$queryRaw `SELECT 1`;
                return {
                    status: 'healthy',
                    message: 'Database connection is healthy',
                    lastChecked: new Date()
                };
            }
            catch (error) {
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
            let status = 'healthy';
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
    trackApiCall(path, method, statusCode, startTime) {
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
    trackFilingOperation(operation, filingType, count = 1) {
        this.incrementCounter('sec.filings', count, {
            operation,
            filingType
        });
    }
    /**
     * Track job operations
     */
    trackJobOperation(jobType, status, duration) {
        this.incrementCounter('jobs.processed', 1, {
            jobType,
            status
        });
        if (duration !== undefined) {
            this.recordTiming('jobs.duration', duration, {
                jobType,
                status
            });
        }
    }
}
// Create and export a singleton instance
export const monitoring = new Monitoring();
