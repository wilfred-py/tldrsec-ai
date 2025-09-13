/**
 * Security Monitoring and Metrics Service
 * 
 * Provides comprehensive monitoring for dynamic security services
 * including Cloudflare IP validation, cache performance, and threat detection
 */

import { logger } from '../logging';
import { cloudflareIPService } from './cloudflare-ip-service';

const monitoringLogger = logger.child('security-monitoring');

export interface SecurityHealthMetrics {
  timestamp: string;
  cloudflare_ip_service: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    cache_hit_rate: number;
    api_success_rate: number;
    avg_validation_time_ms: number;
    p95_validation_time_ms: number;
    p99_validation_time_ms: number;
    last_update_age_hours: number;
    circuit_breaker_state: string;
    workers_requests_last_hour: number;
    geographic_distribution: Record<string, number>;
    metrics: any;
  };
  overall_status: 'healthy' | 'degraded' | 'unhealthy';
  threats_detected_last_hour: number;
  failed_validations_last_hour: number;
  performance_score: number;
  alert_level: 'none' | 'info' | 'warning' | 'critical';
}

export interface ThreatSummary {
  timestamp: string;
  period_hours: number;
  ip_validation_failures: number;
  suspicious_activity_count: number;
  rate_limit_violations: number;
  blocked_ips: string[];
  cloudflare_workers_anomalies: number;
  geographic_anomalies: string[];
  top_threats: Array<{
    type: string;
    count: number;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    first_seen: string;
    last_seen: string;
  }>;
}

export interface CloudflareWorkersMetrics {
  total_requests: number;
  successful_validations: number;
  failed_validations: number;
  avg_response_time_ms: number;
  geographic_distribution: Record<string, number>;
  anomalous_patterns: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    detected_at: string;
  }>;
}

export interface PerformanceMetrics {
  validation_times: number[];
  cache_latencies: number[];
  api_call_durations: number[];
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
}

/**
 * Enhanced Security monitoring service for comprehensive observability
 * with real-time alerting and Cloudflare Workers-specific monitoring
 */
export class SecurityMonitoring {
  private static instance: SecurityMonitoring;
  private threatCounts = {
    ip_failures: 0,
    suspicious_activity: 0,
    rate_limits: 0,
    blocked_ips: new Set<string>(),
    workers_anomalies: 0
  };
  private lastThreatReset = Date.now();
  
  // Performance tracking
  private performanceData: PerformanceMetrics = {
    validation_times: [],
    cache_latencies: [],
    api_call_durations: [],
    percentiles: { p50: 0, p95: 0, p99: 0 }
  };
  
  // Cloudflare Workers tracking
  private workersMetrics: CloudflareWorkersMetrics = {
    total_requests: 0,
    successful_validations: 0,
    failed_validations: 0,
    avg_response_time_ms: 0,
    geographic_distribution: {},
    anomalous_patterns: []
  };
  
  // Alert tracking
  private currentAlertLevel: 'none' | 'info' | 'warning' | 'critical' = 'none';
  private lastAlertTime = 0;
  private alertHistory: Array<{timestamp: number, level: string, message: string}> = [];
  
  private constructor() {
    monitoringLogger.info('Enhanced security monitoring service initialized', {
      features: ['performance_tracking', 'workers_monitoring', 'real_time_alerting']
    });
    
    // Reset threat counters every hour
    setInterval(() => {
      this.resetThreatCounters();
    }, 60 * 60 * 1000); // 1 hour
    
    // Performance metrics cleanup every 10 minutes
    setInterval(() => {
      this.cleanupPerformanceData();
    }, 10 * 60 * 1000); // 10 minutes
    
    // Alert level evaluation every 5 minutes
    setInterval(() => {
      this.evaluateAlertLevel();
    }, 5 * 60 * 1000); // 5 minutes
  }
  
