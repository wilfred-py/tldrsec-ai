import * as React from 'react';
import { EmailColors, EmailSpacing } from '../../design-system';

interface SectionCardProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

/**
 * Card container for email sections
 * Morning Brew style: clean white background, subtle border, rounded corners
 */
export function SectionCard({ children, noPadding }: SectionCardProps) {
  return (
    <table
      width="100%"
      cellPadding="0"
      cellSpacing="0"
      style={{
        backgroundColor: EmailColors.structure.background,
        border: `1px solid ${EmailColors.structure.border}`,
        borderRadius: '8px',
        marginBottom: '16px',
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: noPadding ? '0' : EmailSpacing.inner.padding }}>
            <table width="100%" cellPadding="0" cellSpacing="0">
              <tbody>
                {children}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default SectionCard;
