/**
 * Tests for the partial-result helper that the cron handler email gate
 * consumes. Parameterized table covers every combination of the two
 * inputs (`isPartialResult`, `processingStatus`) so a future contributor
 * adding a new ProcessingStatus value gets a clear test signal about
 * whether it should be suppressed.
 */

import {
  ProcessingStatus,
  PARTIAL_RESULT_STATUSES,
  isSuppressedFromEmail,
} from '../../../lib/ai/processing-status';

describe('isSuppressedFromEmail', () => {
  describe('isPartialResult flag', () => {
    const cases: Array<[boolean | null | undefined, boolean, string]> = [
      [true, true, 'true → suppressed'],
      [false, false, 'false → not suppressed'],
      [null, false, 'null → not suppressed'],
      [undefined, false, 'undefined → not suppressed'],
    ];
    it.each(cases)('isPartialResult=%p → suppressed=%p (%s)', (input, expected) => {
      expect(isSuppressedFromEmail({ isPartialResult: input })).toBe(expected);
    });
  });

  describe('processingStatus values', () => {
    const cases: Array<[string | null | undefined, boolean]> = [
      [ProcessingStatus.PROCESSING, false],
      [ProcessingStatus.COMPLETED, false],
      [ProcessingStatus.COMPLETED_WITH_WARNINGS, true],
      [ProcessingStatus.OUTPUT_TRUNCATED, true],
      [ProcessingStatus.FAILED, false],
      [null, false],
      [undefined, false],
      ['UNKNOWN_FUTURE_STATUS', false],
    ];
    it.each(cases)('processingStatus=%p → suppressed=%p', (status, expected) => {
      expect(isSuppressedFromEmail({ processingStatus: status })).toBe(expected);
    });
  });

  describe('combined inputs', () => {
    it('suppresses when isPartialResult=true even with COMPLETED status', () => {
      expect(
        isSuppressedFromEmail({ isPartialResult: true, processingStatus: ProcessingStatus.COMPLETED })
      ).toBe(true);
    });

    it('suppresses when processingStatus=OUTPUT_TRUNCATED even with isPartialResult=false', () => {
      expect(
        isSuppressedFromEmail({ isPartialResult: false, processingStatus: ProcessingStatus.OUTPUT_TRUNCATED })
      ).toBe(true);
    });

    it('passes through when both signals are happy', () => {
      expect(
        isSuppressedFromEmail({ isPartialResult: false, processingStatus: ProcessingStatus.COMPLETED })
      ).toBe(false);
    });

    it('passes through when both signals are absent', () => {
      expect(isSuppressedFromEmail({})).toBe(false);
    });
  });

  describe('PARTIAL_RESULT_STATUSES set', () => {
    it('contains exactly the partial-result statuses', () => {
      const set = new Set([...PARTIAL_RESULT_STATUSES]);
      expect(set.has(ProcessingStatus.COMPLETED_WITH_WARNINGS)).toBe(true);
      expect(set.has(ProcessingStatus.OUTPUT_TRUNCATED)).toBe(true);
      expect(set.has(ProcessingStatus.COMPLETED)).toBe(false);
      expect(set.has(ProcessingStatus.PROCESSING)).toBe(false);
      expect(set.has(ProcessingStatus.FAILED)).toBe(false);
    });
  });
});