  public static getInstance(): SecurityMonitoring {
    if (!SecurityMonitoring.instance) {
      SecurityMonitoring.instance = new SecurityMonitoring();
    }
    return SecurityMonitoring.instance;
  }
  
  /**
   * Get comprehensive security health metrics
   */
  public async getHealthMetrics(): Promise<SecurityHealthMetrics> {
    try {
      const cloudflareMetrics = cloudflareIPService.getMetrics();
      
      // Calculate cache hit rate
      const totalCacheRequests = cloudflareMetrics.cache_hits + cloudflareMetrics.cache_misses;
      const cacheHitRate = totalCacheRequests > 0 
        ? (cloudflareMetrics.cache_hits / totalCacheRequests) * 100 
        : 0;
      
      // Calculate API success rate
      const apiSuccessRate = cloudflareMetrics.api_calls_total > 0
        ? (cloudflareMetrics.api_calls_success / cloudflareMetrics.api_calls_total) * 100
        : 100; // No calls yet = 100% success
      
      // Calculate last update age
      const lastUpdateAge = cloudflareMetrics.last_update > 0
        ? (Date.now() - cloudflareMetrics.last_update) / (1000 * 60 * 60) // hours
        : 0;
      
      // Calculate performance percentiles
      this.calculatePerformancePercentiles();
      
      // Calculate performance score (0-100)
      const performanceScore = this.calculatePerformanceScore(
        apiSuccessRate, 
        cacheHitRate, 
        this.performanceData.percentiles.p95
      );
      
      // Determine Cloudflare service health
      let cfStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (apiSuccessRate < 50 || lastUpdateAge > 48) {
        cfStatus = 'unhealthy';
      } else if (apiSuccessRate < 80 || lastUpdateAge > 25 || cacheHitRate < 80) {
        cfStatus = 'degraded';
      }
      
      // Overall system health
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (cfStatus === 'unhealthy' || this.threatCounts.suspicious_activity > 10) {
        overallStatus = 'unhealthy';
      } else if (cfStatus === 'degraded' || this.threatCounts.ip_failures > 5) {
        overallStatus = 'degraded';
      }
      
      const healthMetrics: SecurityHealthMetrics = {
        timestamp: new Date().toISOString(),
        cloudflare_ip_service: {
          status: cfStatus,
          cache_hit_rate: Math.round(cacheHitRate * 100) / 100,
          api_success_rate: Math.round(apiSuccessRate * 100) / 100,
          avg_validation_time_ms: Math.round(this.performanceData.percentiles.p50 * 100) / 100,
          p95_validation_time_ms: Math.round(this.performanceData.percentiles.p95 * 100) / 100,
          p99_validation_time_ms: Math.round(this.performanceData.percentiles.p99 * 100) / 100,
          last_update_age_hours: Math.round(lastUpdateAge * 100) / 100,
          circuit_breaker_state: this.getCircuitBreakerState(),
          workers_requests_last_hour: this.workersMetrics.total_requests,
          geographic_distribution: { ...this.workersMetrics.geographic_distribution },
          metrics: cloudflareMetrics
        },
        overall_status: overallStatus,
        threats_detected_last_hour: this.threatCounts.suspicious_activity,
        failed_validations_last_hour: this.threatCounts.ip_failures,
        performance_score: Math.round(performanceScore * 100) / 100,
        alert_level: this.currentAlertLevel
      };
      
      monitoringLogger.debug('Health metrics calculated', {
        overall_status: overallStatus,
        cloudflare_status: cfStatus,
        cache_hit_rate: cacheHitRate,
        api_success_rate: apiSuccessRate
      });
      
      return healthMetrics;
      
    } catch (error) {
      monitoringLogger.error('Error calculating health metrics', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        timestamp: new Date().toISOString(),
        cloudflare_ip_service: {
          status: 'unhealthy',
          cache_hit_rate: 0,
          api_success_rate: 0,
          avg_validation_time_ms: 0,
          last_update_age_hours: 0,
          circuit_breaker_state: 'unknown',
          metrics: {}
        },
        overall_status: 'unhealthy',
        threats_detected_last_hour: 0,
        failed_validations_last_hour: 0
      };
    }
  }
  
