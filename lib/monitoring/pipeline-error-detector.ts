/**
 * Pipeline Error Detection and Reporting System
 * 
 * Advanced error detection system that monitors the SEC filing pipeline for:
 * - Performance degradation patterns
 * - Cost anomalies and budget overruns
 * - Security vulnerabilities and attack patterns
 * - Data consistency issues
 * - System reliability problems
 * - User experience degradation
 * 
 * Features intelligent alerting, predictive analysis, and automated remediation suggestions.
 */

import { logger } from '../logging';
import { prisma } from '../db/index';
import { performance } from 'perf_hooks';

const errorLogger = logger.child('pipeline-error-detector');

export interface ErrorPattern {
  type: 'performance' | 'cost' | 'security' | 'data' | 'reliability' | 'user_experience';
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  description: string;
  threshold: number;
  detection: (metrics: any) => boolean;
  remediation: string[];
}

export interface ErrorAlert {
  id: string;
  timestamp: Date;
  type: ErrorPattern['type'];
  severity: ErrorPattern['severity'];
  title: string;
  description: string;
  metrics: Record<string, any>;
  remediation: string[];
  confidence: number; // 0-100
  firstDetected: Date;
  lastDetected: Date;
  occurrenceCount: number;
  impactedUsers?: string[];
  estimatedCost?: number;
  autoRemediation?: {
    possible: boolean;
    actions: string[];
    riskLevel: 'low' | 'medium' | 'high';
  };
}

export interface PipelineMetrics {
  performance: {
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    throughput: number;
    dbConnectionTime: number;
    aiProcessingTime: number;
    emailDeliveryTime: number;
  };
  cost: {
    totalSpent: number;
    avgCostPerFiling: number;
    budgetUtilization: number;
    costTrend: 'increasing' | 'decreasing' | 'stable';
    abnormalCosts: number;
  };
  security: {
    failedAuthAttempts: number;
    suspiciousIPs: string[];
    unauthorizedAccess: number;
    dataLeakageAttempts: number;
    injectionAttempts: number;
  };
  data: {
    consistencyErrors: number;
    duplicateFilings: number;
    corruptedContent: number;
    missingData: number;
    validationFailures: number;
  };
  reliability: {
    uptime: number;
    failureRate: number;
    recoverTime: number;
    deadlocks: number;
    timeouts: number;
  };
  userExperience: {
    avgProcessingDelay: number;
    emailDeliveryFailures: number;
    userComplaints: number;
    systemSatisfaction: number;
  };
}

export interface DetectionReport {
  timestamp: Date;
  overallHealthScore: number;
  activeAlerts: ErrorAlert[];
  resolvedAlerts: ErrorAlert[];
  trends: {
    performance: 'improving' | 'degrading' | 'stable';
    cost: 'optimizing' | 'increasing' | 'stable';
    security: 'strengthening' | 'weakening' | 'stable';
    reliability: 'improving' | 'degrading' | 'stable';
  };
  predictiveInsights: {
    riskAreas: string[];
    recommendations: string[];
    preventiveActions: string[];
  };
  metrics: PipelineMetrics;
}

class PipelineErrorDetector {
  private static instance: PipelineErrorDetector;
  private activeAlerts: Map<string, ErrorAlert> = new Map();
  private historicalMetrics: PipelineMetrics[] = [];
  private errorPatterns: ErrorPattern[] = [];

  private constructor() {
    this.initializeErrorPatterns();
  }

  public static getInstance(): PipelineErrorDetector {
    if (!PipelineErrorDetector.instance) {
      PipelineErrorDetector.instance = new PipelineErrorDetector();
    }
    return PipelineErrorDetector.instance;
  }

