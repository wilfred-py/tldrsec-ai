import * as React from 'react';
import { EmailColors } from '../../design-system';

interface TotalsLineProps {
  /** Per-currency totals as a formatted display string, e.g., "¥265B + $7B" */
  display: string;
  /** Optional tranche count to show next to the total, e.g., "7 tranches" */
  trancheCountLabel?: string;
}

/**
 * Compact one-line "total" display for multi-tranche debt issuances.
 * Placed above the TranchesList table to give readers a glance-able headline.
 */
export function TotalsLine({ display, trancheCountLabel }: TotalsLineProps) {
  return (
    <div style={{
      fontSize: '15px',
      fontWeight: 600,
      color: EmailColors.text.headline,
      margin: '0 0 8px 0',
      lineHeight: '1.4',
    }}>
      {display}
      {trancheCountLabel && (
        <span style={{
          marginLeft: '8px',
          fontSize: '12px',
          fontWeight: 500,
          color: EmailColors.text.meta,
        }}>
          ({trancheCountLabel})
        </span>
      )}
    </div>
  );
}

export default TotalsLine;
