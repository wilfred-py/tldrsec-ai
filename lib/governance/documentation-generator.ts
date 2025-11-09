/**
 * Documentation Generator
 * Part of Phase 3: Prevention & Governance Framework
 * 
 * Automatically generates governance documentation including
 * recovery procedures, issue patterns, and system health reports.
 */

import { IssuePattern, DetectedIssue } from './issue-detection-system';
import { RecoveryResult, RecoveryStrategy } from './recovery-strategies';
import fs from 'fs';
import path from 'path';

export interface DocumentationOptions {
  outputDir: string;
  includeTimestamp: boolean;
  generateMarkdown: boolean;
  generateJson: boolean;
  includeExamples: boolean;
}

export interface GovernanceDocumentation {
  timestamp: string;
  version: string;
  patterns: IssuePattern[];
  recoveryProcedures: RecoveryProcedureDoc[];
  systemHealth: SystemHealthDoc;
  examples: ExampleDoc[];
}

export interface RecoveryProcedureDoc {
  name: string;
  description: string;
  applicablePatterns: string[];
  steps: RecoveryStepDoc[];
  successCriteria: string[];
  rollbackProcedure: string[];
  estimatedDuration: string;
}

export interface RecoveryStepDoc {
  step: number;
  name: string;
  description: string;
  command?: string;
  expectedResult: string;
  troubleshooting: string[];
}

export interface SystemHealthDoc {
  overallStatus: 'healthy' | 'warning' | 'critical';
  lastCheck: string;
  activePatterns: number;
  recentRecoveries: number;
  successRate: number;
  recommendations: string[];
}

export interface ExampleDoc {
  title: string;
  description: string;
  scenario: string;
  detectedIssue: Partial<DetectedIssue>;
  recoveryActions: string[];
  outcome: string;
}

export class DocumentationGenerator {
  private options: DocumentationOptions;

