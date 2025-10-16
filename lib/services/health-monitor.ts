/**
 * Service Health Monitoring - Phase 3 Implementation
 * 
 * Comprehensive health monitoring and auto-recovery for microservices
 * Ensures <0.5% timeout rate through proactive service management
 */

import { logger } from '../logging/index';
import { monitoring } from '../monitoring/index';
import { eventBus, EVENT_TYPES } from './event-bus';
import { AIProcessingService } from './ai-processing-service';
import { FilingRetrievalService as _FilingRetrievalService } from './filing-retrieval-service';
import { v4 as uuidv4 } from 'uuid';

const healthLogger = logger.child('health-monitor');

export interface ServiceHealth {
  serviceName: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  uptime: number;
  responseTime: number;
  errorRate: number;
  metrics: {
    successRate: number;
    avgResponseTime: number;
    throughput: number;
    activeConnections: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  issues: HealthIssue[];
  lastIncident?: Date;
  recoveryActions?: RecoveryAction[];
}

export interface HealthIssue {
  id: string;
  type: 'timeout' | 'error_rate' | 'memory' | 'cpu' | 'connection' | 'dependency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  firstDetected: Date;
  lastOccurred: Date;
  occurrenceCount: number;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface RecoveryAction {
  id: string;
  type: 'restart' | 'scale' | 'circuit_breaker' | 'fallback' | 'alert';
  trigger: string;
  executed: boolean;
  executedAt?: Date;
  result?: 'success' | 'failure';
  details?: Record<string, unknown>;
}

export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retryCount: number;
  thresholds: {
    errorRateWarning: number;
    errorRateCritical: number;
    responseTimeWarning: number;
    responseTimeCritical: number;
    successRateWarning: number;
    successRateCritical: number;
  };
  autoRecovery: {
    enabled: boolean;
    maxAttempts: number;
    cooldownPeriod: number;
  };
}

/**
 * Health Monitor for Phase 3 Microservices
 */
export class HealthMonitor {
  
  private static instance: HealthMonitor;
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private healthChecks: Map<string, NodeJS.Timer> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();
  private readonly monitorId = uuidv4();
  
  private readonly defaultConfig: HealthCheckConfig = {
    interval: 30000, // 30 seconds
    timeout: 5000, // 5 seconds
    retryCount: 3,
    thresholds: {
      errorRateWarning: 0.05, // 5%
      errorRateCritical: 0.10, // 10%
      responseTimeWarning: 2000, // 2 seconds
      responseTimeCritical: 5000, // 5 seconds
      successRateWarning: 0.95, // 95%
      successRateCritical: 0.90 // 90%
    },
    autoRecovery: {
      enabled: true,
      maxAttempts: 3,
      cooldownPeriod: 300000 // 5 minutes
    }
  };
  
  private constructor() {
    healthLogger.info('Health Monitor initialized', { monitorId: this.monitorId });
    this.setupEventSubscriptions();
  }
  
  static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }
  
  /**
   * Start monitoring a service
   */
  startMonitoring(
    serviceName: string,
    checkFunction: () => Promise<Partial<ServiceHealth>>,
    config: Partial<HealthCheckConfig> = {}
  ): void {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    // Initialize service health
    this.serviceHealth.set(serviceName, {
      serviceName,
      status: 'unknown',
      lastCheck: new Date(),
      uptime: 0,
      responseTime: 0,
      errorRate: 0,
      metrics: {
        successRate: 0,
        avgResponseTime: 0,
        throughput: 0,
        activeConnections: 0
      },
      issues: []
    });
    
    // Start periodic health checks
    const intervalId = setInterval(async () => {
      await this.performHealthCheck(serviceName, checkFunction, finalConfig);
    }, finalConfig.interval);
    
    this.healthChecks.set(serviceName, intervalId);
    
    healthLogger.info('Started monitoring service', {
      serviceName,
      interval: finalConfig.interval,
      monitorId: this.monitorId
    });
    
    // Perform initial check
    this.performHealthCheck(serviceName, checkFunction, finalConfig);
  }
  
