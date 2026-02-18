import * as React from 'react';
import { StalenessDetector } from '../../../../../lib/validation/staleness-detector';

interface StalenessBannerProps {
  filingDate: Date;
  /** Injectable current date for deterministic testing */
  now?: Date;
}

/**
 * Email banner component that warns users when a filing summary
 * was delivered significantly after the original filing date.
 *
 * Renders nothing for fresh filings (< 7 days old).
 * Shows an amber warning banner for stale filings.
 */
export function StalenessBanner({ filingDate, now }: StalenessBannerProps) {
  const result = StalenessDetector.check(filingDate, now);

  if (!result.isStale) {
    return null;
  }

  const bgColor = result.severity === 'critical' ? '#FEE2E2' : '#FEF3C7';
  const borderColor = result.severity === 'critical' ? '#EF4444' : '#F59E0B';
  const textColor = result.severity === 'critical' ? '#991B1B' : '#92400E';

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
            This summary was delayed — the filing was originally filed {result.daysOld} days ago.
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default StalenessBanner;
