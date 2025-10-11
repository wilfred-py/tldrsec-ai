/**
 * Filing Prioritization Service for Timeout Prevention
 * 
 * Implements intelligent filing prioritization to ensure critical filings
 * are processed first when facing time constraints
 */

import { logger } from '../logging';
import type { SECFiling } from '../../services/filing/types';

export enum FilingPriority {
  CRITICAL = 1,  // Recent 10-K, 10-Q filings - always process
  HIGH = 2,      // Form 4, 8-K filings - process second
  NORMAL = 3,    // Other filings - process third
  BACKLOG = 4    // Historical unprocessed - skip if time constrained
}

export interface PrioritizedFiling {
  filing: SECFiling & { ticker?: { symbol: string; cik: string; companyName: string } };
  priority: FilingPriority;
  estimatedProcessingTime: number;
  reasoning: string;
}

export interface PrioritizationResult {
  critical: PrioritizedFiling[];
  high: PrioritizedFiling[];
  normal: PrioritizedFiling[];
  backlog: PrioritizedFiling[];
  total: number;
  estimatedTotalTime: number;
}

export class FilingPrioritizer {
  private baseProcessingTimes: Record<string, number>;

  constructor() {
    // Base processing times by form type (in milliseconds)
    this.baseProcessingTimes = {
      '10-K': 120000,    // 2 minutes - comprehensive annual reports
      '10-Q': 90000,     // 1.5 minutes - quarterly reports
      '8-K': 60000,      // 1 minute - current reports
      'FORM 4': 45000,   // 45 seconds - insider trading reports
      'DEF 14A': 75000,  // 1.25 minutes - proxy statements
      'S-1': 90000,      // 1.5 minutes - registration statements
      'DEFAULT': 60000   // 1 minute - other filings
    };
  }

  /**
   * Determine filing priority based on form type and recency
   */
  determinePriority(filing: SECFiling, isBacklog: boolean = false): FilingPriority {
    if (isBacklog) {
      return FilingPriority.BACKLOG;
    }

    const formType = filing.formType?.toUpperCase() || '';
    const filingDate = filing.filingDate ? new Date(filing.filingDate) : null;
    const daysSincePublished = filingDate 
      ? (Date.now() - filingDate.getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    // Critical filings - must process
    if (formType.includes('10-K') || formType.includes('10-Q')) {
      return FilingPriority.CRITICAL;
    }

    // High priority - important and time-sensitive
    if (formType.includes('8-K') || formType.includes('FORM 4')) {
      return FilingPriority.HIGH;
    }

    // Escalate to high priority if very recent (same day)
    if (daysSincePublished < 1) {
      return FilingPriority.HIGH;
    }

    // Normal priority for everything else
    return FilingPriority.NORMAL;
  }

  /**
   * Estimate processing time for a filing
   */
  estimateProcessingTime(filing: SECFiling): number {
    const formType = filing.formType?.toUpperCase() || '';
    
    // Find matching form type or use default
    for (const [type, time] of Object.entries(this.baseProcessingTimes)) {
      if (type !== 'DEFAULT' && formType.includes(type)) {
        return time;
      }
    }

    return this.baseProcessingTimes.DEFAULT;
  }

  /**
   * Prioritize a list of filings for optimal processing
   */
  prioritizeFilings(
    filings: (SECFiling & { ticker?: { symbol: string; cik: string; companyName: string } })[],
    isBacklogProcessing: boolean = false
  ): PrioritizationResult {
    const prioritized: PrioritizedFiling[] = filings.map(filing => {
      const priority = this.determinePriority(filing, isBacklogProcessing);
      const estimatedTime = this.estimateProcessingTime(filing);
      const reasoning = this.generateReasoning(filing, priority, isBacklogProcessing);

      return {
        filing,
        priority,
        estimatedProcessingTime: estimatedTime,
        reasoning
      };
    });

    // Sort by priority (lower number = higher priority), then by filing date (newer first)
    prioritized.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // Within same priority, prefer newer filings
      const dateA = a.filing.filingDate ? new Date(a.filing.filingDate).getTime() : 0;
      const dateB = b.filing.filingDate ? new Date(b.filing.filingDate).getTime() : 0;
      return dateB - dateA;
    });

    // Group by priority
    const result: PrioritizationResult = {
      critical: prioritized.filter(p => p.priority === FilingPriority.CRITICAL),
      high: prioritized.filter(p => p.priority === FilingPriority.HIGH),
      normal: prioritized.filter(p => p.priority === FilingPriority.NORMAL),
      backlog: prioritized.filter(p => p.priority === FilingPriority.BACKLOG),
      total: prioritized.length,
      estimatedTotalTime: prioritized.reduce((sum, p) => sum + p.estimatedProcessingTime, 0)
    };

    logger.info('Filing prioritization completed', {
      totalFilings: result.total,
      critical: result.critical.length,
      high: result.high.length,
      normal: result.normal.length,
      backlog: result.backlog.length,
      estimatedTotalTime: result.estimatedTotalTime,
      averageTimePerFiling: Math.round(result.estimatedTotalTime / Math.max(1, result.total))
    });