  /**
   * Get comprehensive threat summary for monitoring dashboards
   */
  public getThreatSummary(): ThreatSummary {
    const hoursSinceReset = (Date.now() - this.lastThreatReset) / (1000 * 60 * 60);
    const now = new Date().toISOString();
    
    const topThreats = [
      {
        type: 'IP_VALIDATION_FAILURE',
        count: this.threatCounts.ip_failures,
        description: 'IPs blocked due to validation failures',
        severity: this.threatCounts.ip_failures > 10 ? 'high' : this.threatCounts.ip_failures > 5 ? 'medium' : 'low' as 'low' | 'medium' | 'high' | 'critical',
        first_seen: now,
        last_seen: now
      },
      {
        type: 'SUSPICIOUS_ACTIVITY',
        count: this.threatCounts.suspicious_activity,
        description: 'Requests flagged as suspicious',
        severity: this.threatCounts.suspicious_activity > 15 ? 'critical' : this.threatCounts.suspicious_activity > 10 ? 'high' : 'medium' as 'low' | 'medium' | 'high' | 'critical',
        first_seen: now,
        last_seen: now
      },
      {
        type: 'RATE_LIMIT_VIOLATION',
        count: this.threatCounts.rate_limits,
        description: 'Requests blocked by rate limiting',
        severity: this.threatCounts.rate_limits > 50 ? 'high' : this.threatCounts.rate_limits > 20 ? 'medium' : 'low' as 'low' | 'medium' | 'high' | 'critical',
        first_seen: now,
        last_seen: now
      },
      {
        type: 'CLOUDFLARE_WORKERS_ANOMALY',
        count: this.threatCounts.workers_anomalies,
        description: 'Anomalous Cloudflare Workers execution patterns',
        severity: this.threatCounts.workers_anomalies > 5 ? 'high' : this.threatCounts.workers_anomalies > 2 ? 'medium' : 'low' as 'low' | 'medium' | 'high' | 'critical',
        first_seen: now,
        last_seen: now
      }
    ].sort((a, b) => b.count - a.count);
    
    const geographicAnomalies = this.detectGeographicAnomalies();
    
    return {
      timestamp: now,
      period_hours: Math.round(hoursSinceReset * 100) / 100,
      ip_validation_failures: this.threatCounts.ip_failures,
      suspicious_activity_count: this.threatCounts.suspicious_activity,
      rate_limit_violations: this.threatCounts.rate_limits,
      blocked_ips: Array.from(this.threatCounts.blocked_ips),
      cloudflare_workers_anomalies: this.threatCounts.workers_anomalies,
      geographic_anomalies: geographicAnomalies,
      top_threats: topThreats.filter(threat => threat.count > 0)
    };
  }
  
