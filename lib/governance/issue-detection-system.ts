/**
 * Issue Detection System
 * Part of Phase 3: Prevention & Governance Framework
 * 
 * Monitors for recurrence of the 5 critical issue patterns identified:
 * 1. Authentication inconsistencies
 * 2. Memory leaks  
 * 3. Database performance issues
 * 4. Testing coverage gaps
 * 5. Synchronous processing bottlenecks
 */

import { AlertService } from '../monitoring/alert-service';

export interface DetectionRule {
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  unit?: string;
}

export interface IssuePattern {
  type: 'AUTHENTICATION' | 'MEMORY_LEAK' | 'DATABASE_PERFORMANCE' | 'TESTING_GAP' | 'BOTTLENECK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  detectionRules: DetectionRule[];
  recoveryProcedure?: string;
}

export interface DetectedIssue {
  pattern: IssuePattern;
  triggeredRule: DetectionRule;
  measuredValue: number;
  timestamp: Date;
  context: Record<string, unknown>;
}

export class IssueDetectionSystem {
  private alertService: AlertService;
  private patterns: IssuePattern[];
  private detectionInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(alertService: AlertService) {
    this.alertService = alertService;
    this.patterns = this.initializePatterns();
  }

  private initializePatterns(): IssuePattern[] {
    return [
      {
        type: 'AUTHENTICATION',
        severity: 'CRITICAL',
        description: 'Authentication system inconsistencies detected',
        detectionRules: [
          { metric: 'security_test_failures', threshold: 0, operator: 'gt' },
          { metric: 'auth_timing_variance', threshold: 10, operator: 'gt', unit: 'ms' },
          { metric: 'hmac_validation_failures', threshold: 5, operator: 'gt' },
          { metric: 'bearer_token_fallback_usage', threshold: 0, operator: 'gt' }
        ],
        recoveryProcedure: 'authentication-recovery'
      },
      {
        type: 'MEMORY_LEAK',
        severity: 'HIGH',
        description: 'Memory leak patterns detected',
        detectionRules: [
          { metric: 'heap_usage_growth_rate', threshold: 10, operator: 'gt', unit: 'MB/hour' },
          { metric: 'uncleaned_intervals', threshold: 0, operator: 'gt' },
          { metric: 'heap_usage_absolute', threshold: 500, operator: 'gt', unit: 'MB' },
          { metric: 'gc_frequency', threshold: 20, operator: 'gt', unit: 'per_minute' }
        ],
        recoveryProcedure: 'memory-cleanup-recovery'
      },
      {
        type: 'DATABASE_PERFORMANCE',
        severity: 'HIGH',
        description: 'Database performance degradation detected',
        detectionRules: [
          { metric: 'db_query_p95_latency', threshold: 50, operator: 'gt', unit: 'ms' },
          { metric: 'connection_pool_exhaustion', threshold: 0.8, operator: 'gt', unit: 'ratio' },
          { metric: 'n_plus_one_queries_detected', threshold: 0, operator: 'gt' },
          { metric: 'db_connection_timeouts', threshold: 1, operator: 'gt', unit: 'per_hour' }
        ],
        recoveryProcedure: 'database-optimization-recovery'
      },
      {
        type: 'TESTING_GAP',
        severity: 'MEDIUM',
        description: 'Critical testing coverage gaps detected',
        detectionRules: [
          { metric: 'test_coverage_percentage', threshold: 85, operator: 'lt', unit: '%' },
          { metric: 'security_test_pass_rate', threshold: 100, operator: 'lt', unit: '%' },
          { metric: 'untested_critical_functions', threshold: 0, operator: 'gt' },
          { metric: 'e2e_test_failures', threshold: 0, operator: 'gt' }
        ],
        recoveryProcedure: 'testing-coverage-recovery'
      },
      {
        type: 'BOTTLENECK',
        severity: 'MEDIUM',
        description: 'Synchronous processing bottlenecks detected',
        detectionRules: [
          { metric: 'api_response_p95_time', threshold: 500, operator: 'gt', unit: 'ms' },
          { metric: 'sequential_processing_detected', threshold: 0, operator: 'gt' },
          { metric: 'worker_scaling_time', threshold: 2, operator: 'gt', unit: 'seconds' },
          { metric: 'filing_processing_time', threshold: 20, operator: 'gt', unit: 'seconds' }
        ],
        recoveryProcedure: 'bottleneck-resolution-recovery'
      }
    ];
  }

  async startMonitoring(intervalMs = 60000): Promise<void> {
    if (this.isRunning) {
      console.warn('Issue detection system is already running');
      return;
    }

    this.isRunning = true;
    console.log('🔍 Starting issue pattern detection system...');

    // Initial detection run
    await this.runDetectionCycle();

    // Set up periodic detection
    this.detectionInterval = setInterval(async () => {
      try {
        await this.runDetectionCycle();
      } catch (error) {
        console.error('Error in detection cycle:', error);
        await this.alertService.createAlert({
          type: 'SYSTEM_ERROR',
          severity: 'HIGH',
          title: 'Issue Detection System Error',
          description: `Detection cycle failed: ${error instanceof Error ? error.message : String(error)}`,
          metadata: {
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.stack : String(error)
          }
        });
      }
    }, intervalMs);

    console.log(`✅ Issue detection system started with ${intervalMs}ms interval`);
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = undefined;
    }

