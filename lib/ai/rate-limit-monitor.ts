/**
 * AI Rate Limiting Monitoring and Alerting
 * 
 * Monitors rate limit usage patterns, violations, and cost trends
 * Integrates with existing monitoring infrastructure for alerting
 */

import { prisma } from '../db/connection';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { alertService } from '../monitoring/alert-service';
import { RateLimitType, ViolationType } from '@prisma/client';

/**
 * Rate limit monitoring metrics
 */
export interface RateLimitMetrics {
  totalRequests: number;
  totalViolations: number;
  violationRate: number;
  topViolatingUsers: Array<{
    userId: string;
    violations: number;
    violationType: ViolationType;
  }>;
  usageByLimitType: Array<{
    limitType: RateLimitType;
    totalUsage: number;
    violations: number;
  }>;
  costMetrics: {
    totalCost: number;
    averageCostPerRequest: number;
    budgetUtilization: number;
  };
  timeWindowMetrics: {
    hourly: { requests: number; violations: number; cost: number };
    daily: { requests: number; violations: number; cost: number };
  };
}

/**
 * Rate limit usage patterns and anomalies
 */
export interface UsagePattern {
  type: 'normal' | 'suspicious' | 'burst' | 'abuse';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  affectedUsers?: string[];
  metrics: Record<string, number>;
}

/**
 * Rate limiting monitor
 */
export class RateLimitMonitor {
  private alertThresholds: {
    violationRate: number; // Percentage of requests that result in violations
    suspiciousPatterns: number; // Number of suspicious patterns before alert
    costIncrease: number; // Percentage cost increase threshold
    budgetUtilization: number; // Percentage of budget utilized before alert
  };

  constructor() {
    this.alertThresholds = {
      violationRate: parseFloat(process.env.AI_VIOLATION_RATE_THRESHOLD || '0.05'), // 5%
      suspiciousPatterns: parseInt(process.env.AI_SUSPICIOUS_PATTERNS_THRESHOLD || '3', 10),
      costIncrease: parseFloat(process.env.AI_COST_INCREASE_THRESHOLD || '0.5'), // 50%
      budgetUtilization: parseFloat(process.env.AI_BUDGET_UTILIZATION_THRESHOLD || '0.8') // 80%
    };
  }

