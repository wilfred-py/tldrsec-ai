import * as React from 'react';
import { EmailColors, EMAIL_PREFERENCES_URL } from '../../design-system';
import { getSecFilingViewerUrl } from '../../../../../lib/email/url-utils';

interface EmailFooterProps {
  filingUrl: string;
  formType?: string;
}

/**
 * Minimalist email footer component
 * CTA button + preferences link (always shown)
 */
export function EmailFooter({ filingUrl, formType }: EmailFooterProps) {
  // Convert index URLs to EDGAR Filing Viewer URLs for better user experience
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
            <p style={{
              margin: '8px 0 0',
              fontSize: '12px',
              color: '#6B7280',
            }}>
              <a href={EMAIL_PREFERENCES_URL} style={{ color: '#6B7280', textDecoration: 'underline' }}>
                Manage preferences through your dashboard
              </a>
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default EmailFooter;
