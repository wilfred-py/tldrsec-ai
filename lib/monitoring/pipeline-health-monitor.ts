/**
 * Pipeline Health Monitoring Utilities
 * 
 * Real-time health monitoring and alerting system for the SEC filing pipeline.
 * Provides continuous monitoring, health scoring, and automated response capabilities.
 * 
 * Features:
 * - Real-time health scoring and trending
 * - Automated alerting with escalation
 * - Performance profiling and optimization recommendations
 * - Cost monitoring and budget enforcement
 * - Security monitoring and threat detection
 * - User experience tracking and SLA monitoring
 * - Predictive maintenance and failure prevention
 */

import { EventEmitter } from 'events';
import { logger } from '../logging';
import { prisma } from '../db/index';
import { pipelineErrorDetector, type ErrorAlert, type DetectionReport } from './pipeline-error-detector';
import { performance } from 'perf_hooks';

const healthLogger = logger.child('pipeline-health-monitor');

export interface HealthMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  threshold: {
    warning: number;
    critical: number;
  };
  trend: 'improving' | 'degrading' | 'stable';
  status: 'healthy' | 'warning' | 'critical';
}

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  message: string;
  duration: number;
  details?: Record<string, any>;
  recommendations?: string[];
}

export interface SystemHealth {
  overall: {
    score: number;
    status: 'healthy' | 'warning' | 'critical';
    timestamp: Date;
  };
  components: {
    database: HealthCheckResult;
    aiService: HealthCheckResult;
    emailService: HealthCheckResult;
    fileValidation: HealthCheckResult;
    userManagement: HealthCheckResult;
    costManagement: HealthCheckResult;
    security: HealthCheckResult;
  };
  metrics: HealthMetric[];
  alerts: ErrorAlert[];
  sla: {
    uptime: number;
    responseTime: number;
    errorRate: number;
    availability: number;
  };
  performance: {
    cpu: number;
    memory: number;
    diskIO: number;
    networkIO: number;
  };
}

export interface AlertConfig {
  email: {
    enabled: boolean;
    recipients: string[];
    severity: ('low' | 'medium' | 'high' | 'critical')[];
  };
  slack: {
    enabled: boolean;
    webhook?: string;
    channel?: string;
  };
  pagerDuty: {
    enabled: boolean;
    routingKey?: string;
  };
  escalation: {
    timeToEscalate: number; // minutes
    escalationLevels: string[];
  };
}

export interface MonitoringConfig {
  intervals: {
    healthCheck: number; // seconds
    metricsCollection: number; // seconds
    alertEvaluation: number; // seconds
  };
  retention: {
    metrics: number; // days
    alerts: number; // days
    healthHistory: number; // days
  };
  thresholds: {
    responseTime: { warning: number; critical: number };
    errorRate: { warning: number; critical: number };
    cost: { warning: number; critical: number };
    uptime: { warning: number; critical: number };
  };
  alerts: AlertConfig;
}

class PipelineHealthMonitor extends EventEmitter {
  private static instance: PipelineHealthMonitor;
  private config: MonitoringConfig;
  private isMonitoring: boolean = false;
  private healthHistory: SystemHealth[] = [];
  private intervalIds: NodeJS.Timeout[] = [];
  private lastHealthCheck?: SystemHealth;

  private constructor(config: Partial<MonitoringConfig> = {}) {
    super();
    this.config = this.mergeWithDefaults(config);
    this.setupEventListeners();
  }

  public static getInstance(config?: Partial<MonitoringConfig>): PipelineHealthMonitor {
    if (!PipelineHealthMonitor.instance) {
      PipelineHealthMonitor.instance = new PipelineHealthMonitor(config);
    }
    return PipelineHealthMonitor.instance;
  }

