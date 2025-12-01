import * as React from 'react';
import { EmailColors, EmailTypography } from '../../design-system';

interface SectionHeaderProps {
  emoji?: string;
  title: string;
  subtitle?: string;
}

/**
 * Section header component with optional emoji
 * Morning Brew style: clean, bold headline with optional icon
 */
export function SectionHeader({ emoji, title, subtitle }: SectionHeaderProps) {
  return (
    <tr>
      <td style={{ paddingBottom: '12px' }}>
        <h2 style={{
          margin: '0 0 7px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: EmailColors.text.headline,
          borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
          paddingBottom: '8px',
        }}>
          {emoji && <span style={{ marginRight: '6px' }}>{emoji}</span>}
          {title}
        </h2>
        {subtitle && (
          <p style={{
            margin: '4px 0 0 0',
            fontSize: '12px',
            color: EmailColors.text.meta,
          }}>
            {subtitle}
          </p>
        )}
      </td>
    </tr>
  );
}

export default SectionHeader;
