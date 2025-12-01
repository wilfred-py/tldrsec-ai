import * as React from 'react';
import { EmailColors } from '../../design-system';

interface EmailFooterProps {
  filingUrl: string;
  unsubscribeUrl?: string;
}

/**
 * Minimalist email footer component
 * Morning Brew style: clean CTA, simple footer links
 */
export function EmailFooter({ filingUrl, unsubscribeUrl }: EmailFooterProps) {
  return (
    <table width="100%" cellPadding="0" cellSpacing="0">
      <tbody>
        {/* CTA button */}
        <tr>
          <td style={{
            padding: '20px 15px',
            textAlign: 'center',
            borderTop: `1px solid ${EmailColors.structure.border}`,
          }}>
            <a
              href={filingUrl}
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
              View Full Filing on SEC.gov
            </a>
          </td>
        </tr>

        {/* Footer links */}
        <tr>
          <td style={{
            padding: '16px 15px 24px',
            textAlign: 'center',
          }}>
            <p style={{
              margin: '0 0 8px 0',
              fontSize: '12px',
              color: EmailColors.text.meta,
            }}>
              tldrSEC | AI-Powered SEC Filing Summaries
            </p>
            {unsubscribeUrl && (
              <a
                href={unsubscribeUrl}
                style={{
                  fontSize: '12px',
                  color: EmailColors.text.muted,
                  textDecoration: 'underline',
                }}
              >
                Manage notification preferences
              </a>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default EmailFooter;