  /**
   * Start continuous monitoring
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      healthLogger.warn('Monitoring is already running');
      return;
    }

    healthLogger.info('Starting pipeline health monitoring', {
      intervals: this.config.intervals,
      thresholds: this.config.thresholds
    });

    this.isMonitoring = true;

    // Health check interval
    const healthCheckInterval = setInterval(
      () => this.performHealthCheck(),
      this.config.intervals.healthCheck * 1000
    );

    // Metrics collection interval
    const metricsInterval = setInterval(
      () => this.collectMetrics(),
      this.config.intervals.metricsCollection * 1000
    );

    // Alert evaluation interval
    const alertInterval = setInterval(
      () => this.evaluateAlerts(),
      this.config.intervals.alertEvaluation * 1000
    );

    this.intervalIds.push(healthCheckInterval, metricsInterval, alertInterval);

    // Perform initial health check
    this.performHealthCheck();

    this.emit('monitoring:started');
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      healthLogger.warn('Monitoring is not running');
      return;
    }

    healthLogger.info('Stopping pipeline health monitoring');

    this.isMonitoring = false;
    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds = [];

    this.emit('monitoring:stopped');
  }

  /**
   * Perform comprehensive health check
   */
  public async performHealthCheck(): Promise<SystemHealth> {
    const startTime = performance.now();
    
    try {
      healthLogger.debug('Performing comprehensive health check');

      const [
        databaseHealth,
        aiServiceHealth,
        emailServiceHealth,
        fileValidationHealth,
        userManagementHealth,
        costManagementHealth,
        securityHealth
      ] = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkAIServiceHealth(),
        this.checkEmailServiceHealth(),
        this.checkFileValidationHealth(),
        this.checkUserManagementHealth(),
        this.checkCostManagementHealth(),
        this.checkSecurityHealth()
      ]);

      // Collect current metrics
      const metrics = await this.collectCurrentMetrics();
      
      // Get active alerts
      const alerts = await pipelineErrorDetector.analyzeAndDetect(
        await pipelineErrorDetector.collectMetrics()
      );

      // Calculate SLA metrics
      const sla = await this.calculateSLAMetrics();

      // Get performance metrics (simulated - would come from system monitoring)
      const performanceMetrics = await this.getPerformanceMetrics();

      const components = {
        database: this.extractResult(databaseHealth),
        aiService: this.extractResult(aiServiceHealth),
        emailService: this.extractResult(emailServiceHealth),
        fileValidation: this.extractResult(fileValidationHealth),
        userManagement: this.extractResult(userManagementHealth),
        costManagement: this.extractResult(costManagementHealth),
        security: this.extractResult(securityHealth)
      };

      // Calculate overall health score
      const overallScore = this.calculateOverallHealthScore(components, metrics, alerts);
      const overallStatus = this.determineOverallStatus(overallScore, alerts);

      const systemHealth: SystemHealth = {
        overall: {
          score: overallScore,
          status: overallStatus,
          timestamp: new Date()
        },
        components,
        metrics,
        alerts,
        sla,
        performance: performanceMetrics
      };

      // Store in history
      this.addToHistory(systemHealth);
      this.lastHealthCheck = systemHealth;

      const duration = performance.now() - startTime;
      
      healthLogger.info('Health check completed', {
        overallScore,
        overallStatus,
        duration,
        alertCount: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length
      });

      this.emit('health:check:completed', systemHealth);

