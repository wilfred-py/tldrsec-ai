import * as React from 'react';
import { EmailColors } from '../../design-system';
import { getSecFilingViewerUrl } from '../../../../../lib/email/url-utils';

interface EmailFooterProps {
  filingUrl: string;
  formType?: string;
  unsubscribeUrl?: string;
}

/**
 * Minimalist email footer component
 * Morning Brew style: clean CTA, simple footer links
 */
export function EmailFooter({ filingUrl, formType, unsubscribeUrl }: EmailFooterProps) {
  // Convert index URLs to EDGAR Filing Viewer URLs for better user experience
  // Pass formType for smart XML URL construction (stylesheet injection)
  const viewerUrl = filingUrl ? getSecFilingViewerUrl(filingUrl, formType) : '';

  return (
    <table width="100%" cellPadding="0" cellSpacing="0">
      <tbody>
        {/* CTA button - only show when there's a real filing URL */}
        {viewerUrl && (
        <tr>
          <td style={{
            padding: '20px 15px',
            textAlign: 'center',
            borderTop: `1px solid ${EmailColors.structure.border}`,
          }}>
            <a
              href={viewerUrl}
              style={{
                display: 'inline-block',
                padding: '16px 24px',
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
        )}

        {/* Footer */}
        <tr>
          <td style={{
            padding: '16px 15px 24px',
            textAlign: 'center',
          }}>
            <p style={{
              margin: '0',
              fontSize: '12px',
              color: EmailColors.text.meta,
            }}>
              tldrSEC | AI-Powered SEC Filing Summaries
            </p>
            {unsubscribeUrl && (
              <p style={{
                margin: '8px 0 0',
                fontSize: '12px',
                color: '#6B7280',
              }}>
                <a href={unsubscribeUrl} style={{ color: '#6B7280', textDecoration: 'underline' }}>
                  Unsubscribe
                </a>
              </p>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default EmailFooter;
