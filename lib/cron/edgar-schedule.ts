/**
 * EDGAR filing schedule awareness
 *
 * SEC EDGAR hours:
 *   Open:   6:00 AM – 10:00 PM ET, Monday–Friday
 *   Closed: 10:00 PM – 6:00 AM ET, weekends, federal holidays
 *
 * We apply a 15-minute buffer on each side:
 *   Skip discovery from 10:15 PM to 5:45 AM ET
 *
 * Federal holidays list covers 2026–2027. For unknown years the check
 * is skipped (fail-open) with a console.warn so we never silently
 * block discovery.
 */

// SEC observes all federal holidays
// Source: https://www.sec.gov/edgar/filer-information/calendar
const FEDERAL_HOLIDAYS: Record<number, string[]> = {
  2026: [
    '01-01', // New Year's Day
    '01-19', // MLK Jr. Day
    '02-16', // Presidents' Day
    '05-25', // Memorial Day
    '07-03', // Independence Day (observed)
    '09-07', // Labor Day
    '10-12', // Columbus Day
    '11-11', // Veterans Day
    '11-26', // Thanksgiving
    '12-25', // Christmas
  ],
  2027: [
    '01-01', // New Year's Day
    '01-18', // MLK Jr. Day
    '02-15', // Presidents' Day
    '05-31', // Memorial Day
    '07-05', // Independence Day (observed)
    '09-06', // Labor Day
    '10-11', // Columbus Day
    '11-11', // Veterans Day
    '11-25', // Thanksgiving
    '12-24', // Christmas (observed)
  ],
};

/**
 * Check whether EDGAR is expected to have new filings right now.
 *
 * @param now - Current time (injectable for testing)
 * @returns true if discovery should run, false if EDGAR is closed
 */
export function isEdgarOpen(now: Date = new Date()): boolean {
  // Convert to ET using Intl (handles DST automatically)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value || '';

  const weekday = get('weekday');    // "Mon", "Tue", etc.
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const month = get('month');        // "01"–"12"
  const day = get('day');            // "01"–"31"
  const year = parseInt(get('year'), 10);

  // Weekends — always closed
  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }

  // Time check with 15-min buffer:
  //   Closed from 22:15 to 05:44 (i.e. open from 05:45 to 22:14)
  const timeMinutes = hour * 60 + minute;
  if (timeMinutes >= 22 * 60 + 15 || timeMinutes < 5 * 60 + 45) {
    return false;
  }

  // Federal holidays
  const holidays = FEDERAL_HOLIDAYS[year];
  if (!holidays) {
    // Fail open — don't skip discovery on unknown years
    console.warn(`[edgar-schedule] No holiday data for ${year}. Skipping holiday check.`);
    return true;
  }

  const mmdd = `${month}-${day}`;
  if (holidays.includes(mmdd)) {
    return false;
  }

  return true;
}

// ── Adaptive Polling ─────────────────────────────────────────────────

/**
 * Adaptive polling intervals by time period.
 *
 * Returns the minimum interval (ms) between fast-poll cycles based on
 * the current ET time. During market hours filings arrive most frequently,
 * so we poll aggressively. Off-hours and weekends use longer intervals
 * to conserve resources.
 *
 *   Market hours  (9:30–16:00 ET):  30 seconds
 *   Pre/post mkt  (5:45–9:30, 16:00–22:14 ET):  60 seconds
 *   Off-hours     (22:15–5:44 ET):  5 minutes
 *   Weekends/holidays:              15 minutes
 *
 * @param now - Current time (injectable for testing)
 * @returns Polling interval in milliseconds
 */
export function getAdaptivePollingIntervalMs(now: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value || '';

  const weekday = get('weekday');
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const month = get('month');
  const day = get('day');
  const year = parseInt(get('year'), 10);

  // Weekends
  if (weekday === 'Sat' || weekday === 'Sun') {
    return 15 * 60 * 1000;
  }

  // Holidays
  const holidays = FEDERAL_HOLIDAYS[year];
  if (holidays) {
    const mmdd = `${month}-${day}`;
    if (holidays.includes(mmdd)) {
      return 15 * 60 * 1000;
    }
  }

  const timeMinutes = hour * 60 + minute;

  // Off-hours (22:15 to 05:44)
  if (timeMinutes >= 22 * 60 + 15 || timeMinutes < 5 * 60 + 45) {
    return 5 * 60 * 1000;
  }

  // Market hours (9:30 to 16:00)
  if (timeMinutes >= 9 * 60 + 30 && timeMinutes < 16 * 60) {
    return 30 * 1000;
  }

  // Pre/post market
  return 60 * 1000;
}

/**
 * Check whether enough time has elapsed since the last poll to run again.
 *
 * @param lastPollTime - When the last poll completed (null = never polled)
 * @param now - Current time (injectable for testing)
 * @returns true if enough time has passed to poll again
 */
export function shouldPollNow(
  lastPollTime: Date | null,
  now: Date = new Date()
): boolean {
  if (!lastPollTime) return true;
  const interval = getAdaptivePollingIntervalMs(now);
  return (now.getTime() - lastPollTime.getTime()) >= interval;
}
