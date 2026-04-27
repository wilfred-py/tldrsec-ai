import * as React from 'react';
import { EmailColors } from '../../design-system';

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

interface HangingBulletItemProps {
  /** Bullet glyph; defaults to "•". For numbered lists, pass "1." etc. */
  glyph?: string;
  /** Plain text. Mutually exclusive with `html`. */
  text?: string;
  /** Pre-escaped HTML for use with dangerouslySetInnerHTML. Mutually exclusive with `text`. */
  html?: string;
  /** Optional inline highlight rendered before text (positive=green, negative=red). */
  highlight?: {
    value: string;
    type: 'positive' | 'negative' | 'neutral';
  };
}

const getHighlightColor = (type: 'positive' | 'negative' | 'neutral') => {
  switch (type) {
    case 'positive': return EmailColors.semantic.positive;
    case 'negative': return EmailColors.semantic.negative;
    default: return EmailColors.text.body;
  }
};

/**
 * Single bullet row using the canonical 2-cell email-table hanging-indent pattern.
 * Bullet sits in a fixed-width cell; wrapped text aligns under the first text character.
 */
export function HangingBulletItem({ glyph = '•', text, html, highlight }: HangingBulletItemProps) {
  const hasContent = html ? html.trim().length > 0 : Boolean(text?.trim());
  if (!hasContent) return null;

  return (
    <table
      width="100%"
      cellPadding="0"
      cellSpacing="0"
      role="presentation"
      style={{ margin: '4px 0', borderCollapse: 'collapse' }}
    >
      <tbody>
        <tr>
          <td
            valign="top"
            width="16"
            style={{
              width: 16,
              padding: '4px 0',
              color: EmailColors.text.meta,
              fontSize: '14px',
              lineHeight: '1.5',
            }}
          >
            {glyph}
          </td>
          <td
            valign="top"
            style={{
              padding: '4px 0 4px 8px',
              fontSize: '14px',
              lineHeight: '1.5',
              wordBreak: 'break-word',
            }}
          >
            {html ? (
              <span dangerouslySetInnerHTML={{ __html: html }} />
            ) : highlight ? (
              <>
                <span
                  style={{
                    fontWeight: 600,
                    color: getHighlightColor(highlight.type),
                  }}
                >
                  {highlight.value}
                </span>
                {' '}
                <span style={{ color: EmailColors.text.body }}>{text}</span>
              </>
            ) : (
              <span style={{ color: EmailColors.text.body }}>{text}</span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Bullet list component for scannable content
 * Morning Brew style: clean bullets, highlighted values in green/red.
 * Wrapper preserves the existing <tr><td> shape so callers can drop this
 * inside their outer table without layout drift.
 */
export function BulletList({ items }: BulletListProps) {
  return (
    <tr>
      <td>
        {items.map((item, index) => (
          <HangingBulletItem
            key={index}
            text={item.text}
            highlight={item.highlight}
          />
        ))}
      </td>
    </tr>
  );
}

export default BulletList;