    return result;
  }

  /**
   * Get optimal processing order considering time constraints
   */
  getOptimalProcessingOrder(
    prioritizationResult: PrioritizationResult,
    availableTimeMs: number,
    safetyBufferMs: number = 30000
  ): {
    recommended: PrioritizedFiling[];
    skipped: PrioritizedFiling[];
    totalEstimatedTime: number;
    willCompleteInTime: boolean;
  } {
    const effectiveTime = availableTimeMs - safetyBufferMs;
    const allFilings = [
      ...prioritizationResult.critical,
      ...prioritizationResult.high,
      ...prioritizationResult.normal,
      ...prioritizationResult.backlog
    ];

    const recommended: PrioritizedFiling[] = [];
    const skipped: PrioritizedFiling[] = [];
    let cumulativeTime = 0;

    for (const filing of allFilings) {
      if (cumulativeTime + filing.estimatedProcessingTime <= effectiveTime) {
        recommended.push(filing);
        cumulativeTime += filing.estimatedProcessingTime;
      } else {
        skipped.push(filing);
      }
    }

    const willCompleteInTime = cumulativeTime <= effectiveTime;

    logger.info('Optimal processing order calculated', {
      availableTimeMs,
      effectiveTimeMs: effectiveTime,
      recommended: recommended.length,
      skipped: skipped.length,
      totalEstimatedTime: cumulativeTime,
      willCompleteInTime,
      utilizationRate: (cumulativeTime / effectiveTime * 100).toFixed(1) + '%'
    });

    return {
      recommended,
      skipped,
      totalEstimatedTime: cumulativeTime,
      willCompleteInTime
    };
  }

  /**
   * Generate batches for parallel processing with priority awareness
   */
  createProcessingBatches(
    filings: PrioritizedFiling[],
    maxBatchSize: number = 3,
    _maxConcurrentPriorities: number = 2
  ): PrioritizedFiling[][] {
    const batches: PrioritizedFiling[][] = [];
    
    // Group by priority first
    const priorityGroups = new Map<FilingPriority, PrioritizedFiling[]>();
    for (const filing of filings) {
      if (!priorityGroups.has(filing.priority)) {
        priorityGroups.set(filing.priority, []);
      }
      priorityGroups.get(filing.priority)!.push(filing);
    }

    // Process priorities in order
    const sortedPriorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);
    
    for (const priority of sortedPriorities) {
      const priorityFilings = priorityGroups.get(priority)!;
      
      // Create batches within this priority
      for (let i = 0; i < priorityFilings.length; i += maxBatchSize) {
        const batch = priorityFilings.slice(i, i + maxBatchSize);
        batches.push(batch);
      }
    }

    logger.debug('Processing batches created', {
      totalFilings: filings.length,
      totalBatches: batches.length,
      maxBatchSize,
      averageBatchSize: (filings.length / batches.length).toFixed(1)
    });

    return batches;
  }

  /**
   * Generate reasoning for prioritization decision
   */
  private generateReasoning(
    filing: SECFiling,
    priority: FilingPriority,
    isBacklog: boolean
  ): string {
    const formType = filing.formType?.toUpperCase() || 'UNKNOWN';
    const ticker = filing.ticker?.symbol || 'UNKNOWN';
    
    if (isBacklog) {
      return `Backlog filing: ${formType} for ${ticker} - process only if time permits`;
    }

    switch (priority) {
      case FilingPriority.CRITICAL:
        return `Critical filing: ${formType} for ${ticker} - comprehensive financial report requiring immediate processing`;
      
      case FilingPriority.HIGH:
        return `High priority: ${formType} for ${ticker} - time-sensitive filing with investor impact`;
      
      case FilingPriority.NORMAL:
        return `Normal priority: ${formType} for ${ticker} - standard filing for routine processing`;
      
      default:
        return `Standard filing: ${formType} for ${ticker}`;
    }
  }

  /**
   * Analyze filing complexity to adjust processing time estimates
   */
  analyzeComplexity(filing: SECFiling): {
    complexityScore: number;
    adjustedProcessingTime: number;
    factors: string[];
  } {
    let complexityScore = 1.0;
    const factors: string[] = [];
    const baseTime = this.estimateProcessingTime(filing);

    // Check for complexity indicators
    const formType = filing.formType?.toUpperCase() || '';
    
    // Large comprehensive filings are more complex
    if (formType.includes('10-K')) {
      complexityScore *= 1.5;
      factors.push('Comprehensive annual report');
    }

    // Amended filings often more complex
    if (formType.includes('/A')) {
      complexityScore *= 1.3;
      factors.push('Amended filing');
    }

    // S-1 registrations are complex
    if (formType.includes('S-1')) {
      complexityScore *= 1.4;
      factors.push('Registration statement');
    }

    // DEF 14A proxy statements are detailed
    if (formType.includes('DEF 14A')) {
      complexityScore *= 1.2;
      factors.push('Proxy statement');
    }

    const adjustedProcessingTime = Math.round(baseTime * complexityScore);

    return {
      complexityScore,
      adjustedProcessingTime,
      factors
    };
  }
}

// Export singleton instance
export const filingPrioritizer = new FilingPrioritizer();