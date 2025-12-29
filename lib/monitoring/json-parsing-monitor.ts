/**
 * JSON Parsing Monitor
 *
 * Tracks parsing metrics for the simplified JSON parsing pipeline.
 * Part of Phase 5: Production Validation & Monitoring.
 *
 * Metrics tracked:
 * - ai.parsing.direct_success - First-attempt parse success
 * - ai.parsing.codeblock_stripped - Successful after markdown removal
 * - ai.parsing.bracket_repaired - Successful after bracket repair
 * - ai.parsing.validation_failure - Schema validation failures
 * - ai.parsing.json_error - JSON parse errors
 * - ai.parsing.total - Total parsing attempts
 *
 * The feedback loop logs failing responses with their prompts and form types
 * to enable systematic prompt improvement.
 *
 * @module json-parsing-monitor
 */

import { logger } from '../logging';
import { monitoring } from './index';
import type { ParseResult, ParseDiagnostics } from '../ai/parsers/simple-parser';

const parsingLogger = logger.child('json-parsing-monitor');

/**
 * Parsing failure record for prompt improvement feedback
 */
export interface ParsingFailureRecord {
  timestamp: Date;
  formType: string;
  method: ParseResult['method'];
  error?: string;
  validationErrors?: string[];
  diagnostics: ParseDiagnostics;
  responsePreview: string;
  promptSummary?: string;
}

/**
 * Aggregated parsing metrics
 */
export interface ParsingMetrics {
  total: number;
  directSuccess: number;
  codeblockStripped: number;
  bracketRepaired: number;
  validationFailures: number;
  jsonErrors: number;
  successRate: number;
  avgParseTimeMs: number;
  recentFailures: ParsingFailureRecord[];
}

/**
 * JSON Parsing Monitor
 *
 * Singleton service that tracks all JSON parsing attempts and
 * provides feedback for prompt improvement.
 */
class JSONParsingMonitor {
  private static instance: JSONParsingMonitor;

  private totalAttempts = 0;
  private directSuccesses = 0;
  private codeblockStripped = 0;
  private bracketRepaired = 0;
  private validationFailures = 0;
  private jsonErrors = 0;
  private parseTimes: number[] = [];
  private recentFailures: ParsingFailureRecord[] = [];
  private maxFailureRecords = 50; // Keep last 50 failures for debugging
  private maxParseTimings = 1000;

  private constructor() {
    parsingLogger.info('JSON Parsing Monitor initialized');
  }

  public static getInstance(): JSONParsingMonitor {
    if (!JSONParsingMonitor.instance) {
      JSONParsingMonitor.instance = new JSONParsingMonitor();
    }
    return JSONParsingMonitor.instance;
  }

  /**
   * Record a parsing attempt result
   *
   * @param result - The ParseResult from simple-parser
   * @param formType - The SEC form type being parsed
   * @param promptSummary - Optional summary of the prompt used (for debugging)
   */
  public recordParsingAttempt(
    result: ParseResult,
    formType: string,
    promptSummary?: string
  ): void {
    this.totalAttempts++;
    this.parseTimes.push(result.parseTimeMs);

    // Trim parse times array to prevent memory growth
    if (this.parseTimes.length > this.maxParseTimings) {
      this.parseTimes = this.parseTimes.slice(-this.maxParseTimings / 2);
    }

    // Track by method and success
    if (result.success) {
      this.recordSuccess(result, formType);
    } else {
      this.recordFailure(result, formType, promptSummary);
    }

    // Update monitoring counters
    monitoring.incrementCounter('ai.parsing.total', 1, { formType });
  }

  /**
   * Record a successful parsing attempt
   */
  private recordSuccess(result: ParseResult, formType: string): void {
    switch (result.method) {
      case 'direct':
        this.directSuccesses++;
        monitoring.incrementCounter('ai.parsing.direct_success', 1, { formType });
        parsingLogger.debug('Direct JSON parse success', { formType, parseTimeMs: result.parseTimeMs });
        break;

      case 'codeblock-stripped':
        this.codeblockStripped++;
        monitoring.incrementCounter('ai.parsing.codeblock_stripped', 1, { formType });
        parsingLogger.info('JSON parsed after stripping markdown code block', { formType, parseTimeMs: result.parseTimeMs });
        break;

      case 'bracket-repaired':
        this.bracketRepaired++;
        monitoring.incrementCounter('ai.parsing.bracket_repaired', 1, { formType });
        parsingLogger.info('JSON parsed after bracket repair', {
          formType,
          parseTimeMs: result.parseTimeMs,
          diagnostics: result.diagnostics
        });
        break;
    }
  }