  /**
   * Record security events for monitoring
   */
  public recordSecurityEvent(eventType: string, details: Record<string, any> = {}): void {
    try {
      switch (eventType) {
        case 'IP_VALIDATION_FAILURE':
        case 'UNAUTHORIZED_IP':
          this.threatCounts.ip_failures++;
          if (details.clientIP) {
            this.threatCounts.blocked_ips.add(details.clientIP);
          }
          break;
          
        case 'SUSPICIOUS_ACTIVITY':
          this.threatCounts.suspicious_activity++;
          if (details.clientIP) {
            this.threatCounts.blocked_ips.add(details.clientIP);
          }
          break;
          
        case 'RATE_LIMIT_EXCEEDED':
          this.threatCounts.rate_limits++;
          if (details.clientIP) {
            this.threatCounts.blocked_ips.add(details.clientIP);
          }
          break;
          
        case 'CLOUDFLARE_WORKERS_ANOMALY':
          this.threatCounts.workers_anomalies++;
          this.recordWorkersAnomaly(details);
          break;
          
        case 'PERFORMANCE_DEGRADATION':
          this.recordPerformanceEvent(details);
          break;
      }
      
      monitoringLogger.debug('Security event recorded', {
        event_type: eventType,
        current_counts: {
          ip_failures: this.threatCounts.ip_failures,
          suspicious_activity: this.threatCounts.suspicious_activity,
          rate_limits: this.threatCounts.rate_limits,
          unique_blocked_ips: this.threatCounts.blocked_ips.size
        },
        details
      });
      
    } catch (error) {
      monitoringLogger.error('Error recording security event', {
        event_type: eventType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Check if system is under attack (basic heuristics)
   */
  public isUnderAttack(): boolean {
    const timeWindow = 60 * 60 * 1000; // 1 hour
    const timeSinceReset = Date.now() - this.lastThreatReset;
    
    // Only check if we have recent data
    if (timeSinceReset < timeWindow) {
      return false;
    }
    
    // Attack thresholds (per hour)
    const attackThresholds = {
      ip_failures: 20,
      suspicious_activity: 15,
      rate_limits: 50,
      unique_blocked_ips: 10
    };
    
    const isAttack = (
      this.threatCounts.ip_failures > attackThresholds.ip_failures ||
      this.threatCounts.suspicious_activity > attackThresholds.suspicious_activity ||
      this.threatCounts.rate_limits > attackThresholds.rate_limits ||
      this.threatCounts.blocked_ips.size > attackThresholds.unique_blocked_ips
    );
    
    if (isAttack) {
      monitoringLogger.warn('Potential attack detected', {
        current_counts: {
          ip_failures: this.threatCounts.ip_failures,
          suspicious_activity: this.threatCounts.suspicious_activity,
          rate_limits: this.threatCounts.rate_limits,
          unique_blocked_ips: this.threatCounts.blocked_ips.size
        },
        thresholds: attackThresholds,
        time_window_hours: timeSinceReset / (1000 * 60 * 60)
      });
    }
    
    return isAttack;
  }
  
  /**
   * Force refresh of Cloudflare IP ranges (emergency override)
   */
  public async forceCloudflareRefresh(): Promise<boolean> {
    try {
      monitoringLogger.warn('Forcing Cloudflare IP cache refresh');
      cloudflareIPService.invalidateCache();
      
      // Attempt to get fresh ranges
      const ranges = await cloudflareIPService.getIPRanges();
      
      if (ranges.source === 'api') {
        monitoringLogger.info('Cloudflare IP refresh successful', {
          ipv4_count: ranges.ipv4_cidrs.length,
          ipv6_count: ranges.ipv6_cidrs.length
        });
        return true;
      }
      
      monitoringLogger.warn('Cloudflare IP refresh failed - using cached/fallback data');
      return false;
      
    } catch (error) {
      monitoringLogger.error('Error during forced Cloudflare refresh', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
  
  /**
   * Record performance timing for IP validation
   */
  public recordValidationTiming(durationMs: number, source?: string): void {
    this.performanceData.validation_times.push(durationMs);
    
    // Track Workers-specific metrics
    if (source === 'cloudflare-workers') {
      this.workersMetrics.total_requests++;
      this.updateWorkersResponseTime(durationMs);
    }
    
    // Keep only last 1000 entries for memory efficiency
    if (this.performanceData.validation_times.length > 1000) {
      this.performanceData.validation_times = this.performanceData.validation_times.slice(-500);
    }
    
    monitoringLogger.debug('Validation timing recorded', {
      duration_ms: durationMs,
      source,
      total_samples: this.performanceData.validation_times.length
    });
  }
  
  /**
   * Record cache operation timing
   */
  public recordCacheTiming(durationMs: number): void {
    this.performanceData.cache_latencies.push(durationMs);
    
    // Keep only last 500 entries
    if (this.performanceData.cache_latencies.length > 500) {
      this.performanceData.cache_latencies = this.performanceData.cache_latencies.slice(-250);
    }
  }
  
  /**
   * Record API call timing
   */
  public recordAPITiming(durationMs: number): void {
    this.performanceData.api_call_durations.push(durationMs);
    
    // Keep only last 100 entries
    if (this.performanceData.api_call_durations.length > 100) {
      this.performanceData.api_call_durations = this.performanceData.api_call_durations.slice(-50);
    }
  }
  
  /**
   * Record Cloudflare Workers request with geographic data
   */
  public recordWorkersRequest(
    success: boolean, 
    responseTime: number, 
    region?: string,
    details?: Record<string, any>
  ): void {
    this.workersMetrics.total_requests++;
    
    if (success) {
      this.workersMetrics.successful_validations++;
    } else {
      this.workersMetrics.failed_validations++;
    }
    
    // Update geographic distribution
    if (region) {
      this.workersMetrics.geographic_distribution[region] = 
        (this.workersMetrics.geographic_distribution[region] || 0) + 1;
    }
    
    // Detect anomalous patterns
    this.detectWorkersAnomalies(responseTime, region, details);
    
    monitoringLogger.debug('Workers request recorded', {
      success,
      response_time: responseTime,
      region,
      total_requests: this.workersMetrics.total_requests
    });
  }
  
  /**
   * Get Cloudflare Workers metrics
   */
  public getWorkersMetrics(): CloudflareWorkersMetrics {
    return {
      ...this.workersMetrics,
      anomalous_patterns: [...this.workersMetrics.anomalous_patterns]
    };
  }
  
  /**
   * Trigger real-time alert
   */
  public triggerAlert(
    level: 'info' | 'warning' | 'critical',
    message: string,
    details?: Record<string, any>
  ): void {
    const alert = {
      timestamp: Date.now(),
      level,
      message
    };
    
    this.alertHistory.push(alert);
    
    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-50);
    }
    
    // Rate limiting for alerts (max 1 per minute for same level)
    const lastSimilarAlert = this.alertHistory
      .slice(-10)
      .find(a => a.level === level && (Date.now() - a.timestamp) < 60000);
    
    if (lastSimilarAlert && level !== 'critical') {
      monitoringLogger.debug('Alert rate limited', { level, message });
      return;
    }
    
    this.currentAlertLevel = level;
    this.lastAlertTime = Date.now();
    
    monitoringLogger[level === 'critical' ? 'error' : level === 'warning' ? 'warn' : 'info'](
      'Security alert triggered', {
        alert_level: level,
        message,
        details,
        alert_count_last_hour: this.alertHistory.filter(
          a => (Date.now() - a.timestamp) < 3600000
        ).length
      }
    );
    
    // TODO: Integrate with webhook/notification system
    this.deliverAlert(alert, details);
  }
  
  /**
   * Calculate performance percentiles
   */
  private calculatePerformancePercentiles(): void {
    if (this.performanceData.validation_times.length === 0) {
      this.performanceData.percentiles = { p50: 0, p95: 0, p99: 0 };
      return;
    }
    
    const sorted = [...this.performanceData.validation_times].sort((a, b) => a - b);
    const length = sorted.length;
    
    this.performanceData.percentiles = {
      p50: this.getPercentile(sorted, 50),
      p95: this.getPercentile(sorted, 95),
      p99: this.getPercentile(sorted, 99)
    };
  }
  
  /**
   * Calculate percentile value
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))] || 0;
  }
  
  /**
   * Calculate overall performance score (0-100)
   */
  private calculatePerformanceScore(
    apiSuccessRate: number,
    cacheHitRate: number,
    p95ResponseTime: number
  ): number {
    // Weight factors
    const apiWeight = 0.4;
    const cacheWeight = 0.3;
    const performanceWeight = 0.3;
    
    // Normalize P95 response time (assume 100ms is perfect, 1000ms is poor)
    const normalizedPerformance = Math.max(0, Math.min(100, 100 - (p95ResponseTime - 100) / 9));
    
    return (
      apiSuccessRate * apiWeight +
      cacheHitRate * cacheWeight +
      normalizedPerformance * performanceWeight
    );
  }
  
  /**
   * Get circuit breaker state from Cloudflare service
   */
  private getCircuitBreakerState(): string {
    try {
      // In a real implementation, this would query the CloudflareIPService
      return 'closed'; // Placeholder
    } catch {
      return 'unknown';
    }
  }
  
  /**
   * Detect geographic anomalies in request patterns
   */
  private detectGeographicAnomalies(): string[] {
    const anomalies: string[] = [];
    const distribution = this.workersMetrics.geographic_distribution;
    const totalRequests = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    
    if (totalRequests === 0) return anomalies;
    
    // Detect regions with unusually high traffic (>80% of total)
    Object.entries(distribution).forEach(([region, count]) => {
      const percentage = (count / totalRequests) * 100;
      if (percentage > 80) {
        anomalies.push(`High concentration in ${region}: ${percentage.toFixed(1)}%`);
      }
    });
    
    return anomalies;
  }
  
  /**
   * Update Workers average response time
   */
  private updateWorkersResponseTime(newTime: number): void {
    const total = this.workersMetrics.total_requests;
    const currentAvg = this.workersMetrics.avg_response_time_ms;
    
    // Calculate new average using incremental formula
    this.workersMetrics.avg_response_time_ms = 
      total === 1 ? newTime : (currentAvg * (total - 1) + newTime) / total;
  }
  
  /**
   * Detect anomalous Workers patterns
   */
  private detectWorkersAnomalies(
    responseTime: number, 
    region?: string, 
    details?: Record<string, any>
  ): void {
    const anomalies: Array<{type: string, description: string, severity: 'low' | 'medium' | 'high', detected_at: string}> = [];
    
    // Detect slow responses
    if (responseTime > 5000) {
      anomalies.push({
        type: 'SLOW_RESPONSE',
        description: `Unusually slow response: ${responseTime}ms`,
        severity: responseTime > 10000 ? 'high' : 'medium',
        detected_at: new Date().toISOString()
      });
    }
    
    // Detect geographic clustering
    if (region && this.workersMetrics.geographic_distribution[region] > 100) {
      anomalies.push({
        type: 'GEOGRAPHIC_CLUSTERING',
        description: `High request volume from ${region}`,
        severity: 'medium',
        detected_at: new Date().toISOString()
      });
    }
    
    // Add anomalies to tracking
    this.workersMetrics.anomalous_patterns.push(...anomalies);
    
    // Trigger alerts for high severity anomalies
    anomalies.forEach(anomaly => {
      if (anomaly.severity === 'high') {
        this.triggerAlert('warning', `Workers anomaly detected: ${anomaly.description}`, {
          type: anomaly.type,
          region,
          response_time: responseTime
        });
      }
    });
  }
  
  /**
   * Record Workers anomaly from security event
   */
  private recordWorkersAnomaly(details: Record<string, any>): void {
    this.workersMetrics.anomalous_patterns.push({
      type: details.type || 'UNKNOWN',
      description: details.description || 'Unspecified Workers anomaly',
      severity: details.severity || 'medium',
      detected_at: new Date().toISOString()
    });
  }
  
  /**
   * Record performance degradation event
   */
  private recordPerformanceEvent(details: Record<string, any>): void {
    if (details.responseTime) {
      this.recordValidationTiming(details.responseTime, details.source);
    }
    
    // Trigger alert if performance is severely degraded
    if (details.responseTime > 10000) {
      this.triggerAlert('critical', 'Severe performance degradation detected', details);
    }
  }
  
  /**
   * Evaluate current alert level based on system state
   */
  private evaluateAlertLevel(): void {
    const metrics = this.getHealthMetrics();
    let newLevel: 'none' | 'info' | 'warning' | 'critical' = 'none';
    
    // Critical conditions
    if (metrics.then && metrics.then((m: SecurityHealthMetrics) => {
      if (m.cloudflare_ip_service.status === 'unhealthy' || 
          m.overall_status === 'unhealthy' ||
          m.performance_score < 30) {
        newLevel = 'critical';
      }
      // Warning conditions
      else if (m.cloudflare_ip_service.status === 'degraded' ||
               m.performance_score < 60 ||
               m.threats_detected_last_hour > 10) {
        newLevel = 'warning';
      }
      // Info conditions
      else if (m.threats_detected_last_hour > 0 ||
               m.failed_validations_last_hour > 0) {
        newLevel = 'info';
      }
      
      // Update alert level if changed
      if (newLevel !== this.currentAlertLevel) {
        this.currentAlertLevel = newLevel;
        
        if (newLevel !== 'none') {
          monitoringLogger.info('Alert level changed', {
            previous_level: this.currentAlertLevel,
            new_level: newLevel,
            reason: 'Automated evaluation'
          });
        }
      }
    }));
  }
  
  /**
   * Deliver alert via configured channels
   */
  private async deliverAlert(
    alert: {timestamp: number, level: string, message: string},
    details?: Record<string, any>
  ): Promise<void> {
    try {
      // TODO: Implement webhook delivery
      // TODO: Implement email notifications
      // TODO: Implement Slack/Discord integration
      
      monitoringLogger.info('Alert delivered', {
        alert,
        details,
        delivery_channels: ['log'] // Placeholder
      });
      
    } catch (error) {
      monitoringLogger.error('Failed to deliver alert', {
        alert,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Cleanup old performance data
   */
  private cleanupPerformanceData(): void {
    const maxAge = 60 * 60 * 1000; // 1 hour
    const cutoff = Date.now() - maxAge;
    
    // Clean up Workers anomalies
    this.workersMetrics.anomalous_patterns = this.workersMetrics.anomalous_patterns.filter(
      pattern => new Date(pattern.detected_at).getTime() > cutoff
    );
    
    // Clean up alert history
    this.alertHistory = this.alertHistory.filter(
      alert => alert.timestamp > cutoff
    );
    
    monitoringLogger.debug('Performance data cleanup completed', {
      anomalies_remaining: this.workersMetrics.anomalous_patterns.length,
      alerts_remaining: this.alertHistory.length
    });
  }
  
  /**
   * Reset threat counters (called hourly)
   */
  private resetThreatCounters(): void {
    const oldCounts = { ...this.threatCounts };
    
    this.threatCounts = {
      ip_failures: 0,
      suspicious_activity: 0,
      rate_limits: 0,
      blocked_ips: new Set<string>(),
      workers_anomalies: 0
    };
    
    // Reset Workers metrics
    this.workersMetrics = {
      total_requests: 0,
      successful_validations: 0,
      failed_validations: 0,
      avg_response_time_ms: 0,
      geographic_distribution: {},
      anomalous_patterns: []
    };
    
    this.lastThreatReset = Date.now();
    
    monitoringLogger.info('Threat counters and Workers metrics reset', {
      previous_period: {
        ip_failures: oldCounts.ip_failures,
        suspicious_activity: oldCounts.suspicious_activity,
        rate_limits: oldCounts.rate_limits,
        workers_anomalies: oldCounts.workers_anomalies,
        unique_blocked_ips: oldCounts.blocked_ips.size
      },
      reset_time: new Date().toISOString()
    });
  }
}

// Export singleton instance
export const securityMonitoring = SecurityMonitoring.getInstance();