import * as React from 'react';
import { EmailColors, getChangeStyle, getChangeArrow } from '../../design-system';

interface DataRowProps {
  label: string;
  value: string | number;
  change?: string | number;
  isAlternate?: boolean;
}

/**
 * Data row component for key-value display with optional change indicator
 * Morning Brew style: clean layout, change highlighted in green/red
 */
export function DataRow({ label, value, change, isAlternate }: DataRowProps) {
  const changeStyle = getChangeStyle(change);
  const arrow = getChangeArrow(change);

  return (
    <tr>
      <td style={{
        padding: '10px 12px',
        fontSize: '14px',
        color: EmailColors.text.body,
        backgroundColor: isAlternate ? EmailColors.structure.backgroundAlt : EmailColors.structure.background,
        borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
      }}>
        {label}
      </td>
      <td style={{
        padding: '10px 12px',
        fontSize: '14px',
        fontWeight: 600,
        color: EmailColors.text.headline,
        textAlign: 'right',
        backgroundColor: isAlternate ? EmailColors.structure.backgroundAlt : EmailColors.structure.background,
        borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
      }}>
        {value}
      </td>
      {change !== undefined && (
        <td style={{
          padding: '10px 12px',
          fontSize: '14px',
          fontWeight: 600,
          textAlign: 'right',
          backgroundColor: isAlternate ? EmailColors.structure.backgroundAlt : EmailColors.structure.background,
          borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
          ...changeStyle,
        }}>
          {arrow} {change}
        </td>
      )}
    </tr>
  );
}

export default DataRow;
