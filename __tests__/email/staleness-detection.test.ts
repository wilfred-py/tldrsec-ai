import { StalenessDetector } from '@/lib/validation/staleness-detector';

describe('StalenessDetector', () => {
  describe('isStale', () => {
    it('should return false for filing from today', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-12'), now);
      expect(result.isStale).toBe(false);
    });

    it('should return false for filing from 5 days ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-07'), now);
      expect(result.isStale).toBe(false);
    });

    it('should return true for filing from 8 days ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-04'), now);
      expect(result.isStale).toBe(true);
      expect(result.daysOld).toBe(8);
    });

    it('should return true for filing from 3 months ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2025-11-01'), now);
      expect(result.isStale).toBe(true);
      expect(result.daysOld).toBeGreaterThan(90);
    });

    it('should return severity "warning" for 7-30 days old', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-01-25'), now);
      expect(result.severity).toBe('warning');
    });

    it('should return severity "critical" for 30+ days old', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2025-12-01'), now);
      expect(result.severity).toBe('critical');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format "Filed today" for same-day', () => {
      expect(StalenessDetector.formatRelativeTime(0)).toBe('Filed today');
    });

    it('should format "Filed 1 day ago" for yesterday', () => {
      expect(StalenessDetector.formatRelativeTime(1)).toBe('Filed 1 day ago');
    });

    it('should format "Filed 2 weeks ago" for 14 days', () => {
      expect(StalenessDetector.formatRelativeTime(14)).toBe('Filed 2 weeks ago');
    });

    it('should format "Filed 3 months ago" for 90 days', () => {
      expect(StalenessDetector.formatRelativeTime(90)).toBe('Filed 3 months ago');
    });
  });
});