  constructor(options: Partial<DocumentationOptions> = {}) {
    this.options = {
      outputDir: options.outputDir || './docs/governance',
      includeTimestamp: options.includeTimestamp ?? true,
      generateMarkdown: options.generateMarkdown ?? true,
      generateJson: options.generateJson ?? true,
      includeExamples: options.includeExamples ?? true
    };

    this.ensureOutputDirectory();
  }

  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }
  }

  async generateFullDocumentation(
    patterns: IssuePattern[],
    recoveryStrategies: RecoveryStrategy[],
    recentIssues: DetectedIssue[] = [],
    recentRecoveries: RecoveryResult[] = []
  ): Promise<GovernanceDocumentation> {
    
    const documentation: GovernanceDocumentation = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      patterns,
      recoveryProcedures: this.generateRecoveryProcedures(recoveryStrategies),
      systemHealth: this.generateSystemHealthDoc(recentIssues, recentRecoveries),
      examples: this.generateExamples()
    };

    // Generate output files
    if (this.options.generateJson) {
      await this.writeJsonDocumentation(documentation);
    }

    if (this.options.generateMarkdown) {
      await this.writeMarkdownDocumentation(documentation);
    }

    return documentation;
  }

  private generateRecoveryProcedures(_strategies: RecoveryStrategy[]): RecoveryProcedureDoc[] {
    return [
      {
        name: 'Authentication Recovery',
        description: 'Recovery procedure for authentication inconsistencies and HMAC validation issues',
        applicablePatterns: ['AUTHENTICATION'],
        steps: [
          {
            step: 1,
            name: 'Validate HMAC Configuration',
            description: 'Verify CRON_SECRET is properly configured with sufficient length',
            command: 'echo ${#CRON_SECRET}',
            expectedResult: 'Output should be >= 32 characters',
            troubleshooting: [
              'Check environment variable is set: env | grep CRON_SECRET',
              'Regenerate secret if too short: openssl rand -hex 32',
              'Restart services after updating secret'
            ]
          },
          {
            step: 2,
            name: 'Reset Authentication Timing',
            description: 'Clear timing measurements and validate timing-safe comparisons',
            expectedResult: 'Authentication timing variance < 10ms',
            troubleshooting: [
              'Check for timing attack vulnerabilities',
              'Verify constant-time comparison implementation',
              'Monitor authentication response times'
            ]
          },
          {
            step: 3,
            name: 'Run Security Tests',
            description: 'Execute complete security test suite to validate HMAC authentication',
            command: 'npm run test:security',
            expectedResult: '11/11 security tests passing',
            troubleshooting: [
              'Check test environment configuration',
              'Verify HMAC signature generation logic',
              'Review failed test output for specific issues'
            ]
          }
        ],
        successCriteria: [
          'All security tests pass (100% success rate)',
          'Authentication timing variance < 10ms',
          'No Bearer token fallback usage detected',
          'HMAC validation working correctly'
        ],
        rollbackProcedure: [
          'Restore previous CRON_SECRET if changed',
          'Rollback authentication middleware changes',
          'Verify rollback with security test suite'
        ],
        estimatedDuration: '5-10 minutes'
      },
      {
        name: 'Memory Leak Recovery',
        description: 'Recovery procedure for memory leak patterns and resource cleanup issues',
        applicablePatterns: ['MEMORY_LEAK'],
        steps: [
          {
            step: 1,
            name: 'Force Garbage Collection',
            description: 'Trigger immediate garbage collection to free memory',
            command: 'node --expose-gc -e "global.gc(); console.log(process.memoryUsage())"',
            expectedResult: 'Memory usage reduction visible',
            troubleshooting: [
              'Check if GC is available: typeof global.gc',
              'Monitor heap usage before/after GC',
              'Look for objects preventing GC'
            ]
          },
          {
            step: 2,
            name: 'Clean Intervals',
            description: 'Clear any uncleaned intervals using Phase 1 cleanup patterns',
            expectedResult: 'All intervals properly cleared',
            troubleshooting: [
              'Track interval IDs for proper cleanup',
              'Implement cleanup on process termination',
              'Audit setInterval usage patterns'
            ]
          },
          {
            step: 3,
            name: 'Clear Processing Contexts',
            description: 'Release accumulated processing contexts from document processing',
            expectedResult: 'Memory usage stabilizes under 500MB',
            troubleshooting: [
              'Implement bounded context management',
              'Use streaming for large document processing',
              'Monitor context accumulation patterns'
            ]
          }
        ],
        successCriteria: [
          'Memory usage < 500MB stable',
          'No uncleaned intervals detected',
          'Memory growth rate < 10MB/hour',
          'Garbage collection frequency normalized'
        ],
        rollbackProcedure: [
          'Restart affected services if memory critical',
          'Restore previous resource management patterns',
          'Monitor for memory stability'
        ],
        estimatedDuration: '3-5 minutes'
      },
      {
        name: 'Database Performance Recovery',
        description: 'Recovery procedure for database performance issues and query optimization',
        applicablePatterns: ['DATABASE_PERFORMANCE'],
        steps: [
          {
            step: 1,
            name: 'Optimize Connection Pool',
            description: 'Adjust database connection pool settings using Phase 1 optimizations',
            expectedResult: 'Connection pool utilization < 80%',
            troubleshooting: [
              'Monitor active connections',
              'Adjust pool size based on load',
              'Check for connection leaks'
            ]
          },
          {
            step: 2,
            name: 'Clear Query Cache',
            description: 'Clear stale query cache entries that may be causing performance issues',
            expectedResult: 'Query cache refreshed',
            troubleshooting: [
              'Monitor cache hit rates',
              'Identify stale cache entries',
              'Verify cache invalidation logic'
            ]
          },
          {
            step: 3,
            name: 'Detect N+1 Queries',
            description: 'Scan for N+1 query patterns using Phase 1 detection logic',
            expectedResult: 'No N+1 patterns detected',
            troubleshooting: [
              'Add include clauses for relationships',
              'Use eager loading where appropriate',
              'Implement query batching'
            ]
          }
        ],
        successCriteria: [
          'Database query p95 latency < 50ms',
          'No N+1 query patterns detected',
          'Connection pool exhaustion < 80%',
          'No connection timeouts'
        ],
        rollbackProcedure: [
          'Restore previous connection pool settings',
          'Rollback query optimizations if needed',
          'Monitor database performance'
        ],
        estimatedDuration: '10-15 minutes'
      }
    ];
  }

  private generateSystemHealthDoc(
    recentIssues: DetectedIssue[],
    recentRecoveries: RecoveryResult[]
  ): SystemHealthDoc {
    const activeIssues = recentIssues.filter(issue => 
      Date.now() - issue.timestamp.getTime() < 3600000 // Last hour
    );

    const successfulRecoveries = recentRecoveries.filter(r => r.success);
    const successRate = recentRecoveries.length > 0 
      ? (successfulRecoveries.length / recentRecoveries.length) * 100 
      : 100;

    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (activeIssues.some(issue => issue.pattern.severity === 'CRITICAL')) {
      overallStatus = 'critical';
    } else if (activeIssues.length > 0 || successRate < 80) {
      overallStatus = 'warning';
    }

    const recommendations: string[] = [];
    
    if (successRate < 80) {
      recommendations.push('Review failed recovery procedures and improve automation');
    }
    
    if (activeIssues.length > 3) {
      recommendations.push('Multiple issues detected - consider system health review');
    }
    
    const authIssues = activeIssues.filter(i => i.pattern.type === 'AUTHENTICATION');
    if (authIssues.length > 0) {
      recommendations.push('Authentication issues detected - verify HMAC configuration');
    }

    const memoryIssues = activeIssues.filter(i => i.pattern.type === 'MEMORY_LEAK');
    if (memoryIssues.length > 0) {
      recommendations.push('Memory leak patterns detected - review resource cleanup');
    }

    return {
      overallStatus,
      lastCheck: new Date().toISOString(),
      activePatterns: activeIssues.length,
      recentRecoveries: recentRecoveries.length,
      successRate,
      recommendations
    };
  }

  private generateExamples(): ExampleDoc[] {
    if (!this.options.includeExamples) {
      return [];
    }

    return [
      {
        title: 'Authentication Issue Recovery',
        description: 'Example of recovering from HMAC authentication inconsistency',
        scenario: 'Security tests failing due to timing variance in HMAC validation',
        detectedIssue: {
          pattern: {
            type: 'AUTHENTICATION',
            severity: 'CRITICAL',
            description: 'Authentication timing variance exceeded threshold',
            detectionRules: [],
            recoveryProcedure: 'authentication-recovery'
          },
          triggeredRule: {
            metric: 'auth_timing_variance',
            threshold: 10,
            operator: 'gt',
            unit: 'ms'
          },
          measuredValue: 15.2,
          timestamp: new Date(),
          context: {}
        },
        recoveryActions: [
          'Validated HMAC configuration (32-character secret confirmed)',
          'Reset authentication timing measurements',
          'Executed security test suite (11/11 tests passed)',
          'Disabled Bearer token fallback usage'
        ],
        outcome: 'Successfully recovered - authentication timing variance reduced to 3.1ms'
      },
      {
        title: 'Memory Leak Recovery',
        description: 'Example of recovering from memory leak pattern',
        scenario: 'Heap usage growing consistently over time, exceeding 500MB threshold',
        detectedIssue: {
          pattern: {
            type: 'MEMORY_LEAK',
            severity: 'HIGH',
            description: 'Memory leak pattern detected with consistent growth',
            detectionRules: [],
            recoveryProcedure: 'memory-cleanup-recovery'
          },
          triggeredRule: {
            metric: 'heap_usage_absolute',
            threshold: 500,
            operator: 'gt',
            unit: 'MB'
          },
          measuredValue: 612.3,
          timestamp: new Date(),
          context: {}
        },
        recoveryActions: [
          'Forced garbage collection (freed 89MB)',
          'Cleaned up uncleaned intervals (3 intervals cleared)',
          'Cleared accumulated processing contexts',
          'Memory usage stabilized at 423MB'
        ],
        outcome: 'Successfully recovered - memory usage reduced to acceptable levels'
      },
      {
        title: 'Database Performance Recovery',
        description: 'Example of recovering from database performance degradation',
        scenario: 'Database query latency spiking above 50ms threshold due to connection issues',
        detectedIssue: {
          pattern: {
            type: 'DATABASE_PERFORMANCE',
            severity: 'HIGH',
            description: 'Database query performance degradation detected',
            detectionRules: [],
            recoveryProcedure: 'database-optimization-recovery'
          },
          triggeredRule: {
            metric: 'db_query_p95_latency',
            threshold: 50,
            operator: 'gt',
            unit: 'ms'
          },
          measuredValue: 87.4,
          timestamp: new Date(),
          context: {}
        },
        recoveryActions: [
          'Optimized connection pool settings (increased to 30 connections)',
          'Cleared stale query cache entries',
          'Detected and fixed N+1 query pattern in user loading',
          'Validated connection health (12ms latency)'
        ],
        outcome: 'Successfully recovered - query latency reduced to 32ms average'
      }
    ];
  }

  private async writeJsonDocumentation(documentation: GovernanceDocumentation): Promise<void> {
    const timestamp = this.options.includeTimestamp 
      ? `-${new Date().toISOString().slice(0, 10)}` 
      : '';
    
    const filename = `governance-documentation${timestamp}.json`;
    const filepath = path.join(this.options.outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(documentation, null, 2));
    console.log(`✅ Generated JSON documentation: ${filepath}`);
  }

  private async writeMarkdownDocumentation(documentation: GovernanceDocumentation): Promise<void> {
    const timestamp = this.options.includeTimestamp 
      ? `-${new Date().toISOString().slice(0, 10)}` 
      : '';
    
    const filename = `governance-documentation${timestamp}.md`;
    const filepath = path.join(this.options.outputDir, filename);
    
    const markdown = this.generateMarkdown(documentation);
    fs.writeFileSync(filepath, markdown);
    console.log(`✅ Generated Markdown documentation: ${filepath}`);
  }

  private generateMarkdown(doc: GovernanceDocumentation): string {
    return `# Governance Documentation

*Generated: ${doc.timestamp}*  
*Version: ${doc.version}*

## System Health Status

**Overall Status:** ${doc.systemHealth.overallStatus.toUpperCase()}  
**Last Check:** ${doc.systemHealth.lastCheck}  
**Active Patterns:** ${doc.systemHealth.activePatterns}  
**Recent Recoveries:** ${doc.systemHealth.recentRecoveries}  
**Success Rate:** ${doc.systemHealth.successRate.toFixed(1)}%  

### Recommendations

${doc.systemHealth.recommendations.map(rec => `- ${rec}`).join('\n') || 'No recommendations at this time.'}

## Issue Patterns

The following ${doc.patterns.length} issue patterns are monitored by the governance system:

${doc.patterns.map(pattern => `
### ${pattern.type}

**Severity:** ${pattern.severity}  
**Description:** ${pattern.description}  

**Detection Rules:**
${pattern.detectionRules.map(rule => `- ${rule.metric}: ${rule.operator} ${rule.threshold} ${rule.unit || ''}`).join('\n')}

**Recovery Procedure:** ${pattern.recoveryProcedure || 'None defined'}
`).join('\n')}

## Recovery Procedures

${doc.recoveryProcedures.map(procedure => `
### ${procedure.name}

**Description:** ${procedure.description}  
**Estimated Duration:** ${procedure.estimatedDuration}  
**Applicable Patterns:** ${procedure.applicablePatterns.join(', ')}

#### Steps

${procedure.steps.map(step => `
**${step.step}. ${step.name}**

${step.description}

${step.command ? `\`\`\`bash\n${step.command}\n\`\`\`` : ''}

**Expected Result:** ${step.expectedResult}

**Troubleshooting:**
${step.troubleshooting.map(item => `- ${item}`).join('\n')}
`).join('\n')}

#### Success Criteria

${procedure.successCriteria.map(criterion => `- ${criterion}`).join('\n')}

#### Rollback Procedure

${procedure.rollbackProcedure.map(step => `- ${step}`).join('\n')}
`).join('\n')}

