import * as React from 'react';

interface StalenessBannerProps {
  filingDate: Date;
  /** Injectable current date for deterministic testing */
  now?: Date;
}

/**
 * Email banner that warns users when a filing summary was delivered
 * significantly after the original filing date.
 *
 * Renders `null` for fresh filings (< 7 days old). For 7–29 days renders the
 * amber warning banner; at 30+ days the banner escalates to red (critical).
 *
 * The staleness rule is intentionally inline rather than behind a separate
 * StalenessDetector seam — there's exactly one production caller (this
 * banner, embedded in the minimalist templates) and the prior
 * extraction-for-testability split (formerly `lib/validation/staleness-detector.ts`)
 * exposed a shallow interface that tests targeted directly. Coverage now
 * flows through this component's JSX output via
 * `__tests__/email/staleness-banner.test.tsx`. Same shape as ADR-0002.
 */
const STALE_THRESHOLD_DAYS = 7;
const CRITICAL_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function StalenessBanner({ filingDate, now = new Date() }: StalenessBannerProps) {
  const daysOld = Math.floor((now.getTime() - filingDate.getTime()) / MS_PER_DAY);

  if (daysOld < STALE_THRESHOLD_DAYS) {
    return null;
  }

  const isCritical = daysOld >= CRITICAL_THRESHOLD_DAYS;
  const bgColor = isCritical ? '#FEE2E2' : '#FEF3C7';
  const borderColor = isCritical ? '#EF4444' : '#F59E0B';
  const textColor = isCritical ? '#991B1B' : '#92400E';

  return (
    <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '12px' }}>
      <tbody>
        <tr>
          <td style={{
            padding: '10px 15px',
            backgroundColor: bgColor,
            borderRadius: '6px',
            border: `1px solid ${borderColor}`,
            fontSize: '13px',
            lineHeight: '1.4',
            color: textColor,
          }}>
            This summary was delayed — the filing was originally filed {daysOld} days ago.
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default StalenessBanner;
