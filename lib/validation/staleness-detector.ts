/**
 * Staleness Detector for SEC Filing Summaries
 *
 * Detects when filings are delivered significantly after their filing date
 * and provides relative time formatting and severity classification.
 */

// --- Configuration ---

const STALE_THRESHOLD_DAYS = 7;
const CRITICAL_THRESHOLD_DAYS = 30;

// --- Types ---

export type StalenessSeverity = 'none' | 'warning' | 'critical';

export interface StalenessResult {
  isStale: boolean;
  daysOld: number;
  severity: StalenessSeverity;
  message: string;
}

// --- Staleness Detector ---

export class StalenessDetector {
  /**
   * Check if a filing is stale based on its filing date.
   *
   * @param filingDate - The date the filing was originally filed with the SEC
   * @param now - Current date (injectable for deterministic testing)
   * @returns Staleness assessment with severity and human-readable message
   */
  static check(filingDate: Date, now: Date = new Date()): StalenessResult {
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysOld = Math.floor((now.getTime() - filingDate.getTime()) / msPerDay);

    if (daysOld < STALE_THRESHOLD_DAYS) {
      return {
        isStale: false,
        daysOld,
        severity: 'none',
        message: '',
      };
    }

    const severity: StalenessSeverity = daysOld >= CRITICAL_THRESHOLD_DAYS ? 'critical' : 'warning';
    const relativeTime = StalenessDetector.formatRelativeTime(daysOld);

    return {
      isStale: true,
      daysOld,
      severity,
      message: `This filing was originally ${relativeTime.toLowerCase()}. Delivery was delayed due to processing.`,
    };
  }

  /**
   * Format days old as a human-readable relative time string.
   *
   * @param daysOld - Number of days since filing
   * @returns Human-readable string (e.g., "Filed 2 weeks ago")
   */
  static formatRelativeTime(daysOld: number): string {
    if (daysOld === 0) return 'Filed today';
    if (daysOld === 1) return 'Filed 1 day ago';
    if (daysOld < 7) return `Filed ${daysOld} days ago`;
    if (daysOld < 14) return 'Filed 1 week ago';
    if (daysOld < 30) return `Filed ${Math.floor(daysOld / 7)} weeks ago`;
    if (daysOld < 60) return 'Filed 1 month ago';
    return `Filed ${Math.floor(daysOld / 30)} months ago`;
  }
}
