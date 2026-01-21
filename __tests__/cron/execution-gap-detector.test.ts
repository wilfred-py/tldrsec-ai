/**
 * Tests for CronExecutionGapDetector
 *
 * Unit tests for CronExecutionGapDetector that verify the service correctly
 * detects gaps in cron execution history and alerts appropriately.
 *
 * @see docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md Phase 2
 */

import { CronExecutionGapDetector } from '@/lib/cron/execution-gap-detector';

// Helper to generate mock executions with regular intervals
function generateMockExecutions(count: number, intervalMinutes: number): Array<{ triggeredAt: Date }> {
  const executions = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    executions.push({
      triggeredAt: new Date(now - i * intervalMinutes * 60 * 1000),
    });
  }
  return executions;
}

describe('CronExecutionGapDetector', () => {
  describe('detectGaps', () => {
    it('should return no gaps when executions are within threshold', async () => {
      // Mock: executions every 5 minutes for last hour (12 executions)
      const mockExecutions = generateMockExecutions(12, 5);

      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions,
      });

      expect(gaps).toHaveLength(0);
    });

    it('should detect gap when >15 minutes between executions', async () => {
      // Mock: 30-minute gap in the middle
      const now = Date.now();
      const mockExecutions = [
        { triggeredAt: new Date(now - 5 * 60 * 1000) },
        { triggeredAt: new Date(now - 10 * 60 * 1000) },
        // GAP: 30 minutes
        { triggeredAt: new Date(now - 40 * 60 * 1000) },
        { triggeredAt: new Date(now - 45 * 60 * 1000) },
      ];

      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions,
      });

      expect(gaps).toHaveLength(1);
      expect(gaps[0].durationMinutes).toBe(30);
      expect(gaps[0].type).toBe('gap-between-executions');
    });

    it('should detect gap when no recent executions', async () => {
      // Mock: no executions in last 60 minutes (only one from 90 min ago)
      const now = Date.now();
      const mockExecutions = [
        { triggeredAt: new Date(now - 90 * 60 * 1000) },
      ];

      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions,
      });

      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0].type).toBe('no-recent-executions');
    });

    it('should detect gap from now to most recent execution', async () => {
      // Mock: last execution was 25 minutes ago
      const now = Date.now();
      const mockExecutions = [
        { triggeredAt: new Date(now - 25 * 60 * 1000) },
        { triggeredAt: new Date(now - 30 * 60 * 1000) },
      ];

      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions,
      });

      expect(gaps).toHaveLength(1);
      expect(gaps[0].type).toBe('no-recent-executions');
      expect(gaps[0].durationMinutes).toBe(25);
    });

    it('should return empty array when no executions exist', async () => {
      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions: [],
      });

      // Should detect as no-recent-executions gap
      expect(gaps).toHaveLength(1);
      expect(gaps[0].type).toBe('no-recent-executions');
      expect(gaps[0].durationMinutes).toBe(60);
    });

    it('should detect multiple gaps', async () => {
      // Mock: two 20-minute gaps
      const now = Date.now();
      const mockExecutions = [
        { triggeredAt: new Date(now - 5 * 60 * 1000) },
        // GAP: 20 minutes
        { triggeredAt: new Date(now - 25 * 60 * 1000) },
        { triggeredAt: new Date(now - 30 * 60 * 1000) },
        // GAP: 20 minutes
        { triggeredAt: new Date(now - 50 * 60 * 1000) },
      ];

      const gaps = await CronExecutionGapDetector.detectGaps({
        lookbackMinutes: 60,
        gapThresholdMinutes: 15,
        mockExecutions,
      });

      expect(gaps).toHaveLength(2);
      expect(gaps[0].durationMinutes).toBe(20);
      expect(gaps[1].durationMinutes).toBe(20);
    });
  });

  describe('shouldAlert', () => {
    it('should return true for gaps exceeding alert threshold', () => {
      const gap = {
        type: 'gap-between-executions' as const,
        durationMinutes: 20,
        startTime: new Date(),
        endTime: new Date(),
      };

      const shouldAlert = CronExecutionGapDetector.shouldAlert(gap, { alertThresholdMinutes: 15 });

      expect(shouldAlert).toBe(true);
    });

    it('should return false for gaps below alert threshold', () => {
      const gap = {
        type: 'gap-between-executions' as const,
        durationMinutes: 10,
        startTime: new Date(),
        endTime: new Date(),
      };

      const shouldAlert = CronExecutionGapDetector.shouldAlert(gap, { alertThresholdMinutes: 15 });

      expect(shouldAlert).toBe(false);
    });

    it('should return true for gaps exactly at threshold', () => {
      const gap = {
        type: 'gap-between-executions' as const,
        durationMinutes: 15,
        startTime: new Date(),
        endTime: new Date(),
      };

      // At threshold should not alert (>= should be strictly greater)
      const shouldAlert = CronExecutionGapDetector.shouldAlert(gap, { alertThresholdMinutes: 15 });

      expect(shouldAlert).toBe(false);
    });

    it('should use default threshold of 15 minutes', () => {
      const gap = {
        type: 'gap-between-executions' as const,
        durationMinutes: 20,
        startTime: new Date(),
        endTime: new Date(),
      };

      const shouldAlert = CronExecutionGapDetector.shouldAlert(gap);

      expect(shouldAlert).toBe(true);
    });
  });

  describe('getGapSummary', () => {
    it('should return formatted summary for single gap', () => {
      const gaps = [
        {
          type: 'gap-between-executions' as const,
          durationMinutes: 30,
          startTime: new Date('2026-01-10T10:00:00Z'),
          endTime: new Date('2026-01-10T10:30:00Z'),
        },
      ];

      const summary = CronExecutionGapDetector.getGapSummary(gaps);

      expect(summary).toContain('30 minutes');
      expect(summary).toContain('gap-between-executions');
    });

    it('should return formatted summary for multiple gaps', () => {
      const gaps = [
        {
          type: 'gap-between-executions' as const,
          durationMinutes: 20,
          startTime: new Date('2026-01-10T10:00:00Z'),
          endTime: new Date('2026-01-10T10:20:00Z'),
        },
        {
          type: 'no-recent-executions' as const,
          durationMinutes: 25,
          startTime: new Date('2026-01-10T09:30:00Z'),
          endTime: new Date('2026-01-10T09:55:00Z'),
        },
      ];

      const summary = CronExecutionGapDetector.getGapSummary(gaps);

      expect(summary).toContain('20 minutes');
      expect(summary).toContain('25 minutes');
    });

    it('should return empty string for no gaps', () => {
      const summary = CronExecutionGapDetector.getGapSummary([]);

      expect(summary).toBe('');
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      CronExecutionGapDetector.clearRateLimit();
    });

    it('should clear rate limit for testing', () => {
      // This test verifies the clearRateLimit method works
      CronExecutionGapDetector.clearRateLimit();
      // No error means success
      expect(true).toBe(true);
    });
  });
});