  private initializeErrorPatterns(): void {
    this.errorPatterns = [
      // Performance Patterns
      {
        type: 'performance',
        severity: 'high',
        pattern: 'response_time_degradation',
        description: 'Response times have increased significantly above baseline',
        threshold: 2.0, // 2x baseline
        detection: (metrics: PipelineMetrics) => 
          metrics.performance.avgResponseTime > this.getBaseline('avgResponseTime') * 2,
        remediation: [
          'Scale up database connections',
          'Optimize database queries',
          'Implement caching layer',
          'Review recent code deployments'
        ]
      },
      {
        type: 'performance',
        severity: 'critical',
        pattern: 'high_error_rate',
        description: 'Error rate has exceeded critical threshold',
        threshold: 5.0, // 5% error rate
        detection: (metrics: PipelineMetrics) => metrics.performance.errorRate > 5.0,
        remediation: [
          'Immediate rollback of recent deployments',
          'Check database connectivity',
          'Verify external API availability',
          'Scale infrastructure resources'
        ]
      },
      {
        type: 'performance',
        severity: 'medium',
        pattern: 'ai_processing_slowdown',
        description: 'AI processing times are above normal thresholds',
        threshold: 30000, // 30 seconds
        detection: (metrics: PipelineMetrics) => metrics.performance.aiProcessingTime > 30000,
        remediation: [
          'Check AI service status',
          'Optimize content preprocessing',
          'Consider model switching',
          'Implement request batching'
        ]
      },

      // Cost Patterns
      {
        type: 'cost',
        severity: 'high',
        pattern: 'budget_overrun_risk',
        description: 'Budget utilization is approaching dangerous levels',
        threshold: 85.0, // 85% budget utilization
        detection: (metrics: PipelineMetrics) => metrics.cost.budgetUtilization > 85.0,
        remediation: [
          'Implement cost controls',
          'Review user tier limits',
          'Optimize AI model usage',
          'Alert financial team'
        ]
      },
      {
        type: 'cost',
        severity: 'critical',
        pattern: 'cost_anomaly',
        description: 'Abnormal cost spikes detected in filing processing',
        threshold: 3.0, // 3x normal cost
        detection: (metrics: PipelineMetrics) => 
          metrics.cost.avgCostPerFiling > this.getBaseline('avgCostPerFiling') * 3,
        remediation: [
          'Immediate cost analysis',
          'Pause non-critical processing',
          'Review AI model selection',
          'Check for malicious usage'
        ]
      },

      // Security Patterns
      {
        type: 'security',
        severity: 'high',
        pattern: 'brute_force_attack',
        description: 'High volume of failed authentication attempts detected',
        threshold: 50, // 50 failed attempts
        detection: (metrics: PipelineMetrics) => metrics.security.failedAuthAttempts > 50,
        remediation: [
          'Implement IP blocking',
          'Increase rate limiting',
          'Alert security team',
          'Review authentication logs'
        ]
      },
      {
        type: 'security',
        severity: 'critical',
        pattern: 'injection_attempts',
        description: 'SQL injection or code injection attempts detected',
        threshold: 1, // Any injection attempt is critical
        detection: (metrics: PipelineMetrics) => metrics.security.injectionAttempts > 0,
        remediation: [
          'Immediate security review',
          'Block suspicious IPs',
          'Review input validation',
          'Escalate to security team'
        ]
      },

      // Data Patterns
      {
        type: 'data',
        severity: 'medium',
        pattern: 'consistency_errors',
        description: 'Data consistency errors detected in filing processing',
        threshold: 10, // 10 consistency errors
        detection: (metrics: PipelineMetrics) => metrics.data.consistencyErrors > 10,
        remediation: [
          'Run data integrity checks',
          'Review transaction isolation',
          'Check for race conditions',
          'Validate database constraints'
        ]
      },
      {
        type: 'data',
        severity: 'high',
        pattern: 'duplicate_processing',
        description: 'High number of duplicate filing processing detected',
        threshold: 25, // 25 duplicates
        detection: (metrics: PipelineMetrics) => metrics.data.duplicateFilings > 25,
        remediation: [
          'Check deduplication logic',
          'Review filing tracking',
          'Optimize caching strategy',
          'Fix race conditions'
        ]
      },

      // Reliability Patterns
      {
        type: 'reliability',
        severity: 'critical',
        pattern: 'system_downtime',
        description: 'System uptime has fallen below acceptable levels',
        threshold: 99.0, // 99% uptime
        detection: (metrics: PipelineMetrics) => metrics.reliability.uptime < 99.0,
        remediation: [
          'Immediate incident response',
          'Check infrastructure health',
          'Review monitoring alerts',
          'Implement failover procedures'
        ]
      },
      {
        type: 'reliability',
        severity: 'high',
        pattern: 'database_deadlocks',
        description: 'Frequent database deadlocks detected',
        threshold: 5, // 5 deadlocks
        detection: (metrics: PipelineMetrics) => metrics.reliability.deadlocks > 5,
        remediation: [
          'Optimize transaction ordering',
          'Review locking strategies',
          'Implement retry logic',
          'Consider connection pooling'
        ]
      },

      // User Experience Patterns
      {
        type: 'user_experience',
        severity: 'medium',
        pattern: 'email_delivery_failures',
        description: 'High rate of email delivery failures',
        threshold: 10.0, // 10% failure rate
        detection: (metrics: PipelineMetrics) => 
          (metrics.userExperience.emailDeliveryFailures / 100) > 10.0,
        remediation: [
          'Check email service status',
          'Review email templates',
          'Validate email addresses',
          'Implement retry logic'
        ]
      },
      {
        type: 'user_experience',
        severity: 'high',
        pattern: 'processing_delays',
        description: 'User-facing processing delays exceed acceptable limits',
        threshold: 300000, // 5 minutes
        detection: (metrics: PipelineMetrics) => 
          metrics.userExperience.avgProcessingDelay > 300000,
        remediation: [
          'Scale processing infrastructure',
          'Optimize filing queues',
          'Implement user notifications',
          'Review processing priorities'
        ]
      }
    ];
  }

