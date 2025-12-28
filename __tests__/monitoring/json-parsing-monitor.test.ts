/**
 * Tests for JSON Parsing Monitor
 *
 * Phase 5: Production Validation & Monitoring
 */

import { JSONParsingMonitor, ParsingFailureRecord, ParsingMetrics } from '@/lib/monitoring/json-parsing-monitor';
import type { ParseResult, ParseDiagnostics } from '@/lib/ai/parsers/simple-parser';

// Mock the monitoring module
jest.mock('@/lib/monitoring/index', () => ({
  monitoring: {
    incrementCounter: jest.fn()
  }
}));

// Mock the logger
jest.mock('@/lib/logging', () => ({
  logger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  }
}));

describe('JSONParsingMonitor', () => {
  let monitor: JSONParsingMonitor;

  beforeEach(() => {
    // Create a fresh instance for each test
    monitor = JSONParsingMonitor.getInstance();
    monitor.resetMetrics();
  });

  describe('recordParsingAttempt', () => {
    it('should record successful direct parsing', () => {
      const result: ParseResult = {
        success: true,
        data: { company: 'Tesla', summary: 'Test summary' },
        method: 'direct',
        attempts: 1,
        rawResponse: '{"company":"Tesla","summary":"Test summary"}',
        parseTimeMs: 0.5
      };

      monitor.recordParsingAttempt(result, '10-K');

      const metrics = monitor.getMetrics();
      expect(metrics.total).toBe(1);
      expect(metrics.directSuccess).toBe(1);
      expect(metrics.successRate).toBe(100);
    });

    it('should record successful codeblock-stripped parsing', () => {
      const result: ParseResult = {
        success: true,
        data: { company: 'Apple', summary: 'Quarterly results' },
        method: 'codeblock-stripped',
        attempts: 1,
        rawResponse: '```json\n{"company":"Apple","summary":"Quarterly results"}\n```',
        parseTimeMs: 0.8
      };

      monitor.recordParsingAttempt(result, '10-Q');

      const metrics = monitor.getMetrics();
      expect(metrics.codeblockStripped).toBe(1);
      expect(metrics.successRate).toBe(100);
    });

    it('should record successful bracket-repaired parsing', () => {
      const result: ParseResult = {
        success: true,
        data: { company: 'NVIDIA', summary: 'Earnings report' },
        method: 'bracket-repaired',
        attempts: 1,
        rawResponse: '{"company":"NVIDIA","summary":"Earnings report","items":["a","b"}',
        parseTimeMs: 1.2,
        diagnostics: {
          responseLength: 100,
          responsePreview: '{"company":"NVIDIA"...',
          startsWithBrace: true,
          endsWithBrace: false,
          hadCodeBlock: false,
          formType: '8-K',
          usedKnownSchema: true,
          bracketRepairAttempted: true,
          bracketRepairSucceeded: true
        }
      };

      monitor.recordParsingAttempt(result, '8-K');

      const metrics = monitor.getMetrics();
      expect(metrics.bracketRepaired).toBe(1);
      expect(metrics.successRate).toBe(100);
    });

    it('should record validation failures', () => {
      const result: ParseResult = {
        success: false,
        data: { company: 'Tesla' }, // Missing summary
        method: 'direct',
        attempts: 1,
        validationErrors: ['summary', 'keyHighlights'],
        rawResponse: '{"company":"Tesla"}',
        parseTimeMs: 0.3
      };

      monitor.recordParsingAttempt(result, '10-K');

      const metrics = monitor.getMetrics();
      expect(metrics.validationFailures).toBe(1);
      expect(metrics.successRate).toBe(0);
    });

    it('should record JSON parse errors', () => {
      const result: ParseResult = {
        success: false,
        method: 'direct',
        attempts: 1,
        error: 'Unexpected token at position 42',
        rawResponse: '{"company": "Tesla", broken json here',
        parseTimeMs: 0.2
      };

      monitor.recordParsingAttempt(result, '10-K');

      const metrics = monitor.getMetrics();
      expect(metrics.jsonErrors).toBe(1);
      expect(metrics.successRate).toBe(0);
    });

    it('should calculate correct success rate with mixed results', () => {
      // 2 successes, 1 failure
      const success1: ParseResult = {
        success: true,
        data: { company: 'A', summary: 'X' },
        method: 'direct',
        attempts: 1,
        rawResponse: '{}',
        parseTimeMs: 0.5
      };

      const success2: ParseResult = {
        success: true,
        data: { company: 'B', summary: 'Y' },
        method: 'codeblock-stripped',
        attempts: 1,
        rawResponse: '{}',
        parseTimeMs: 0.5
      };

      const failure: ParseResult = {
        success: false,
        method: 'direct',
        attempts: 1,
        error: 'Parse error',
        rawResponse: 'invalid',
        parseTimeMs: 0.5
      };

      monitor.recordParsingAttempt(success1, '10-K');
      monitor.recordParsingAttempt(success2, '10-Q');
      monitor.recordParsingAttempt(failure, '8-K');

      const metrics = monitor.getMetrics();
      expect(metrics.total).toBe(3);
      expect(metrics.successRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('getRecentFailures', () => {
    it('should return empty array when no failures', () => {
      expect(monitor.getRecentFailures()).toEqual([]);
    });

    it('should return failures in order', () => {
      const failure1: ParseResult = {
        success: false,
        method: 'direct',
        attempts: 1,
        validationErrors: ['field1'],
        rawResponse: '{}',
        parseTimeMs: 0.5
      };

      const failure2: ParseResult = {
        success: false,
        method: 'direct',
        attempts: 1,
        error: 'Parse error',
        rawResponse: 'invalid',
        parseTimeMs: 0.5
      };

      monitor.recordParsingAttempt(failure1, '10-K');
      monitor.recordParsingAttempt(failure2, '10-Q');

      const failures = monitor.getRecentFailures();
      expect(failures).toHaveLength(2);
      expect(failures[0].formType).toBe('10-K');
      expect(failures[1].formType).toBe('10-Q');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        const failure: ParseResult = {
          success: false,
          method: 'direct',
          attempts: 1,
          error: `Error ${i}`,
          rawResponse: '{}',
          parseTimeMs: 0.5
        };
        monitor.recordParsingAttempt(failure, '10-K');
      }

      expect(monitor.getRecentFailures(3)).toHaveLength(3);
      expect(monitor.getRecentFailures(5)).toHaveLength(5);
    });
  });

  describe('generatePromptImprovementReport', () => {
    it('should generate report with no attempts', () => {
      const report = monitor.generatePromptImprovementReport();

      expect(report).toContain('PROMPT IMPROVEMENT REPORT');
      expect(report).toContain('Total Attempts: 0');
      expect(report).toContain('Success Rate: 0%');
      // With 0% success rate (no attempts), it correctly flags as critical
      expect(report).toContain('RECOMMENDATIONS');
    });

    it('should show no issues when success rate is high', () => {
      // Add 10 successful parses to get 100% success rate
      for (let i = 0; i < 10; i++) {
        const success: ParseResult = {
          success: true,
          data: { company: 'Test', summary: 'X' },
          method: 'direct',
          attempts: 1,
          rawResponse: '{}',
          parseTimeMs: 0.5
        };
        monitor.recordParsingAttempt(success, '10-K');
      }

      const report = monitor.generatePromptImprovementReport();

      expect(report).toContain('Success Rate: 100%');
      expect(report).toContain('No critical issues detected');
    });

    it('should identify common missing fields', () => {
      // Create multiple failures with the same missing field
      for (let i = 0; i < 5; i++) {
        const failure: ParseResult = {
          success: false,
          data: { company: 'Test' },
          method: 'direct',
          attempts: 1,
          validationErrors: ['summary', 'keyHighlights'],
          rawResponse: '{"company":"Test"}',
          parseTimeMs: 0.5
        };
        monitor.recordParsingAttempt(failure, '10-K');
      }

      const report = monitor.generatePromptImprovementReport();

      expect(report).toContain('summary');
      expect(report).toContain('keyHighlights');
      expect(report).toContain('MOST COMMONLY MISSING FIELDS');
    });

    it('should identify failing form types', () => {
      // Create multiple failures for the same form type
      for (let i = 0; i < 6; i++) {
        const failure: ParseResult = {
          success: false,
          method: 'direct',
          attempts: 1,
          error: 'Parse error',
          rawResponse: 'invalid',
          parseTimeMs: 0.5
        };
        monitor.recordParsingAttempt(failure, 'Form 4');
      }

      const report = monitor.generatePromptImprovementReport();

      expect(report).toContain('Form 4');
      expect(report).toContain('TOP FAILING FORM TYPES');
    });

    it('should generate recommendations for bracket repair overuse', () => {
      // 2 bracket repairs out of 10 = 20% (above 10% threshold)
      for (let i = 0; i < 8; i++) {
        const success: ParseResult = {
          success: true,
          data: { company: 'Test', summary: 'X' },
          method: 'direct',
          attempts: 1,
          rawResponse: '{}',
          parseTimeMs: 0.5
        };
        monitor.recordParsingAttempt(success, '10-K');
      }

      for (let i = 0; i < 2; i++) {
        const bracketRepair: ParseResult = {
          success: true,
          data: { company: 'Test', summary: 'X' },
          method: 'bracket-repaired',
          attempts: 1,
          rawResponse: '{}',
          parseTimeMs: 0.5
        };
        monitor.recordParsingAttempt(bracketRepair, '10-K');
      }

      const report = monitor.generatePromptImprovementReport();

      expect(report).toContain('Bracket repair');
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to initial state', () => {
      // Add some data
      const result: ParseResult = {
        success: true,
        data: { company: 'Test', summary: 'X' },
        method: 'direct',
        attempts: 1,
        rawResponse: '{}',
        parseTimeMs: 0.5
      };
      monitor.recordParsingAttempt(result, '10-K');

      // Verify data exists
      expect(monitor.getMetrics().total).toBe(1);

      // Reset
      monitor.resetMetrics();

      // Verify reset
      const metrics = monitor.getMetrics();
      expect(metrics.total).toBe(0);
      expect(metrics.directSuccess).toBe(0);
      expect(metrics.codeblockStripped).toBe(0);
      expect(metrics.bracketRepaired).toBe(0);
      expect(metrics.validationFailures).toBe(0);
      expect(metrics.jsonErrors).toBe(0);
      expect(metrics.recentFailures).toHaveLength(0);
    });
  });

  describe('average parse time calculation', () => {
    it('should calculate correct average parse time', () => {
      const times = [1, 2, 3, 4, 5]; // Average = 3

      for (const time of times) {
        const result: ParseResult = {
          success: true,
          data: { company: 'Test', summary: 'X' },
          method: 'direct',
          attempts: 1,
          rawResponse: '{}',
          parseTimeMs: time
        };
        monitor.recordParsingAttempt(result, '10-K');
      }

      const metrics = monitor.getMetrics();
      expect(metrics.avgParseTimeMs).toBe(3);
    });
  });
});