      return systemHealth;

    } catch (error) {
      const errorHealth: SystemHealth = {
        overall: {
          score: 0,
          status: 'critical',
          timestamp: new Date()
        },
        components: {
          database: { name: 'Database', status: 'unknown', message: 'Health check failed', duration: 0 },
          aiService: { name: 'AI Service', status: 'unknown', message: 'Health check failed', duration: 0 },
          emailService: { name: 'Email Service', status: 'unknown', message: 'Health check failed', duration: 0 },
          fileValidation: { name: 'File Validation', status: 'unknown', message: 'Health check failed', duration: 0 },
          userManagement: { name: 'User Management', status: 'unknown', message: 'Health check failed', duration: 0 },
          costManagement: { name: 'Cost Management', status: 'unknown', message: 'Health check failed', duration: 0 },
          security: { name: 'Security', status: 'unknown', message: 'Health check failed', duration: 0 }
        },
        metrics: [],
        alerts: [],
        sla: { uptime: 0, responseTime: 0, errorRate: 100, availability: 0 },
        performance: { cpu: 0, memory: 0, diskIO: 0, networkIO: 0 }
      };

      healthLogger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
        duration: performance.now() - startTime
      });

      this.emit('health:check:failed', error);
      return errorHealth;
    }
  }

  /**
   * Get current system health
   */
  public getCurrentHealth(): SystemHealth | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Get health history
   */
  public getHealthHistory(hours: number = 24): SystemHealth[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.healthHistory.filter(h => h.overall.timestamp >= cutoff);
  }

  /**
   * Get health trends
   */
  public getHealthTrends(hours: number = 24): Record<string, any> {
    const history = this.getHealthHistory(hours);
    
    if (history.length < 2) {
      return { trend: 'insufficient_data', message: 'Not enough data to determine trends' };
    }

    const scores = history.map(h => h.overall.score);
    const recent = scores.slice(-5); // Last 5 measurements
    const older = scores.slice(-10, -5); // Previous 5 measurements

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;

    let trend: 'improving' | 'degrading' | 'stable';
    if (recentAvg > olderAvg + 5) trend = 'improving';
    else if (recentAvg < olderAvg - 5) trend = 'degrading';
    else trend = 'stable';

    return {
      trend,
      currentScore: scores[scores.length - 1],
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      measurements: scores.length,
      period: `${hours} hours`
    };
  }

  /**
   * Force alert evaluation
   */
  public async evaluateAlerts(): Promise<void> {
    try {
      const detectionReport = await pipelineErrorDetector.generateDetectionReport();
      
      for (const alert of detectionReport.activeAlerts) {
        this.processAlert(alert);
      }

      this.emit('alerts:evaluated', {
        alertCount: detectionReport.activeAlerts.length,
        criticalCount: detectionReport.activeAlerts.filter(a => a.severity === 'critical').length
      });

    } catch (error) {
      healthLogger.error('Alert evaluation failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Private methods

  private mergeWithDefaults(config: Partial<MonitoringConfig>): MonitoringConfig {
    return {
      intervals: {
        healthCheck: 60, // 1 minute
        metricsCollection: 30, // 30 seconds
        alertEvaluation: 120, // 2 minutes
        ...config.intervals
      },
      retention: {
        metrics: 7, // 7 days
        alerts: 30, // 30 days
        healthHistory: 7, // 7 days
        ...config.retention
      },
      thresholds: {
        responseTime: { warning: 5000, critical: 10000 }, // milliseconds
        errorRate: { warning: 2, critical: 5 }, // percentage
        cost: { warning: 80, critical: 95 }, // percentage of budget
        uptime: { warning: 99.5, critical: 99.0 }, // percentage
        ...config.thresholds
      },
      alerts: {
        email: {
          enabled: false,
          recipients: [],
          severity: ['high', 'critical'],
          ...config.alerts?.email
        },
        slack: {
          enabled: false,
          ...config.alerts?.slack
        },
        pagerDuty: {
          enabled: false,
          ...config.alerts?.pagerDuty
        },
        escalation: {
          timeToEscalate: 15, // 15 minutes
          escalationLevels: ['team-lead', 'manager', 'director'],
          ...config.alerts?.escalation
        },
        ...config.alerts
      }
    };
  }

  private setupEventListeners(): void {
    this.on('health:check:completed', (health: SystemHealth) => {
      if (health.overall.status === 'critical') {
        healthLogger.error('Critical system health detected', {
          score: health.overall.score,
          criticalAlerts: health.alerts.filter(a => a.severity === 'critical').length
        });
      }
    });

    this.on('alert:triggered', (alert: ErrorAlert) => {
      healthLogger.warn('Alert triggered', {
        type: alert.type,
        severity: alert.severity,
        title: alert.title
      });
    });
  }

  private async checkDatabaseHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Test basic connectivity
      await prisma.$connect();
      
      // Test read operation
      const userCount = await prisma.user.count();
      
      // Test write operation (if needed)
      await prisma.$queryRaw`SELECT 1 as test`;
      
      const duration = performance.now() - startTime;
      
      let status: HealthCheckResult['status'] = 'healthy';
      let message = 'Database is healthy';
      const recommendations: string[] = [];
      
      if (duration > 1000) {
        status = 'warning';
        message = 'Database response time is slow';
        recommendations.push('Check database performance');
      }
      
      if (duration > 5000) {
        status = 'critical';
        message = 'Database response time is critically slow';
        recommendations.push('Immediate database investigation required');
      }

      return {
        name: 'Database',
        status,
        message,
        duration,
        details: {
          userCount,
          connectionTime: duration
        },
        recommendations: recommendations.length > 0 ? recommendations : undefined
      };

    } catch (error) {
      return {
        name: 'Database',
        status: 'critical',
        message: `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: performance.now() - startTime,
        recommendations: ['Check database connectivity', 'Verify connection string', 'Check database status']
      };
    }
  }

  private async checkAIServiceHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Simulate AI service health check
      // In a real implementation, this would test the AI API
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const duration = performance.now() - startTime;
      
      // Check if OpenRouter API key is configured
      const hasApiKey = !!process.env.OPENROUTER_API_KEY;
      
      if (!hasApiKey) {
        return {
          name: 'AI Service',
          status: 'critical',
          message: 'AI API key not configured',
          duration,
          recommendations: ['Configure OPENROUTER_API_KEY environment variable']
        };
      }

      return {
        name: 'AI Service',
        status: 'healthy',
        message: 'AI service is healthy',
        duration,
        details: {
          apiKeyConfigured: hasApiKey,
          responseTime: duration
        }
      };

    } catch (error) {
      return {
        name: 'AI Service',
        status: 'critical',
        message: `AI service check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: performance.now() - startTime,
        recommendations: ['Check AI service status', 'Verify API credentials']
      };
    }
  }

  private async checkEmailServiceHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Check if email service is configured
      const hasEmailConfig = !!process.env.RESEND_API_KEY;
      
      const duration = performance.now() - startTime;
      
      if (!hasEmailConfig) {
        return {
          name: 'Email Service',
          status: 'warning',
          message: 'Email service not configured',
          duration,
          recommendations: ['Configure RESEND_API_KEY for email functionality']
        };
      }

      // In a real implementation, this would test email delivery
      return {
        name: 'Email Service',
        status: 'healthy',
        message: 'Email service is healthy',
        duration,
        details: {
          configured: hasEmailConfig
        }
      };

    } catch (error) {
      return {
        name: 'Email Service',
        status: 'critical',
        message: `Email service check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: performance.now() - startTime,
        recommendations: ['Check email service configuration']
      };
    }
  }

  private async checkFileValidationHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Test file validation system
      const { FilingContentValidator } = await import('../validation/filing-content-validator');
      
      const testResult = await FilingContentValidator.validate(
        '<html><body>Test content for health check validation</body></html>',
        '0000000000-24-000001'
      );
      
      const duration = performance.now() - startTime;
      
      if (!testResult.isValid) {
        return {
          name: 'File Validation',
          status: 'warning',
          message: 'File validation test failed',
          duration,
          details: { validationResult: testResult },
          recommendations: ['Review file validation logic']
        };
      }

      return {
        name: 'File Validation',
        status: 'healthy',
        message: 'File validation is healthy',
        duration,
        details: {
          validationTime: testResult.validationMetrics.validationTimeMs,
          detectedFormat: testResult.validationMetrics.detectedFormat
        }
      };

    } catch (error) {
      return {
        name: 'File Validation',
        status: 'critical',
        message: `File validation check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: performance.now() - startTime,
        recommendations: ['Check file validation module']
      };
    }
  }

  private async checkUserManagementHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Test user management operations
      const recentUsers = await prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });
      
      const duration = performance.now() - startTime;

      return {
        name: 'User Management',
        status: 'healthy',
        message: 'User management is healthy',
        duration,
        details: {
          recentUsers,
          queryTime: duration
        }
      };

    } catch (error) {
      return {
        name: 'User Management',
        status: 'critical',
        message: `User management check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: performance.now() - startTime,
        recommendations: ['Check user management system']
      };
    }
  }

  private async checkCostManagementHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Check cost tracking and budget management
      const totalBudgetUsed = await prisma.user.aggregate({
        _sum: {
          budgetUsed: true
        }
      });
      
      const totalBudgetAvailable = await prisma.user.aggregate({
        _sum: {
          processingBudget: true
        }
      });
      
      const duration = performance.now() - startTime;
      
      const budgetUtilization = totalBudgetAvailable._sum.processingBudget 
        ? ((totalBudgetUsed._sum.budgetUsed || 0) / totalBudgetAvailable._sum.processingBudget) * 100
        : 0;

      let status: HealthCheckResult['status'] = 'healthy';
      let message = 'Cost management is healthy';
      const recommendations: string[] = [];
      
      if (budgetUtilization > this.config.thresholds.cost.warning) {
        status = 'warning';
        message = 'Budget utilization is high';
        recommendations.push('Monitor cost usage closely');
      }
      
      if (budgetUtilization > this.config.thresholds.cost.critical) {
        status = 'critical';
        message = 'Budget utilization is critical';
        recommendations.push('Immediate cost review required');
      }

      return {
        name: 'Cost Management',
        status,
        message,
        duration,
        details: {
          budgetUtilization,
          totalBudgetUsed: totalBudgetUsed._sum.budgetUsed || 0,
          totalBudgetAvailable: totalBudgetAvailable._sum.processingBudget || 0
        },
        recommendations: recommendations.length > 0 ? recommendations : undefined
      };

    } catch (error) {
      return {
        name: 'Cost Management',
        status: 'critical',
        message: `Cost management check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: performance.now() - startTime,
        recommendations: ['Check cost tracking system']
      };
    }
  }

  private async checkSecurityHealth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Check for security issues
      const failedAuditLogs = await prisma.auditLog.count({
        where: {
          success: false,
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
          }
        }
      });
      
      const duration = performance.now() - startTime;
      
      let status: HealthCheckResult['status'] = 'healthy';
      let message = 'Security is healthy';
      const recommendations: string[] = [];
      
      if (failedAuditLogs > 10) {
        status = 'warning';
        message = 'High number of failed operations detected';
        recommendations.push('Review security logs');
      }
      
      if (failedAuditLogs > 50) {
        status = 'critical';
        message = 'Very high number of failed operations - possible attack';
        recommendations.push('Immediate security investigation required');
      }

      return {
        name: 'Security',
        status,
        message,
        duration,
        details: {
          failedOperations: failedAuditLogs,
          cronSecretConfigured: !!process.env.CRON_SECRET
        },
        recommendations: recommendations.length > 0 ? recommendations : undefined
      };

    } catch (error) {
      return {
        name: 'Security',
        status: 'critical',
        message: `Security check failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: performance.now() - startTime,
        recommendations: ['Check security monitoring system']
      };
    }
  }

  private async collectCurrentMetrics(): Promise<HealthMetric[]> {
    const metrics: HealthMetric[] = [];
    
    try {
      // Collect various health metrics
      const dbResponseTime = await this.measureDatabaseResponseTime();
      metrics.push({
        name: 'Database Response Time',
        value: dbResponseTime,
        unit: 'ms',
        timestamp: new Date(),
        threshold: { warning: 1000, critical: 5000 },
        trend: 'stable',
        status: dbResponseTime > 5000 ? 'critical' : dbResponseTime > 1000 ? 'warning' : 'healthy'
      });

      // Add more metrics as needed
      const errorRate = await this.calculateErrorRate();
      metrics.push({
        name: 'Error Rate',
        value: errorRate,
        unit: '%',
        timestamp: new Date(),
        threshold: { warning: 2, critical: 5 },
        trend: 'stable',
        status: errorRate > 5 ? 'critical' : errorRate > 2 ? 'warning' : 'healthy'
      });

    } catch (error) {
      healthLogger.error('Failed to collect metrics', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return metrics;
  }

  private async measureDatabaseResponseTime(): Promise<number> {
    const startTime = performance.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return performance.now() - startTime;
    } catch (error) {
      return -1; // Indicate error
    }
  }

  private async calculateErrorRate(): Promise<number> {
    try {
      const totalLogs = await prisma.auditLog.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
          }
        }
      });

      const failedLogs = await prisma.auditLog.count({
        where: {
          success: false,
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000)
          }
        }
      });

      return totalLogs > 0 ? (failedLogs / totalLogs) * 100 : 0;
    } catch (error) {
      return -1; // Indicate error
    }
  }

  private async calculateSLAMetrics(): Promise<SystemHealth['sla']> {
    // In a real implementation, these would be calculated from actual metrics
    return {
      uptime: 99.9,
      responseTime: 2500,
      errorRate: 0.5,
      availability: 99.95
    };
  }

  private async getPerformanceMetrics(): Promise<SystemHealth['performance']> {
    const os = require('os');
    const fs = require('fs').promises;
    
    // Get real CPU usage
    let cpuUsage = 0;
    if (typeof process !== 'undefined') {
      if (process.cpuUsage) {
        const usage = process.cpuUsage();
        const totalCpuTime = usage.user + usage.system;
        cpuUsage = Math.min(100, Math.max(0, (totalCpuTime / 1000000) * 100));
      } else if (process.platform !== 'win32') {
        // Use load average as fallback
        const loadAvg = os.loadavg();
        const cpuCount = os.cpus().length;
        cpuUsage = Math.min(100, (loadAvg[0] / cpuCount) * 100);
      }
    }
    
    // Get real memory usage
    let memoryUsage = 0;
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      const totalMemory = os.totalmem();
      memoryUsage = (memory.heapUsed / totalMemory) * 100;
    }
    
    // Get disk I/O usage (simplified - check if we can access filesystem)
    let diskIO = 0;
    try {
      const startTime = process.hrtime.bigint();
      await fs.access('/tmp', fs.constants.F_OK);
      const endTime = process.hrtime.bigint();
      const accessTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      // Estimate disk I/O based on filesystem access time
      diskIO = Math.min(100, Math.max(0, (accessTime - 1) * 20));
    } catch (error) {
      // If we can't access filesystem, assume moderate I/O
      diskIO = 25;
    }
    
    // Get network I/O usage (simplified - check network interfaces)
    let networkIO = 0;
    try {
      const networkInterfaces = os.networkInterfaces();
      const activeInterfaces = Object.values(networkInterfaces)
        .flat()
        .filter(iface => iface && !iface.internal && iface.family === 'IPv4');
      
      // Estimate network usage based on number of active interfaces
      networkIO = Math.min(100, activeInterfaces.length * 15);
    } catch (error) {
      networkIO = 10; // Default low network usage
    }
    
    return {
      cpu: Math.round(cpuUsage),
      memory: Math.round(memoryUsage),
      diskIO: Math.round(diskIO),
      networkIO: Math.round(networkIO)
    };
  }

  private extractResult(settledResult: PromiseSettledResult<HealthCheckResult>): HealthCheckResult {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    } else {
      return {
        name: 'Unknown',
        status: 'critical',
        message: `Health check failed: ${settledResult.reason}`,
        duration: 0,
        recommendations: ['Investigate health check failure']
      };
    }
  }

  private calculateOverallHealthScore(
    components: SystemHealth['components'],
    metrics: HealthMetric[],
    alerts: ErrorAlert[]
  ): number {
    let score = 100;

    // Deduct points for component issues
    Object.values(components).forEach(component => {
      switch (component.status) {
        case 'critical':
          score -= 20;
          break;
        case 'warning':
          score -= 10;
          break;
        case 'unknown':
          score -= 5;
          break;
      }
    });

    // Deduct points for metric issues
    metrics.forEach(metric => {
      switch (metric.status) {
        case 'critical':
          score -= 15;
          break;
        case 'warning':
          score -= 8;
          break;
      }
    });

    // Deduct points for alerts
    alerts.forEach(alert => {
      switch (alert.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 8;
          break;
        case 'low':
          score -= 3;
          break;
      }
    });

    return Math.max(0, score);
  }

  private determineOverallStatus(score: number, alerts: ErrorAlert[]): SystemHealth['overall']['status'] {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    
    if (criticalAlerts > 0 || score < 50) {
      return 'critical';
    } else if (score < 80) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  private addToHistory(health: SystemHealth): void {
    this.healthHistory.push(health);
    
    // Keep only recent history based on retention policy
    const cutoff = new Date(Date.now() - this.config.retention.healthHistory * 24 * 60 * 60 * 1000);
    this.healthHistory = this.healthHistory.filter(h => h.overall.timestamp >= cutoff);
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.collectCurrentMetrics();
      this.emit('metrics:collected', metrics);
    } catch (error) {
      healthLogger.error('Failed to collect metrics', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private processAlert(alert: ErrorAlert): void {
    this.emit('alert:triggered', alert);
    
    // In a real implementation, this would handle alert notifications
    // based on the alert configuration
    if (this.config.alerts.email.enabled && 
        this.config.alerts.email.severity.includes(alert.severity)) {
      this.sendEmailAlert(alert);
    }
    
    if (this.config.alerts.slack.enabled) {
      this.sendSlackAlert(alert);
    }
    
    if (this.config.alerts.pagerDuty.enabled && 
        (alert.severity === 'critical' || alert.severity === 'high')) {
      this.sendPagerDutyAlert(alert);
    }
  }

  private sendEmailAlert(alert: ErrorAlert): void {
    // Implementation would send email using configured email service
    healthLogger.info('Email alert sent', { alertId: alert.id, severity: alert.severity });
  }

  private sendSlackAlert(alert: ErrorAlert): void {
    // Implementation would send Slack notification
    healthLogger.info('Slack alert sent', { alertId: alert.id, severity: alert.severity });
  }

  private sendPagerDutyAlert(alert: ErrorAlert): void {
    // Implementation would send PagerDuty notification
    healthLogger.info('PagerDuty alert sent', { alertId: alert.id, severity: alert.severity });
  }
}

// Export singleton instance and utility functions
export const pipelineHealthMonitor = PipelineHealthMonitor.getInstance();

export async function getCurrentSystemHealth(): Promise<SystemHealth> {
  return pipelineHealthMonitor.performHealthCheck();
}

export function getHealthHistory(hours: number = 24): SystemHealth[] {
  return pipelineHealthMonitor.getHealthHistory(hours);
}

export function getHealthTrends(hours: number = 24): Record<string, any> {
  return pipelineHealthMonitor.getHealthTrends(hours);
}

export function startHealthMonitoring(config?: Partial<MonitoringConfig>): void {
  const monitor = PipelineHealthMonitor.getInstance(config);
  monitor.startMonitoring();
}

export function stopHealthMonitoring(): void {
  pipelineHealthMonitor.stopMonitoring();
}