  /**
   * Collect comprehensive metrics from the pipeline
   */
  public async collectMetrics(): Promise<PipelineMetrics> {
    try {
      errorLogger.debug('Collecting pipeline metrics');

      const [
        performanceMetrics,
        costMetrics,
        securityMetrics,
        dataMetrics,
        reliabilityMetrics,
        userExperienceMetrics
      ] = await Promise.all([
        this.collectPerformanceMetrics(),
        this.collectCostMetrics(),
        this.collectSecurityMetrics(),
        this.collectDataMetrics(),
        this.collectReliabilityMetrics(),
        this.collectUserExperienceMetrics()
      ]);

      const metrics: PipelineMetrics = {
        performance: performanceMetrics,
        cost: costMetrics,
        security: securityMetrics,
        data: dataMetrics,
        reliability: reliabilityMetrics,
        userExperience: userExperienceMetrics
      };

      // SECURITY FIX: Implement memory exhaustion protection with stricter limits
      this.historicalMetrics.push(metrics);
      // Reduced from 100 to 50 to prevent memory exhaustion attacks
      const MAX_HISTORICAL_METRICS = 50;
      if (this.historicalMetrics.length > MAX_HISTORICAL_METRICS) {
        // Remove oldest entries to maintain memory bounds
        this.historicalMetrics.splice(0, this.historicalMetrics.length - MAX_HISTORICAL_METRICS);
      }

      return metrics;

    } catch (error) {
      errorLogger.error('Failed to collect pipeline metrics', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Analyze metrics and detect error patterns
   */
  public async analyzeAndDetect(metrics: PipelineMetrics): Promise<ErrorAlert[]> {
    const detectedAlerts: ErrorAlert[] = [];

    try {
      errorLogger.debug('Analyzing metrics for error patterns');

      for (const pattern of this.errorPatterns) {
        try {
          if (pattern.detection(metrics)) {
            const alertId = `${pattern.type}_${pattern.pattern}_${Date.now()}`;
            
            // Check if this is a recurring alert
            const existingAlert = Array.from(this.activeAlerts.values()).find(
              alert => alert.type === pattern.type && 
                      alert.title.includes(pattern.pattern)
            );

            if (existingAlert) {
              // Update existing alert
              existingAlert.lastDetected = new Date();
              existingAlert.occurrenceCount++;
              existingAlert.confidence = Math.min(100, existingAlert.confidence + 10);
              detectedAlerts.push(existingAlert);
            } else {
              // Create new alert
              const alert: ErrorAlert = {
                id: alertId,
                timestamp: new Date(),
                type: pattern.type,
                severity: pattern.severity,
                title: `${pattern.type.toUpperCase()}: ${pattern.pattern}`,
                description: pattern.description,
                metrics: this.extractRelevantMetrics(metrics, pattern.type),
                remediation: pattern.remediation,
                confidence: 85, // Initial confidence
                firstDetected: new Date(),
                lastDetected: new Date(),
                occurrenceCount: 1,
                autoRemediation: this.generateAutoRemediation(pattern)
              };

              // Add impact analysis
              alert.impactedUsers = await this.analyzeImpactedUsers(pattern, metrics);
              alert.estimatedCost = this.estimateImpactCost(pattern, metrics);

              this.activeAlerts.set(alertId, alert);
              detectedAlerts.push(alert);

              errorLogger.warn(`New error pattern detected: ${pattern.pattern}`, {
                type: pattern.type,
                severity: pattern.severity,
                metrics: alert.metrics
              });
            }
          }
        } catch (patternError) {
          errorLogger.error(`Error evaluating pattern ${pattern.pattern}`, {
            error: patternError instanceof Error ? patternError.message : String(patternError)
          });
        }
      }

      // Analyze cross-pattern correlations
      this.analyzeCrossPatternCorrelations(detectedAlerts);

      return detectedAlerts;

    } catch (error) {
      errorLogger.error('Failed to analyze metrics for error patterns', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Generate comprehensive detection report
   */
  public async generateDetectionReport(): Promise<DetectionReport> {
    try {
      const metrics = await this.collectMetrics();
      const activeAlerts = await this.analyzeAndDetect(metrics);

      const report: DetectionReport = {
        timestamp: new Date(),
        overallHealthScore: this.calculateHealthScore(metrics, activeAlerts),
        activeAlerts,
        resolvedAlerts: this.getResolvedAlerts(),
        trends: this.analyzeTrends(),
        predictiveInsights: this.generatePredictiveInsights(metrics, activeAlerts),
        metrics
      };

      errorLogger.info('Generated detection report', {
        healthScore: report.overallHealthScore,
        activeAlerts: activeAlerts.length,
        resolvedAlerts: report.resolvedAlerts.length
      });

      return report;

    } catch (error) {
      errorLogger.error('Failed to generate detection report', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Mark alert as resolved
   */
  public resolveAlert(alertId: string, resolution: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.metrics.resolution = {
        resolvedAt: new Date(),
        resolution,
        resolvedBy: 'system'
      };
      this.activeAlerts.delete(alertId);
      errorLogger.info(`Alert resolved: ${alertId}`, { resolution });
      return true;
    }
    return false;
  }

  // Private helper methods

  private async collectPerformanceMetrics(): Promise<PipelineMetrics['performance']> {
    // In a real implementation, this would collect from monitoring systems
    // For now, we'll simulate with database queries and estimates
    
    try {
      const recentSummaries = await prisma.summary.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
          }
        },
        select: {
          createdAt: true,
          cost: true,
          inputTokens: true,
          outputTokens: true,
          processingStatus: true
        }
      });

      // Use actual processingTimeMs from summaries instead of simulated values
      const processingTimes = recentSummaries
        .map(s => (s as Record<string, unknown>).processingTimeMs as number)
        .filter((t): t is number => typeof t === 'number' && t > 0);

      const errorCount = recentSummaries.filter(
        s => (s as Record<string, unknown>).processingStatus === 'FAILED'
      ).length;

      return {
        avgResponseTime: processingTimes.length > 0
          ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
          : 0,
        p95ResponseTime: this.calculatePercentile(processingTimes, 95),
        p99ResponseTime: this.calculatePercentile(processingTimes, 99),
        errorRate: recentSummaries.length > 0 ? errorCount / recentSummaries.length : 0,
        throughput: recentSummaries.length,
        dbConnectionTime: 0,
        aiProcessingTime: processingTimes.length > 0
          ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
          : 0,
        emailDeliveryTime: 0
      };
    } catch (error) {
      errorLogger.error('Failed to collect performance metrics', { error });
      return {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 100, // Indicate failure
        throughput: 0,
        dbConnectionTime: 0,
        aiProcessingTime: 0,
        emailDeliveryTime: 0
      };
    }
  }

  private async collectCostMetrics(): Promise<PipelineMetrics['cost']> {
    try {
      const recentSummaries = await prisma.summary.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        select: {
          cost: true,
          createdAt: true
        }
      });

      const totalCost = recentSummaries.reduce((sum, s) => sum + (s.cost || 0), 0);
      const avgCost = recentSummaries.length > 0 ? totalCost / recentSummaries.length : 0;

      // Calculate budget utilization (would come from user budget tracking)
      const totalBudget = await this.getTotalUserBudgets();
      const budgetUtilization = totalBudget > 0 ? (totalCost / totalBudget) * 100 : 0;

      return {
        totalSpent: totalCost,
        avgCostPerFiling: avgCost,
        budgetUtilization,
        costTrend: this.analyzeCostTrend(recentSummaries),
        abnormalCosts: recentSummaries.filter(s => (s.cost || 0) > avgCost * 3).length
      };
    } catch (error) {
      errorLogger.error('Failed to collect cost metrics', { error });
      return {
        totalSpent: 0,
        avgCostPerFiling: 0,
        budgetUtilization: 0,
        costTrend: 'stable',
        abnormalCosts: 0
      };
    }
  }

  private async collectSecurityMetrics(): Promise<PipelineMetrics['security']> {
    try {
      // In a real implementation, this would query security logs
      const recentAuditLogs = await prisma.auditLog.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
          },
          success: false
        }
      });