  /**
   * Record a rate limit violation
   */
  async recordViolation(data: {
    userId?: string;
    limitType: RateLimitType;
    violationType: ViolationType;
    attemptedOperation: string;
    currentUsage: number;
    limit: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await prisma.rateLimitViolation.create({
        data: {
          userId: data.userId || null,
          limitType: data.limitType,
          violationType: data.violationType,
          attemptedOperation: data.attemptedOperation,
          currentUsage: data.currentUsage,
          limit: data.limit,
          metadata: data.metadata || {}
        }
      });

      // Record metrics
      monitoring.incrementCounter('ai.rate_limit.violations', 1, {
        user_id: data.userId || 'anonymous',
        limit_type: data.limitType,
        violation_type: data.violationType,
        operation: data.attemptedOperation
      });

      logger.info('Rate limit violation recorded', {
        userId: data.userId,
        limitType: data.limitType,
        violationType: data.violationType,
        operation: data.attemptedOperation,
        usage: `${data.currentUsage}/${data.limit}`
      });

      // Check for alerting conditions
      await this.checkViolationAlerts(data);

    } catch (error) {
      logger.error('Failed to record rate limit violation', {
        data,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get comprehensive rate limiting metrics
   */
  async getMetrics(timeWindow: 'hour' | 'day' | 'week' = 'day'): Promise<RateLimitMetrics> {
    try {
      const now = new Date();
      let startTime: Date;

      switch (timeWindow) {
        case 'hour':
          startTime = new Date(now.getTime() - (60 * 60 * 1000));
          break;
        case 'day':
          startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
          break;
        case 'week':
          startTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          break;
      }

      // Get violation data
      const [violations, costData, hourlyViolations, dailyViolations] = await Promise.all([
        prisma.rateLimitViolation.findMany({
          where: { timestamp: { gte: startTime } },
          include: { userId: true }
        }),
        prisma.aiCostTracking.aggregate({
          where: { timestamp: { gte: startTime } },
          _sum: { actualCost: true },
          _count: true
        }),
        prisma.rateLimitViolation.count({
          where: { timestamp: { gte: new Date(now.getTime() - (60 * 60 * 1000)) } }
        }),
        prisma.rateLimitViolation.count({
          where: { timestamp: { gte: new Date(now.getTime() - (24 * 60 * 60 * 1000)) } }
        })
      ]);

      // Calculate metrics
      const totalRequests = costData._count || 0;
      const totalViolations = violations.length;
      const violationRate = totalRequests > 0 ? (totalViolations / totalRequests) * 100 : 0;

      // Top violating users
      const userViolations = new Map<string, { violations: number; violationType: ViolationType }>();
      violations.forEach(v => {
        if (v.userId) {
          const existing = userViolations.get(v.userId) || { violations: 0, violationType: v.violationType };
          existing.violations++;
          userViolations.set(v.userId, existing);
        }
      });

      const topViolatingUsers = Array.from(userViolations.entries())
        .map(([userId, data]) => ({
          userId,
          violations: data.violations,
          violationType: data.violationType
        }))
        .sort((a, b) => b.violations - a.violations)
        .slice(0, 10);

      // Usage by limit type
      const limitTypeUsage = new Map<RateLimitType, { totalUsage: number; violations: number }>();
      violations.forEach(v => {
        const existing = limitTypeUsage.get(v.limitType) || { totalUsage: 0, violations: 0 };
        existing.violations++;
        existing.totalUsage += v.currentUsage;
        limitTypeUsage.set(v.limitType, existing);
      });

      const usageByLimitType = Array.from(limitTypeUsage.entries()).map(([limitType, data]) => ({
        limitType,
        totalUsage: data.totalUsage,
        violations: data.violations
      }));

      // Cost metrics
      const totalCost = costData._sum.actualCost || 0;
      const averageCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;
      
      // Get budget configuration for utilization calculation
      const dailyBudget = parseFloat(process.env.AI_DAILY_BUDGET || '100.0');
      const budgetUtilization = totalCost / dailyBudget;

      // Get hourly/daily cost data
      const hourlyCostData = await prisma.aiCostTracking.aggregate({
        where: { timestamp: { gte: new Date(now.getTime() - (60 * 60 * 1000)) } },
        _sum: { actualCost: true },
        _count: true
      });

      const dailyCostData = await prisma.aiCostTracking.aggregate({
        where: { timestamp: { gte: new Date(now.getTime() - (24 * 60 * 60 * 1000)) } },
        _sum: { actualCost: true },
        _count: true
      });

      return {
        totalRequests,
        totalViolations,
        violationRate,
        topViolatingUsers,
        usageByLimitType,
        costMetrics: {
          totalCost,
          averageCostPerRequest,
          budgetUtilization
        },
        timeWindowMetrics: {
          hourly: {
            requests: hourlyCostData._count || 0,
            violations: hourlyViolations,
            cost: hourlyCostData._sum.actualCost || 0
          },
          daily: {
            requests: dailyCostData._count || 0,
            violations: dailyViolations,
            cost: dailyCostData._sum.actualCost || 0
          }
        }
      };

    } catch (error) {
      logger.error('Failed to get rate limit metrics', {
        timeWindow,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return empty metrics on error
      return {
        totalRequests: 0,
        totalViolations: 0,
        violationRate: 0,
        topViolatingUsers: [],
        usageByLimitType: [],
        costMetrics: {
          totalCost: 0,
          averageCostPerRequest: 0,
          budgetUtilization: 0
        },
        timeWindowMetrics: {
          hourly: { requests: 0, violations: 0, cost: 0 },
          daily: { requests: 0, violations: 0, cost: 0 }
        }
      };
    }
  }

  /**
   * Analyze usage patterns and detect anomalies
   */
  async analyzeUsagePatterns(): Promise<UsagePattern[]> {
    try {
      const patterns: UsagePattern[] = [];
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
      const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      // Detect burst patterns (high volume in short time)
      const recentViolations = await prisma.rateLimitViolation.count({
        where: { timestamp: { gte: oneHourAgo } }
      });

      if (recentViolations > 50) { // Threshold for burst detection
        patterns.push({
          type: 'burst',
          description: `High violation rate detected: ${recentViolations} violations in the last hour`,
          severity: recentViolations > 100 ? 'critical' : 'high',
          recommendations: [
            'Review rate limiting thresholds',
            'Check for potential DDoS or abuse',
            'Consider implementing additional protection'
          ],
          metrics: { violationsPerHour: recentViolations }
        });
      }

      // Detect repeated violations from same users
      const repeatedViolators = await prisma.rateLimitViolation.groupBy({
        by: ['userId'],
        where: {
          timestamp: { gte: oneDayAgo },
          userId: { not: null }
        },
        _count: true,
        having: { userId: { _count: { gt: 10 } } }
      });

      if (repeatedViolators.length > 0) {
        const affectedUsers = repeatedViolators.map(rv => rv.userId!);
        patterns.push({
          type: 'suspicious',
          description: `${repeatedViolators.length} users with repeated violations (>10 in 24h)`,
          severity: repeatedViolators.length > 5 ? 'high' : 'medium',
          recommendations: [
            'Investigate user behavior patterns',
            'Consider temporary restrictions',
            'Review user onboarding and education'
          ],
          affectedUsers,
          metrics: { 
            suspiciousUsers: repeatedViolators.length,
            maxViolationsPerUser: Math.max(...repeatedViolators.map(rv => rv._count))
          }
        });
      }

      // Detect cost anomalies
      const recentCost = await prisma.aiCostTracking.aggregate({
        where: { timestamp: { gte: oneHourAgo } },
        _sum: { actualCost: true }
      });

      const previousHourCost = await prisma.aiCostTracking.aggregate({
        where: { 
          timestamp: { 
            gte: new Date(oneHourAgo.getTime() - (60 * 60 * 1000)),
            lt: oneHourAgo
          }
        },
        _sum: { actualCost: true }
      });

      const currentCost = recentCost._sum.actualCost || 0;
      const previousCost = previousHourCost._sum.actualCost || 0;

      if (previousCost > 0 && currentCost > previousCost * (1 + this.alertThresholds.costIncrease)) {
        const increasePercentage = ((currentCost - previousCost) / previousCost) * 100;
        patterns.push({
          type: 'suspicious',
          description: `Significant cost increase: ${increasePercentage.toFixed(1)}% in the last hour`,
          severity: increasePercentage > 100 ? 'critical' : 'high',
          recommendations: [
            'Investigate high-cost operations',
            'Review model usage patterns',
            'Check for inefficient AI operations'
          ],
          metrics: { 
            costIncrease: increasePercentage,
            currentHourlyCost: currentCost,
            previousHourlyCost: previousCost
          }
        });
      }

      return patterns;

    } catch (error) {
      logger.error('Failed to analyze usage patterns', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Check if violation should trigger alerts
   */
  private async checkViolationAlerts(violationData: {
    userId?: string;
    limitType: RateLimitType;
    violationType: ViolationType;
    attemptedOperation: string;
    currentUsage: number;
    limit: number;
  }): Promise<void> {
    try {
      // Check for critical violations (budget exceeded)
      if (violationData.violationType === ViolationType.BUDGET_EXCEEDED) {
        await alertService.createAlert({
          type: 'AI_BUDGET_EXCEEDED',
          level: 'critical',
          message: `AI budget exceeded for ${violationData.attemptedOperation}`,
          details: {
            userId: violationData.userId,
            limitType: violationData.limitType,
            usage: `${violationData.currentUsage}/${violationData.limit}`,
            operation: violationData.attemptedOperation
          },
          context: {
            violationType: violationData.violationType,
            limitType: violationData.limitType,
            operation: violationData.attemptedOperation
          }
        });
      }

      // Check for high violation rate
      const recentViolations = await prisma.rateLimitViolation.count({
        where: {
          timestamp: { gte: new Date(Date.now() - (60 * 60 * 1000)) } // Last hour
        }
      });

      const recentRequests = await prisma.aiCostTracking.count({
        where: {
          timestamp: { gte: new Date(Date.now() - (60 * 60 * 1000)) } // Last hour
        }
      });

      if (recentRequests > 0) {
        const violationRate = (recentViolations / recentRequests) * 100;
        
        if (violationRate > this.alertThresholds.violationRate * 100) {
          await alertService.createAlert({
            type: 'AI_HIGH_VIOLATION_RATE',
            level: violationRate > 20 ? 'critical' : 'warning',
            message: `High AI rate limit violation rate: ${violationRate.toFixed(1)}%`,
            details: {
              violationRate: `${violationRate.toFixed(1)}%`,
              recentViolations,
              recentRequests,
              threshold: `${(this.alertThresholds.violationRate * 100).toFixed(1)}%`
            },
            context: {
              timeWindow: '1 hour',
              violationCount: recentViolations,
              requestCount: recentRequests
            }
          });
        }
      }

    } catch (error) {
      logger.error('Failed to check violation alerts', {
        violationData,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Generate rate limiting health report
   */
  async generateHealthReport(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    metrics: RateLimitMetrics;
    patterns: UsagePattern[];
    recommendations: string[];
  }> {
    try {
      const [metrics, patterns] = await Promise.all([
        this.getMetrics('day'),
        this.analyzeUsagePatterns()
      ]);

      // Determine overall health status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      const recommendations: string[] = [];

      // Check violation rate
      if (metrics.violationRate > this.alertThresholds.violationRate * 100 * 2) {
        status = 'critical';
        recommendations.push('Immediate review of rate limiting configuration needed');
      } else if (metrics.violationRate > this.alertThresholds.violationRate * 100) {
        status = 'warning';
        recommendations.push('Review and adjust rate limiting thresholds');
      }

      // Check budget utilization
      if (metrics.costMetrics.budgetUtilization > 1.0) {
        status = 'critical';
        recommendations.push('Budget exceeded - implement emergency cost controls');
      } else if (metrics.costMetrics.budgetUtilization > this.alertThresholds.budgetUtilization) {
        status = status === 'critical' ? 'critical' : 'warning';
        recommendations.push('Budget utilization high - monitor costs closely');
      }

      // Check for critical patterns
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      if (criticalPatterns.length > 0) {
        status = 'critical';
        recommendations.push('Critical usage patterns detected - immediate investigation required');
      }

      // Add general recommendations based on patterns
      const suspiciousPatterns = patterns.filter(p => p.type === 'suspicious').length;
      if (suspiciousPatterns > this.alertThresholds.suspiciousPatterns) {
        recommendations.push('Multiple suspicious patterns detected - review security measures');
      }

      if (recommendations.length === 0 && status === 'healthy') {
        recommendations.push('Rate limiting system operating normally');
      }

      return {
        status,
        metrics,
        patterns,
        recommendations
      };

    } catch (error) {
      logger.error('Failed to generate rate limiting health report', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'critical',
        metrics: await this.getMetrics('day'), // Fallback to basic metrics
        patterns: [],
        recommendations: ['Failed to generate health report - system monitoring needed']
      };
    }
  }

  /**
   * Clean up old violation records (data retention)
   */
  async cleanupOldViolations(retentionDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
      
      const result = await prisma.rateLimitViolation.deleteMany({
        where: { timestamp: { lt: cutoffDate } }
      });

      logger.info('Cleaned up old rate limit violations', {
        deletedCount: result.count,
        retentionDays,
        cutoffDate
      });

      return result.count;

    } catch (error) {
      logger.error('Failed to cleanup old violations', {
        retentionDays,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }
}

/**
 * Global rate limit monitor instance
 */
export const rateLimitMonitor = new RateLimitMonitor();