    console.log('✅ Issue detection system stopped');
  }

  private async runDetectionCycle(): Promise<void> {
    console.log('🔍 Running issue detection cycle...');

    const detectedIssues: DetectedIssue[] = [];

    for (const pattern of this.patterns) {
      try {
        const patternIssues = await this.detectPattern(pattern);
        detectedIssues.push(...patternIssues);
      } catch (error) {
        console.error(`Error detecting pattern ${pattern.type}:`, error);
      }
    }

    if (detectedIssues.length > 0) {
      console.log(`⚠️  Detected ${detectedIssues.length} issue(s)`);
      await this.handleDetectedIssues(detectedIssues);
    } else {
      console.log('✅ No issues detected in this cycle');
    }
  }

  private async detectPattern(pattern: IssuePattern): Promise<DetectedIssue[]> {
    const detectedIssues: DetectedIssue[] = [];

    for (const rule of pattern.detectionRules) {
      try {
        const measuredValue = await this.measureMetric(rule.metric);
        const isTriggered = this.evaluateRule(rule, measuredValue);

        if (isTriggered) {
          const issue: DetectedIssue = {
            pattern,
            triggeredRule: rule,
            measuredValue,
            timestamp: new Date(),
            context: {
              expectedValue: rule.threshold,
              unit: rule.unit,
              operator: rule.operator
            }
          };

          detectedIssues.push(issue);

          console.log(`🚨 Issue detected: ${pattern.type} - ${rule.metric}: ${measuredValue} ${rule.operator} ${rule.threshold}`);
        }
      } catch (error) {
        console.error(`Error measuring metric ${rule.metric}:`, error);
      }
    }

    return detectedIssues;
  }

  private async measureMetric(metricName: string): Promise<number> {
    switch (metricName) {
      // Authentication metrics
      case 'security_test_failures':
        return this.getSecurityTestFailures();
      case 'auth_timing_variance':
        return this.getAuthTimingVariance();
      case 'hmac_validation_failures':
        return this.getHmacValidationFailures();
      case 'bearer_token_fallback_usage':
        return this.getBearerTokenFallbackUsage();

      // Memory metrics
      case 'heap_usage_growth_rate':
        return this.getHeapUsageGrowthRate();
      case 'uncleaned_intervals':
        return this.getUncleanedIntervals();
      case 'heap_usage_absolute':
        return this.getHeapUsageAbsolute();
      case 'gc_frequency':
        return this.getGcFrequency();

      // Database metrics
      case 'db_query_p95_latency':
        return this.getDbQueryP95Latency();
      case 'connection_pool_exhaustion':
        return this.getConnectionPoolExhaustion();
      case 'n_plus_one_queries_detected':
        return this.getNPlusOneQueries();
      case 'db_connection_timeouts':
        return this.getDbConnectionTimeouts();

      // Testing metrics
      case 'test_coverage_percentage':
        return this.getTestCoveragePercentage();
      case 'security_test_pass_rate':
        return this.getSecurityTestPassRate();
      case 'untested_critical_functions':
        return this.getUntestedCriticalFunctions();
      case 'e2e_test_failures':
        return this.getE2eTestFailures();

      // Performance metrics
      case 'api_response_p95_time':
        return this.getApiResponseP95Time();
      case 'sequential_processing_detected':
        return this.getSequentialProcessingDetected();
      case 'worker_scaling_time':
        return this.getWorkerScalingTime();
      case 'filing_processing_time':
        return this.getFilingProcessingTime();

      default:
        console.warn(`Unknown metric: ${metricName}`);
        return 0;
    }
  }

  private evaluateRule(rule: DetectionRule, measuredValue: number): boolean {
    switch (rule.operator) {
      case 'gt':
        return measuredValue > rule.threshold;
      case 'gte':
        return measuredValue >= rule.threshold;
      case 'lt':
        return measuredValue < rule.threshold;
      case 'lte':
        return measuredValue <= rule.threshold;
      case 'eq':
        return measuredValue === rule.threshold;
      default:
        return false;
    }
  }

  private async handleDetectedIssues(issues: DetectedIssue[]): Promise<void> {
    // Group issues by pattern type
    const issuesByType = new Map<string, DetectedIssue[]>();
    
    for (const issue of issues) {
      const key = issue.pattern.type;
      if (!issuesByType.has(key)) {
        issuesByType.set(key, []);
      }
      issuesByType.get(key)!.push(issue);
    }

    // Create alerts for each issue type
    for (const [patternType, patternIssues] of issuesByType) {
      const primaryIssue = patternIssues[0];
      
      await this.alertService.createAlert({
        type: 'PATTERN_REGRESSION',
        severity: primaryIssue.pattern.severity,
        title: `${patternType} Pattern Detected`,
        description: primaryIssue.pattern.description,
        metadata: {
          patternType,
          issueCount: patternIssues.length,
          triggeredRules: patternIssues.map(issue => issue.triggeredRule.metric),
          measuredValues: patternIssues.map(issue => ({
            metric: issue.triggeredRule.metric,
            measured: issue.measuredValue,
            threshold: issue.triggeredRule.threshold,
            unit: issue.triggeredRule.unit
          })),
          recoveryProcedure: primaryIssue.pattern.recoveryProcedure,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  // Metric measurement methods (Phase 1/2 integration points)
  
  private async getSecurityTestFailures(): Promise<number> {
    // Integrate with test results from Phase 1 HMAC implementation
    return 0; // Placeholder - would read from test result files or test runner
  }

  private async getAuthTimingVariance(): Promise<number> {
    // Measure timing consistency in HMAC validation
    return 5; // Placeholder - would measure actual auth timing
  }

  private async getHmacValidationFailures(): Promise<number> {
    // Count HMAC validation failures in logs
    return 0; // Placeholder - would read from auth logs
  }

  private async getBearerTokenFallbackUsage(): Promise<number> {
    // Detect if Bearer token auth is being used (should be 0 after Phase 1)
    return 0; // Placeholder - would check auth middleware usage
  }

  private async getHeapUsageGrowthRate(): Promise<number> {
    // Monitor heap usage growth rate (Phase 1 memory leak detection)
    const usage = process.memoryUsage();
    return (usage.heapUsed / 1024 / 1024) / 10; // Simulated MB/hour
  }

  private async getUncleanedIntervals(): Promise<number> {
    // Count intervals that weren't properly cleaned up
    return 0; // Placeholder - would track interval cleanup from Phase 1
  }

  private async getHeapUsageAbsolute(): Promise<number> {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024; // MB
  }

  private async getGcFrequency(): Promise<number> {
    // Monitor garbage collection frequency
    return 15; // Placeholder - would track GC events
  }

  private async getDbQueryP95Latency(): Promise<number> {
    // Monitor database query performance (Phase 1 optimization)
    return 35; // Placeholder - would measure actual query times
  }

  private async getConnectionPoolExhaustion(): Promise<number> {
    // Monitor connection pool usage
    return 0.6; // Placeholder - would check actual pool metrics
  }

  private async getNPlusOneQueries(): Promise<number> {
    // Detect N+1 query patterns (Phase 1 fix validation)
    return 0; // Placeholder - would analyze query patterns
  }

  private async getDbConnectionTimeouts(): Promise<number> {
    // Count database connection timeouts
    return 0; // Placeholder - would read from database logs
  }

  private async getTestCoveragePercentage(): Promise<number> {
    // Get current test coverage (Phase 2 testing)
    return 87; // Placeholder - would read from coverage reports
  }

  private async getSecurityTestPassRate(): Promise<number> {
    // Security test pass rate (should be 100% after Phase 1)
    return 100; // Placeholder - would read from security test results
  }

  private async getUntestedCriticalFunctions(): Promise<number> {
    // Count critical functions without tests
    return 0; // Placeholder - would analyze test coverage by function
  }

  private async getE2eTestFailures(): Promise<number> {
    // Count E2E test failures
    return 0; // Placeholder - would read from E2E test results
  }

  private async getApiResponseP95Time(): Promise<number> {
    // Monitor API response times
    return 380; // Placeholder - would measure actual API performance
  }

  private async getSequentialProcessingDetected(): Promise<number> {
    // Detect if sequential processing is happening (should be 0 after Phase 2)
    return 0; // Placeholder - would analyze processing patterns
  }

  private async getWorkerScalingTime(): Promise<number> {
    // Monitor worker scaling performance (Phase 2 parallel processing)
    return 1.5; // Placeholder - would measure actual scaling time
  }

  private async getFilingProcessingTime(): Promise<number> {
    // Monitor filing processing performance
    return 18; // Placeholder - would measure actual processing times
  }

  // Public API for manual detection
  async detectAllPatterns(): Promise<DetectedIssue[]> {
    const allIssues: DetectedIssue[] = [];

    for (const pattern of this.patterns) {
      const issues = await this.detectPattern(pattern);
      allIssues.push(...issues);
    }

    return allIssues;
  }

  getPatterns(): IssuePattern[] {
    return [...this.patterns];
  }

  addPattern(pattern: IssuePattern): void {
    this.patterns.push(pattern);
  }

  removePattern(patternType: IssuePattern['type']): boolean {
    const initialLength = this.patterns.length;
    this.patterns = this.patterns.filter(p => p.type !== patternType);
    return this.patterns.length < initialLength;
  }
}