      // SECURITY FIX: Remove sensitive information disclosure
      const failedAuthCount = recentAuditLogs.filter(log => 
        log.action.includes('AUTH') || log.action.includes('LOGIN')
      ).length;
      
      const suspiciousIPCount = new Set(recentAuditLogs.map(log => log.ipAddress).filter(Boolean)).size;
      
      const unauthorizedAccessCount = recentAuditLogs.filter(log => 
        log.action.includes('UNAUTHORIZED')
      ).length;
      
      const injectionAttemptCount = recentAuditLogs.filter(log => 
        log.details?.includes('injection') || log.details?.includes('DROP TABLE')
      ).length;

      return {
        failedAuthAttempts: failedAuthCount,
        // SECURITY FIX: Return count only, not actual IPs to prevent reconnaissance
        suspiciousIPCount: suspiciousIPCount,
        unauthorizedAccess: unauthorizedAccessCount,
        dataLeakageAttempts: 0, // Would be detected from access patterns
        injectionAttempts: injectionAttemptCount
      };
    } catch (error) {
      errorLogger.error('Failed to collect security metrics', { error });
      return {
        failedAuthAttempts: 0,
        suspiciousIPs: [],
        unauthorizedAccess: 0,
        dataLeakageAttempts: 0,
        injectionAttempts: 0
      };
    }
  }

  private async collectDataMetrics(): Promise<PipelineMetrics['data']> {
    try {
      const recentSummaries = await prisma.summary.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        },
        select: {
          processingStatus: true,
          secFiling: {
            select: {
              accessionNumber: true
            }
          }
        }
      });

      // Check for duplicates
      const accessionNumbers = recentSummaries
        .filter(s => s.secFiling?.accessionNumber)
        .map(s => s.secFiling!.accessionNumber);
      const duplicates = accessionNumbers.filter((item, index) => 
        accessionNumbers.indexOf(item) !== index
      );

      return {
        consistencyErrors: 0, // Would be calculated from validation logs
        duplicateFilings: duplicates.length,
        corruptedContent: recentSummaries.filter(s => 
          s.processingStatus === 'FAILED'
        ).length,
        missingData: 0, // Would be calculated from data completeness checks
        validationFailures: 0 // Would come from validation service
      };
    } catch (error) {
      errorLogger.error('Failed to collect data metrics', { error });
      return {
        consistencyErrors: 0,
        duplicateFilings: 0,
        corruptedContent: 0,
        missingData: 0,
        validationFailures: 0
      };
    }
  }

  private async collectReliabilityMetrics(): Promise<PipelineMetrics['reliability']> {
    try {
      // Simulate reliability metrics (would come from infrastructure monitoring)
      return {
        uptime: 99.9, // 99.9% uptime
        failureRate: 0.1, // 0.1% failure rate
        recoverTime: 30, // 30 seconds average recovery
        deadlocks: 0, // Would be detected from database logs
        timeouts: 0 // Would be detected from application logs
      };
    } catch (error) {
      errorLogger.error('Failed to collect reliability metrics', { error });
      return {
        uptime: 0,
        failureRate: 100,
        recoverTime: 0,
        deadlocks: 0,
        timeouts: 0
      };
    }
  }

  private async collectUserExperienceMetrics(): Promise<PipelineMetrics['userExperience']> {
    try {
      // Calculate user experience metrics
      const recentSummaries = await prisma.summary.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        },
        include: {
          emailDeliveries: true
        }
      });

      const totalEmails = recentSummaries.reduce((sum, s) => sum + s.emailDeliveries.length, 0);
      const failedEmails = recentSummaries.reduce((sum, s) => 
        sum + s.emailDeliveries.filter(e => !e.deliveredAt).length, 0
      );

      return {
        avgProcessingDelay: recentSummaries.length > 0
          ? recentSummaries.reduce((sum, s) => sum + (s.processingTimeMs || 0), 0) / recentSummaries.length
          : 0,
        emailDeliveryFailures: failedEmails,
        userComplaints: 0, // Would come from support tickets
        systemSatisfaction: 85 // Would come from user surveys
      };
    } catch (error) {
      errorLogger.error('Failed to collect user experience metrics', { error });
      return {
        avgProcessingDelay: 0,
        emailDeliveryFailures: 0,
        userComplaints: 0,
        systemSatisfaction: 0
      };
    }
  }

  private getBaseline(metric: string): number {
    // In a real implementation, this would calculate baseline from historical data
    const baselines: Record<string, number> = {
      avgResponseTime: 2000, // 2 seconds
      avgCostPerFiling: 0.05, // $0.05
      errorRate: 1.0, // 1%
      uptime: 99.5 // 99.5%
    };
    return baselines[metric] || 0;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private analyzeCostTrend(summaries: any[]): 'increasing' | 'decreasing' | 'stable' {
    if (summaries.length < 2) return 'stable';
    
    const recentCosts = summaries.slice(-10).map(s => s.cost || 0);
    const olderCosts = summaries.slice(-20, -10).map(s => s.cost || 0);
    
    const recentAvg = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length;
    const olderAvg = olderCosts.reduce((a, b) => a + b, 0) / olderCosts.length;
    
    if (recentAvg > olderAvg * 1.1) return 'increasing';
    if (recentAvg < olderAvg * 0.9) return 'decreasing';
    return 'stable';
  }

  /**
   * @deprecated Budget tracking removed. OpenRouter handles credit limits.
   * Returns a placeholder value for backwards compatibility.
   */
  private async getTotalUserBudgets(): Promise<number> {
    // Budget tracking has been removed - OpenRouter handles credit limits
    // Return a placeholder value for any code still calling this method
    return 1000;
  }

  private extractRelevantMetrics(metrics: PipelineMetrics, type: ErrorPattern['type']): Record<string, any> {
    switch (type) {
      case 'performance':
        return metrics.performance;
      case 'cost':
        return metrics.cost;
      case 'security':
        return metrics.security;
      case 'data':
        return metrics.data;
      case 'reliability':
        return metrics.reliability;
      case 'user_experience':
        return metrics.userExperience;
      default:
        return {};
    }
  }

  private generateAutoRemediation(pattern: ErrorPattern): ErrorAlert['autoRemediation'] {
    const lowRiskActions = ['restart service', 'clear cache', 'refresh configuration'];
    const mediumRiskActions = ['scale resources', 'switch failover', 'apply patch'];
    const highRiskActions = ['rollback deployment', 'emergency shutdown', 'data migration'];

    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    let actions: string[] = [];

    if (pattern.severity === 'low') {
      riskLevel = 'low';
      actions = lowRiskActions.slice(0, 2);
    } else if (pattern.severity === 'medium') {
      riskLevel = 'medium';
      actions = [...lowRiskActions.slice(0, 1), ...mediumRiskActions.slice(0, 1)];
    } else if (pattern.severity === 'high') {
      riskLevel = 'medium';
      actions = mediumRiskActions.slice(0, 2);
    } else {
      riskLevel = 'high';
      actions = [...mediumRiskActions.slice(0, 1), ...highRiskActions.slice(0, 1)];
    }

    return {
      possible: pattern.severity !== 'critical',
      actions,
      riskLevel
    };
  }

  private async analyzeImpactedUsers(pattern: ErrorPattern, metrics: PipelineMetrics): Promise<string[]> {
    // In a real implementation, this would analyze which users are affected
    // For now, return empty array
    return [];
  }

  private estimateImpactCost(pattern: ErrorPattern, metrics: PipelineMetrics): number {
    // Estimate the cost impact of the error
    switch (pattern.type) {
      case 'performance':
        return metrics.cost.avgCostPerFiling * 10; // 10 affected filings
      case 'cost':
        return metrics.cost.abnormalCosts * metrics.cost.avgCostPerFiling;
      case 'security':
        return 100; // Security incidents have high fixed costs
      case 'data':
        return metrics.cost.avgCostPerFiling * 5; // 5 affected filings
      case 'reliability':
        return metrics.cost.totalSpent * 0.1; // 10% of total cost
      case 'user_experience':
        return 50; // User satisfaction has moderate cost impact
      default:
        return 0;
    }
  }

  private analyzeCrossPatternCorrelations(alerts: ErrorAlert[]): void {
    // Analyze correlations between different error patterns
    // This could identify root causes that manifest as multiple symptoms
    
    const typeGroups = alerts.reduce((groups, alert) => {
      if (!groups[alert.type]) groups[alert.type] = [];
      groups[alert.type].push(alert);
      return groups;
    }, {} as Record<string, ErrorAlert[]>);

    // Look for correlated patterns
    if (typeGroups.performance && typeGroups.cost) {
      errorLogger.warn('Correlated performance and cost issues detected - possible infrastructure problem');
    }

    if (typeGroups.security && typeGroups.data) {
      errorLogger.error('Correlated security and data issues detected - possible security breach');
    }
  }

  private calculateHealthScore(metrics: PipelineMetrics, alerts: ErrorAlert[]): number {
    let score = 100;

    // Deduct points for active alerts
    for (const alert of alerts) {
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
    }

    // Deduct points for poor metrics
    if (metrics.performance.errorRate > 5) score -= 20;
    if (metrics.reliability.uptime < 99) score -= 15;
    if (metrics.cost.budgetUtilization > 90) score -= 10;

    return Math.max(0, score);
  }

  private getResolvedAlerts(): ErrorAlert[] {
    // In a real implementation, this would return recently resolved alerts
    return [];
  }

  private analyzeTrends(): DetectionReport['trends'] {
    // Analyze trends from historical metrics
    return {
      performance: 'stable',
      cost: 'stable',
      security: 'stable',
      reliability: 'stable'
    };
  }

  private generatePredictiveInsights(metrics: PipelineMetrics, alerts: ErrorAlert[]): DetectionReport['predictiveInsights'] {
    const riskAreas: string[] = [];
    const recommendations: string[] = [];
    const preventiveActions: string[] = [];

    // Analyze metrics for predictive insights
    if (metrics.cost.budgetUtilization > 70) {
      riskAreas.push('Budget exhaustion risk within 7 days');
      recommendations.push('Review and adjust user tier limits');
      preventiveActions.push('Implement automated budget alerts');
    }

    if (metrics.performance.avgResponseTime > 3000) {
      riskAreas.push('Performance degradation trend detected');
      recommendations.push('Scale infrastructure proactively');
      preventiveActions.push('Implement performance monitoring alerts');
    }

    if (alerts.filter(a => a.type === 'security').length > 0) {
      riskAreas.push('Security incident escalation risk');
      recommendations.push('Enhance security monitoring');
      preventiveActions.push('Conduct security audit');
    }

    return {
      riskAreas,
      recommendations,
      preventiveActions
    };
  }
}

// Export singleton instance
export const pipelineErrorDetector = PipelineErrorDetector.getInstance();

// Export utility functions for direct use
export async function detectPipelineErrors(): Promise<ErrorAlert[]> {
  const metrics = await pipelineErrorDetector.collectMetrics();
  return pipelineErrorDetector.analyzeAndDetect(metrics);
}

export async function generatePipelineHealthReport(): Promise<DetectionReport> {
  return pipelineErrorDetector.generateDetectionReport();
}

export function resolvePipelineAlert(alertId: string, resolution: string): boolean {
  return pipelineErrorDetector.resolveAlert(alertId, resolution);
}