  /**
   * Record a failed parsing attempt with detailed feedback
   */
  private recordFailure(
    result: ParseResult,
    formType: string,
    promptSummary?: string
  ): void {
    // Categorize failure type
    if (result.validationErrors && result.validationErrors.length > 0) {
      this.validationFailures++;
      monitoring.incrementCounter('ai.parsing.validation_failure', 1, {
        formType,
        missingFields: result.validationErrors.join(',')
      });

      parsingLogger.warn('JSON parsed but failed schema validation', {
        formType,
        missingFields: result.validationErrors,
        diagnostics: result.diagnostics
      });
    } else if (result.error) {
      this.jsonErrors++;
      monitoring.incrementCounter('ai.parsing.json_error', 1, { formType });

      parsingLogger.error('JSON parse error - prompt improvement needed', {
        formType,
        error: result.error,
        diagnostics: result.diagnostics,
        responsePreview: this.truncateForLogging(result.rawResponse, 500)
      });
    }

    // Record failure for prompt improvement feedback loop
    this.recordFailureForFeedback(result, formType, promptSummary);
  }

  /**
   * Record failure details for the prompt improvement feedback loop
   */
  private recordFailureForFeedback(
    result: ParseResult,
    formType: string,
    promptSummary?: string
  ): void {
    const failureRecord: ParsingFailureRecord = {
      timestamp: new Date(),
      formType,
      method: result.method,
      error: result.error,
      validationErrors: result.validationErrors,
      diagnostics: result.diagnostics || {
        responseLength: result.rawResponse?.length || 0,
        responsePreview: this.truncateForLogging(result.rawResponse, 100),
        startsWithBrace: result.rawResponse?.trim().startsWith('{') || false,
        endsWithBrace: result.rawResponse?.trim().endsWith('}') || false,
        hadCodeBlock: result.method === 'codeblock-stripped',
        formType,
        usedKnownSchema: true
      },
      responsePreview: this.truncateForLogging(result.rawResponse, 500),
      promptSummary
    };

    this.recentFailures.push(failureRecord);

    // Trim failure records to prevent memory growth
    if (this.recentFailures.length > this.maxFailureRecords) {
      this.recentFailures = this.recentFailures.slice(-this.maxFailureRecords);
    }
  }

  /**
   * Get aggregated parsing metrics
   */
  public getMetrics(): ParsingMetrics {
    const avgParseTime = this.parseTimes.length > 0
      ? this.parseTimes.reduce((a, b) => a + b, 0) / this.parseTimes.length
      : 0;

    const totalSuccesses = this.directSuccesses + this.codeblockStripped + this.bracketRepaired;
    const successRate = this.totalAttempts > 0
      ? (totalSuccesses / this.totalAttempts) * 100
      : 0;

    return {
      total: this.totalAttempts,
      directSuccess: this.directSuccesses,
      codeblockStripped: this.codeblockStripped,
      bracketRepaired: this.bracketRepaired,
      validationFailures: this.validationFailures,
      jsonErrors: this.jsonErrors,
      successRate: Math.round(successRate * 100) / 100,
      avgParseTimeMs: Math.round(avgParseTime * 1000) / 1000,
      recentFailures: [...this.recentFailures]
    };
  }

  /**
   * Get recent failures for debugging/prompt improvement
   */
  public getRecentFailures(limit: number = 10): ParsingFailureRecord[] {
    return this.recentFailures.slice(-limit);
  }