${doc.examples.length > 0 ? `## Recovery Examples

${doc.examples.map(example => `
### ${example.title}

**Description:** ${example.description}

**Scenario:** ${example.scenario}

**Recovery Actions:**
${example.recoveryActions.map(action => `- ${action}`).join('\n')}

**Outcome:** ${example.outcome}
`).join('\n')}` : ''}

---

*This documentation is automatically generated by the Phase 3 Prevention & Governance Framework.*  
*For technical issues, refer to the comprehensive implementation plan in \`.claude/tasks/phase-3-prevention-governance-implementation.md\`.*
`;
  }

  // Utility methods

  async generateRecoveryProcedureDoc(strategy: RecoveryStrategy): Promise<string> {
    // Generate specific documentation for a single recovery strategy
    const markdown = `# ${strategy.name} Recovery Procedure

**Description:** ${strategy.description}

## Overview

This document provides step-by-step instructions for executing the ${strategy.name} recovery strategy.

## Prerequisites

- System administrator access
- Access to monitoring dashboards
- Backup procedures in place

## Procedure

*Specific steps would be generated based on the strategy implementation*

## Validation

*Success criteria and validation steps*

## Troubleshooting

*Common issues and their resolutions*
`;

    return markdown;
  }

  async updateDocumentation(
    patterns: IssuePattern[],
    strategies: RecoveryStrategy[]
  ): Promise<void> {
    // Update existing documentation with new patterns/strategies
    await this.generateFullDocumentation(patterns, strategies);
  }
}