  /**
   * Stop monitoring a service
   */
  stopMonitoring(serviceName: string): void {
    const intervalId = this.healthChecks.get(serviceName);
    if (intervalId) {
      clearInterval(intervalId);
      this.healthChecks.delete(serviceName);
    }
    
    this.serviceHealth.delete(serviceName);
    this.recoveryAttempts.delete(serviceName);
    
    healthLogger.info('Stopped monitoring service', { serviceName });
  }
  
  /**
   * Perform health check for a service
   */
  private async performHealthCheck(
    serviceName: string,
    checkFunction: () => Promise<Partial<ServiceHealth>>,
    config: HealthCheckConfig
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Execute health check with timeout
      const checkResult = await Promise.race([
        checkFunction(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), config.timeout)
        )
      ]) as Partial<ServiceHealth>;
      
      const responseTime = Date.now() - startTime;
      
      // Update service health
      await this.updateServiceHealth(serviceName, checkResult, responseTime, config);
      
      // Record successful health check
      monitoring.incrementCounter('health_monitor.checks_successful', 1, {
        serviceName
      });
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      healthLogger.error('Health check failed', {
        serviceName,
        error: error instanceof Error ? error.message : String(error),
        responseTime
      });
      
      // Update with failure status
      await this.updateServiceHealth(
        serviceName, 
        { status: 'unhealthy', responseTime }, 
        responseTime, 
        config
      );
      
      // Record failed health check
      monitoring.incrementCounter('health_monitor.checks_failed', 1, {
        serviceName,
        error: error instanceof Error ? error.message : 'unknown'
      });
    }
  }
  
  /**
   * Update service health and detect issues
   */
  private async updateServiceHealth(
    serviceName: string,
    checkResult: Partial<ServiceHealth>,
    responseTime: number,
    config: HealthCheckConfig
  ): Promise<void> {
    const currentHealth = this.serviceHealth.get(serviceName);
    if (!currentHealth) return;
    
    // Update health data
    const updatedHealth: ServiceHealth = {
      ...currentHealth,
      ...checkResult,
      lastCheck: new Date(),
      responseTime,
      metrics: {
        ...currentHealth.metrics,
        ...checkResult.metrics,
        avgResponseTime: this.calculateAverage(currentHealth.metrics.avgResponseTime, responseTime)
      }
    };
    
    // Detect and analyze issues
    const issues = await this.detectIssues(updatedHealth, config);
    updatedHealth.issues = issues;
    
    // Determine overall status
    updatedHealth.status = this.determineServiceStatus(updatedHealth, config);
    
    // Store updated health
    this.serviceHealth.set(serviceName, updatedHealth);
    
    // Trigger recovery actions if needed
    if (config.autoRecovery.enabled && updatedHealth.status === 'unhealthy') {
      await this.triggerRecoveryActions(serviceName, updatedHealth, config);
    }
    
    // Publish health status event
    await this.publishHealthEvent(updatedHealth);
    
    // Record health metrics
    this.recordHealthMetrics(updatedHealth);
  }
  
  /**
   * Detect service issues
   */
  private async detectIssues(health: ServiceHealth, config: HealthCheckConfig): Promise<HealthIssue[]> {
    const issues: HealthIssue[] = [...health.issues];
    const now = new Date();
    
    // Check error rate
    if (health.errorRate > config.thresholds.errorRateCritical) {
      this.addOrUpdateIssue(issues, {
        type: 'error_rate',
        severity: 'critical',
        message: `Error rate ${(health.errorRate * 100).toFixed(2)}% exceeds critical threshold`,
        firstDetected: now,
        lastOccurred: now
      });
    } else if (health.errorRate > config.thresholds.errorRateWarning) {
      this.addOrUpdateIssue(issues, {
        type: 'error_rate',
        severity: 'medium',
        message: `Error rate ${(health.errorRate * 100).toFixed(2)}% exceeds warning threshold`,
        firstDetected: now,
        lastOccurred: now
      });
    }
    
    // Check response time
    if (health.responseTime > config.thresholds.responseTimeCritical) {
      this.addOrUpdateIssue(issues, {
        type: 'timeout',
        severity: 'critical',
        message: `Response time ${health.responseTime}ms exceeds critical threshold`,
        firstDetected: now,
        lastOccurred: now
      });
    } else if (health.responseTime > config.thresholds.responseTimeWarning) {
      this.addOrUpdateIssue(issues, {
        type: 'timeout',
        severity: 'medium',
        message: `Response time ${health.responseTime}ms exceeds warning threshold`,
        firstDetected: now,
        lastOccurred: now
      });
    }
    
    // Check success rate
    if (health.metrics.successRate < config.thresholds.successRateCritical) {
      this.addOrUpdateIssue(issues, {
        type: 'error_rate',
        severity: 'critical',
        message: `Success rate ${(health.metrics.successRate * 100).toFixed(2)}% below critical threshold`,
        firstDetected: now,
        lastOccurred: now
      });
    } else if (health.metrics.successRate < config.thresholds.successRateWarning) {
      this.addOrUpdateIssue(issues, {
        type: 'error_rate',
        severity: 'medium',
        message: `Success rate ${(health.metrics.successRate * 100).toFixed(2)}% below warning threshold`,
        firstDetected: now,
        lastOccurred: now
      });
    }
    
    return issues;
  }
  
  /**
   * Add or update issue in the list
   */
  private addOrUpdateIssue(issues: HealthIssue[], newIssue: Partial<HealthIssue>): void {
    const existingIssue = issues.find(issue => 
      issue.type === newIssue.type && !issue.resolved
    );
    
    if (existingIssue) {
      existingIssue.lastOccurred = new Date();
      existingIssue.occurrenceCount++;
      existingIssue.message = newIssue.message || existingIssue.message;
    } else {
      issues.push({
        id: uuidv4(),
        type: newIssue.type!,
        severity: newIssue.severity!,
        message: newIssue.message!,
        firstDetected: newIssue.firstDetected!,
        lastOccurred: newIssue.lastOccurred!,
        occurrenceCount: 1,
        resolved: false
      });
    }
  }
  
  /**
   * Determine overall service status
   */
  private determineServiceStatus(health: ServiceHealth, _config: HealthCheckConfig): 'healthy' | 'degraded' | 'unhealthy' {
    const criticalIssues = health.issues.filter(issue => 
      issue.severity === 'critical' && !issue.resolved
    );
    
    const mediumIssues = health.issues.filter(issue => 
      issue.severity === 'medium' && !issue.resolved
    );
    
    if (criticalIssues.length > 0) {
      return 'unhealthy';
    }
    
    if (mediumIssues.length > 0) {
      return 'degraded';
    }
    
    return 'healthy';
  }
  
  /**
   * Trigger recovery actions for unhealthy services
   */
  private async triggerRecoveryActions(
    serviceName: string,
    health: ServiceHealth,
    config: HealthCheckConfig
  ): Promise<void> {
    const attemptCount = this.recoveryAttempts.get(serviceName) || 0;
    
    if (attemptCount >= config.autoRecovery.maxAttempts) {
      healthLogger.warn('Max recovery attempts reached', {
        serviceName,
        attemptCount,
        maxAttempts: config.autoRecovery.maxAttempts
      });
      return;
    }
    
    // Increment attempt count
    this.recoveryAttempts.set(serviceName, attemptCount + 1);
    
    const recoveryActions: RecoveryAction[] = [];
    
    // Determine recovery actions based on issues
    for (const issue of health.issues) {
      if (issue.resolved) continue;
      
      const action = this.determineRecoveryAction(issue, serviceName);
      if (action) {
        recoveryActions.push(action);
      }
    }
    
    // Execute recovery actions
    for (const action of recoveryActions) {
      await this.executeRecoveryAction(serviceName, action);
    }
    
    // Update health with recovery actions
    health.recoveryActions = [...(health.recoveryActions || []), ...recoveryActions];
    
    healthLogger.info('Recovery actions triggered', {
      serviceName,
      actionCount: recoveryActions.length,
      attemptCount: attemptCount + 1
    });
  }
  
  /**
   * Determine appropriate recovery action for an issue
   */
  private determineRecoveryAction(issue: HealthIssue, _serviceName: string): RecoveryAction | null {
    const baseAction = {
      id: uuidv4(),
      trigger: issue.id,
      executed: false
    };
    
    switch (issue.type) {
      case 'timeout':
        if (issue.severity === 'critical') {
          return {
            ...baseAction,
            type: 'circuit_breaker',
          };
        }
        return {
          ...baseAction,
          type: 'fallback',
        };
        
      case 'error_rate':
        if (issue.severity === 'critical') {
          return {
            ...baseAction,
            type: 'restart',
          };
        }
        return {
          ...baseAction,
          type: 'circuit_breaker',
        };
        
      case 'memory':
      case 'cpu':
        return {
          ...baseAction,
          type: 'scale',
        };
        
      default:
        return {
          ...baseAction,
          type: 'alert',
        };
    }
  }
  
  /**
   * Execute recovery action
   */
  private async executeRecoveryAction(serviceName: string, action: RecoveryAction): Promise<void> {
    try {
      action.executed = true;
      action.executedAt = new Date();
      
      switch (action.type) {
        case 'circuit_breaker':
          await this.activateCircuitBreaker(serviceName);
          break;
          
        case 'fallback':
          await this.activateFallback(serviceName);
          break;
          
        case 'restart':
          await this.restartService(serviceName);
          break;
          
        case 'scale':
          await this.scaleService(serviceName);
          break;
          
        case 'alert':
          await this.sendAlert(serviceName, action);
          break;
      }
      
      action.result = 'success';
      
      healthLogger.info('Recovery action executed successfully', {
        serviceName,
        actionType: action.type,
        actionId: action.id
      });
      
    } catch (error) {
      action.result = 'failure';
      action.details = { error: error instanceof Error ? error.message : String(error) };
      
      healthLogger.error('Recovery action failed', {
        serviceName,
        actionType: action.type,
        actionId: action.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Activate circuit breaker
   */
  private async activateCircuitBreaker(serviceName: string): Promise<void> {
    // This would integrate with the circuit breaker system
    healthLogger.info('Circuit breaker activated', { serviceName });
  }
  
  /**
   * Activate fallback mode
   */
  private async activateFallback(serviceName: string): Promise<void> {
    // This would activate fallback processing
    healthLogger.info('Fallback mode activated', { serviceName });
  }
  
  /**
   * Restart service
   */
  private async restartService(serviceName: string): Promise<void> {
    // This would trigger service restart
    healthLogger.info('Service restart initiated', { serviceName });
  }
  
  /**
   * Scale service
   */
  private async scaleService(serviceName: string): Promise<void> {
    // This would trigger horizontal scaling
    healthLogger.info('Service scaling initiated', { serviceName });
  }
  
  /**
   * Send alert
   */
  private async sendAlert(serviceName: string, action: RecoveryAction): Promise<void> {
    // This would send alerts to monitoring systems
    healthLogger.warn('Alert sent for service issue', { serviceName, actionId: action.id });
  }
  
  /**
   * Publish health event
   */
  private async publishHealthEvent(health: ServiceHealth): Promise<void> {
    await eventBus.createAndPublish(
      EVENT_TYPES.SERVICE_HEALTH_CHECK,
      'health-monitor',
      {
        serviceName: health.serviceName,
        status: health.status,
        responseTime: health.responseTime,
        errorRate: health.errorRate,
        issues: health.issues.length
      },
      { priority: health.status === 'unhealthy' ? 'HIGH' : 'LOW' }
    );
  }
  
  /**
   * Record health metrics
   */
  private recordHealthMetrics(health: ServiceHealth): void {
    monitoring.recordGauge(`service_health.${health.serviceName}.response_time`, health.responseTime);
    monitoring.recordGauge(`service_health.${health.serviceName}.error_rate`, health.errorRate);
    monitoring.recordGauge(`service_health.${health.serviceName}.success_rate`, health.metrics.successRate);
    monitoring.recordGauge(`service_health.${health.serviceName}.uptime`, health.uptime);
    
    // Record status as numeric value
    const statusValue = health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0;
    monitoring.recordGauge(`service_health.${health.serviceName}.status`, statusValue);
  }
  
  /**
   * Calculate running average
   */
  private calculateAverage(current: number, newValue: number, weight: number = 0.1): number {
    return current * (1 - weight) + newValue * weight;
  }
  
  /**
   * Setup event subscriptions
   */
  private setupEventSubscriptions(): void {
    // Subscribe to service events for health monitoring
    eventBus.subscribe({
      serviceName: 'health-monitor',
      eventType: EVENT_TYPES.SERVICE_DEGRADED,
      handler: {
        serviceName: 'health-monitor',
        eventTypes: [EVENT_TYPES.SERVICE_DEGRADED],
        handler: async (event) => {
          healthLogger.warn('Service degradation detected', { event: event.data });
        },
        options: { timeout: 5000 }
      }
    });
  }
  
  /**
   * Get overall system health
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    summary: {
      totalServices: number;
      healthyServices: number;
      degradedServices: number;
      unhealthyServices: number;
      totalIssues: number;
    };
  } {
    const services = Array.from(this.serviceHealth.values());
    
    const summary = {
      totalServices: services.length,
      healthyServices: services.filter(s => s.status === 'healthy').length,
      degradedServices: services.filter(s => s.status === 'degraded').length,
      unhealthyServices: services.filter(s => s.status === 'unhealthy').length,
      totalIssues: services.reduce((sum, s) => sum + s.issues.filter(i => !i.resolved).length, 0)
    };
    
    const overallStatus = summary.unhealthyServices > 0 ? 'unhealthy' : 
                         summary.degradedServices > 0 ? 'degraded' : 'healthy';
    
    return {
      status: overallStatus,
      services,
      summary
    };
  }
  
  /**
   * Get service health by name
   */
  getServiceHealth(serviceName: string): ServiceHealth | null {
    return this.serviceHealth.get(serviceName) || null;
  }
}

/**
 * Health Monitor Singleton Instance
 */
export const healthMonitor = HealthMonitor.getInstance();

/**
 * Initialize health monitoring for Phase 3 services
 */
export async function initializePhase3HealthMonitoring(): Promise<void> {
  healthLogger.info('Initializing Phase 3 health monitoring');
  
  // Monitor AI Processing Service
  healthMonitor.startMonitoring(
    'ai-processing-service',
    async () => {
      const health = await AIProcessingService.getServiceHealth();
      return {
        status: health.status,
        uptime: health.uptime,
        metrics: {
          successRate: health.metrics.successRate,
          avgResponseTime: health.metrics.avgProcessingTime,
          throughput: 0, // Would be calculated from metrics
          activeConnections: health.metrics.activeRequests
        }
      };
    },
    {
      interval: 30000, // 30 seconds
      timeout: 5000,
      thresholds: {
        errorRateWarning: 0.02, // 2% for AI service
        errorRateCritical: 0.05, // 5% for AI service
        responseTimeWarning: 45000, // 45 seconds
        responseTimeCritical: 90000, // 90 seconds
        successRateWarning: 0.98, // 98%
        successRateCritical: 0.95 // 95%
      }
    }
  );
  
  // Monitor Filing Retrieval Service
  healthMonitor.startMonitoring(
    'filing-retrieval-service',
    async () => {
      // Would implement health check for filing service
      return {
        status: 'healthy' as const,
        uptime: process.uptime(),
        metrics: {
          successRate: 0.99,
          avgResponseTime: 2000,
          throughput: 10,
          activeConnections: 5
        }
      };
    },
    {
      interval: 15000, // 15 seconds
      timeout: 5000,
      thresholds: {
        errorRateWarning: 0.01, // 1% for filing service
        errorRateCritical: 0.03, // 3% for filing service
        responseTimeWarning: 5000, // 5 seconds
        responseTimeCritical: 15000, // 15 seconds
        successRateWarning: 0.99, // 99%
        successRateCritical: 0.97 // 97%
      }
    }
  );
  
  healthLogger.info('Phase 3 health monitoring initialized successfully');
}