  /**
   * Generate a prompt improvement report
   *
   * Analyzes recent failures to identify patterns and suggest prompt improvements.
   */
  public generatePromptImprovementReport(): string {
    const metrics = this.getMetrics();
    const failures = this.recentFailures;

    // Group failures by form type
    const failuresByFormType = new Map<string, number>();
    const validationErrorsByField = new Map<string, number>();

    for (const failure of failures) {
      // Count by form type
      const count = failuresByFormType.get(failure.formType) || 0;
      failuresByFormType.set(failure.formType, count + 1);

      // Count validation errors by field
      if (failure.validationErrors) {
        for (const field of failure.validationErrors) {
          const fieldCount = validationErrorsByField.get(field) || 0;
          validationErrorsByField.set(field, fieldCount + 1);
        }
      }
    }

    // Sort by frequency
    const topFailingFormTypes = [...failuresByFormType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topMissingFields = [...validationErrorsByField.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return `
JSON PARSING - PROMPT IMPROVEMENT REPORT
========================================
Generated: ${new Date().toISOString()}

OVERALL METRICS:
- Total Attempts: ${metrics.total}
- Success Rate: ${metrics.successRate}%
- Direct Success: ${metrics.directSuccess}
- Codeblock Stripped: ${metrics.codeblockStripped}
- Bracket Repaired: ${metrics.bracketRepaired}
- Validation Failures: ${metrics.validationFailures}
- JSON Errors: ${metrics.jsonErrors}
- Avg Parse Time: ${metrics.avgParseTimeMs}ms

TOP FAILING FORM TYPES:
${topFailingFormTypes.map(([type, count]) => `- ${type}: ${count} failures`).join('\n') || '- None'}

MOST COMMONLY MISSING FIELDS:
${topMissingFields.map(([field, count]) => `- ${field}: missing in ${count} responses`).join('\n') || '- None'}

RECOMMENDATIONS:
${this.generateRecommendations(metrics, topFailingFormTypes, topMissingFields)}
`;
  }

  /**
   * Generate specific recommendations based on failure patterns
   */
  private generateRecommendations(
    metrics: ParsingMetrics,
    topFailingFormTypes: [string, number][],
    topMissingFields: [string, number][]
  ): string {
    const recommendations: string[] = [];

    // Check if bracket repair is being used frequently
    if (metrics.bracketRepaired > metrics.total * 0.1) {
      recommendations.push(
        '- HIGH: Bracket repair used for >10% of responses. Consider strengthening ' +
        'the "close all brackets" instruction in the system prompt.'
      );
    }

    // Check if codeblock stripping is common
    if (metrics.codeblockStripped > metrics.total * 0.1) {
      recommendations.push(
        '- MEDIUM: Markdown code blocks still appearing in >10% of responses. ' +
        'Reinforce "no markdown" instruction in system prompt.'
      );
    }

    // Check for common missing fields
    for (const [field, count] of topMissingFields) {
      if (count > 3) {
        recommendations.push(
          `- MEDIUM: Field "${field}" frequently missing (${count} times). ` +
          `Mark as (REQUIRED) in schema and add explicit instruction.`
        );
      }
    }

    // Check for form-type specific issues
    for (const [formType, count] of topFailingFormTypes) {
      if (count > 5) {
        recommendations.push(
          `- HIGH: Form type "${formType}" has ${count} failures. ` +
          `Review and improve the schema/prompt for this form type.`
        );
      }
    }

    // General recommendation if success rate is low
    if (metrics.successRate < 90) {
      recommendations.push(
        '- CRITICAL: Success rate below 90%. Consider reviewing the overall ' +
        'prompt structure and adding more explicit JSON formatting examples.'
      );
    }

    return recommendations.length > 0
      ? recommendations.join('\n')
      : '- No critical issues detected. Continue monitoring.';
  }

  /**
   * Truncate a string for safe logging (removing sensitive data, limiting length)
   */
  private truncateForLogging(text: string, maxLength: number): string {
    if (!text) return '';

    // Sanitize any potential sensitive patterns (basic)
    const sanitized = text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');

    if (sanitized.length <= maxLength) {
      return sanitized;
    }

    return sanitized.substring(0, maxLength) + '... [truncated]';
  }

  /**
   * Reset all metrics (useful for testing or periodic reset)
   */
  public resetMetrics(): void {
    this.totalAttempts = 0;
    this.directSuccesses = 0;
    this.codeblockStripped = 0;
    this.bracketRepaired = 0;
    this.validationFailures = 0;
    this.jsonErrors = 0;
    this.parseTimes = [];
    this.recentFailures = [];

    parsingLogger.info('JSON Parsing Monitor metrics reset');
  }
}

// Export singleton instance
export const jsonParsingMonitor = JSONParsingMonitor.getInstance();

// Export class for testing
export { JSONParsingMonitor };
