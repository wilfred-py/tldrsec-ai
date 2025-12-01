import * as React from 'react';
import { EmailColors } from '../../design-system';

interface CTAButtonProps {
  href: string;
  text: string;
  secondary?: boolean;
}

/**
 * Call-to-action button component
 * Morning Brew style: clean button, minimal use of accent color
 */
export function CTAButton({ href, text, secondary }: CTAButtonProps) {
  if (secondary) {
    return (
      <tr>
        <td style={{ padding: '16px 0', textAlign: 'center' }}>
          <a
            href={href}
            style={{
              color: EmailColors.text.meta,
              fontSize: '12px',
              textDecoration: 'underline',
            }}
          >
            {text}
          </a>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={{ padding: '16px 0', textAlign: 'center' }}>
        <a
          href={href}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: EmailColors.semantic.accent,
            color: '#ffffff',
            textDecoration: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {text}
        </a>
      </td>
    </tr>
  );
}

export default CTAButton;
