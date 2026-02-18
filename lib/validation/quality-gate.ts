/**
 * Quality Gate for SEC Filing Email Summaries
 *
 * Blocks low-quality summaries from being emailed to users.
 * Evaluates validation scores against thresholds and detects
 * empty/sparse sections in structured summary data.
 */

import type { SummaryValidationResult } from './summary-content-validator';

// --- Threshold Configuration ---

const THRESHOLDS = {
  accuracy: 60,
  completeness: 50,
  relevance: 55,
  confidence: 55,
} as const;

// --- Types ---

export type QualityGateAction = 'deliver' | 'retry' | 'drop';

export interface QualityGateResult {
  shouldBlock: boolean;
  action: QualityGateAction;
  reasons: string[];
}

export interface QualityGateOptions {
  isRetry?: boolean;
}

type ValidationInput = Pick<
  SummaryValidationResult,
  'accuracyScore' | 'completenessScore' | 'relevanceScore' | 'confidenceScore' | 'isValid' | 'issues'
>;

// --- Discriminated union types for detectEmptySections (Review Decision #8) ---

interface TenKSections {
  summary: string;
  financialHighlights: unknown[];
  keyPoints: unknown[];
  segments?: unknown[];
  riskFactors?: unknown[];
}

interface TenQSections {
  summary: string;
  financialHighlights: unknown[];
  quarterlyTrends?: unknown[];
}

interface EightKSections {
  summary: string;
  keyHighlights: unknown[];
  eventType: string;
  itemNumbers?: string[];
}

interface Form4Sections {
  summary: string;
  filerName: string;
  transactions: unknown[];
}

// --- Quality Gate ---

export class QualityGate {
  /**
   * Evaluate validation scores against quality thresholds.
   * Returns whether the summary should be blocked from email delivery
   * and what action to take (deliver, retry, or drop).
   */
  static evaluate(
    validationResult: ValidationInput | null | undefined,
    options?: QualityGateOptions
  ): QualityGateResult {
    // If validation was skipped (cached summary), allow delivery
    if (validationResult == null) {
      return { shouldBlock: false, action: 'deliver', reasons: [] };
    }

    const reasons: string[] = [];

    if (validationResult.accuracyScore < THRESHOLDS.accuracy) {
      reasons.push(`Accuracy ${validationResult.accuracyScore} < ${THRESHOLDS.accuracy}`);
    }
    if (validationResult.completenessScore < THRESHOLDS.completeness) {
      reasons.push(`Completeness ${validationResult.completenessScore} < ${THRESHOLDS.completeness}`);
    }
    if (validationResult.relevanceScore < THRESHOLDS.relevance) {
      reasons.push(`Relevance ${validationResult.relevanceScore} < ${THRESHOLDS.relevance}`);
    }
    if (validationResult.confidenceScore < THRESHOLDS.confidence) {
      reasons.push(`Confidence ${validationResult.confidenceScore} < ${THRESHOLDS.confidence}`);
    }

    if (reasons.length === 0) {
      return { shouldBlock: false, action: 'deliver', reasons: [] };
    }

    // If this is already a retry attempt, drop instead of retrying again
    const action: QualityGateAction = options?.isRetry ? 'drop' : 'retry';

    return { shouldBlock: true, action, reasons };
  }

  /**
   * Detect empty or sparse required sections in structured summary data.
   * Returns an array of missing-section codes for the given form type.
   */
  static detectEmptySections(
    formType: string,
    sections: Record<string, unknown>
  ): string[] {
    const normalized = formType.replace(/\/A$/, '').toUpperCase();
    const issues: string[] = [];

    switch (normalized) {
      case '10-K': {
        const s = sections as TenKSections;
        if (!s.financialHighlights || s.financialHighlights.length === 0) {
          issues.push('MISSING_FINANCIAL_HIGHLIGHTS');
        }
        if (!s.keyPoints || (s.keyPoints as unknown[]).length === 0) {
          issues.push('MISSING_KEY_POINTS');
        }
        break;
      }
      case '10-Q': {
        const s = sections as TenQSections;
        if (!s.financialHighlights || s.financialHighlights.length === 0) {
          issues.push('MISSING_FINANCIAL_HIGHLIGHTS');
        }
        break;
      }
      case '8-K': {
        const s = sections as EightKSections;
        if (!s.keyHighlights || s.keyHighlights.length === 0) {
          issues.push('MISSING_KEY_HIGHLIGHTS');
        }
        if (!s.eventType) {
          issues.push('MISSING_EVENT_TYPE');
        }
        break;
      }
      case 'FORM 4':
      case '4': {
        const s = sections as Form4Sections;
        if (!s.transactions || s.transactions.length === 0) {
          issues.push('MISSING_TRANSACTIONS');
        }
        if (!s.filerName) {
          issues.push('MISSING_FILER_NAME');
        }
        break;
      }
      default:
        // Unknown form type - no section requirements
        break;
    }

    return issues;
  }
}
