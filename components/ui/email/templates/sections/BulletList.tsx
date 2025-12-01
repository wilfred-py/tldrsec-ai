import * as React from 'react';
import { EmailColors, EmailTypography } from '../../design-system';

interface BulletItem {
  text: string;
  highlight?: {
    value: string;
    type: 'positive' | 'negative' | 'neutral';
  };
}

interface BulletListProps {
  items: BulletItem[];
}

/**
 * Bullet list component for scannable content
 * Morning Brew style: clean bullets, highlighted values in green/red
 */
export function BulletList({ items }: BulletListProps) {
  const getHighlightColor = (type: 'positive' | 'negative' | 'neutral') => {
    switch (type) {
      case 'positive': return EmailColors.semantic.positive;
      case 'negative': return EmailColors.semantic.negative;
      default: return EmailColors.text.body;
    }
  };

  return (
    <tr>
      <td>
        <table width="100%" cellPadding="0" cellSpacing="0">
          <tbody>
            {items.map((item, index) => (
              <tr key={index}>
                <td style={{
                  padding: '4px 0',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  color: EmailColors.text.body,
                }}>
                  <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                  {item.highlight ? (
                    <>
                      <span style={{
                        fontWeight: 600,
                        color: getHighlightColor(item.highlight.type),
                      }}>
                        {item.highlight.value}
                      </span>
                      {' '}{item.text}
                    </>
                  ) : (
                    item.text
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export default BulletList;
