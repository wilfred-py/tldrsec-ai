import * as React from 'react';
import { EmailColors, EMAIL_PREFERENCES_URL, EMAIL_LANDING_URL } from '../../design-system';
import { getSecFilingViewerUrl, type WhyItMattersUtmVariant } from '../../../../../lib/email/url-utils';

interface EmailFooterProps {
  filingUrl: string;
  formType?: string;
  utmVariant?: WhyItMattersUtmVariant;
  /**
   * When `marketingCta` is true (per v12 PR1-polish), the CTA button reads
   * "Want more filings like this?" and links to the landing page instead of
   * the SEC filing. Used for the consolidated 10-K / 10-Q earnings emails,
   * where the SEC link is rendered separately above the materiality
   * rationale block.
   */
  marketingCta?: boolean;
}

/**
 * Minimalist email footer component
 * CTA button + preferences link (always shown)
 */
export function EmailFooter({ filingUrl, formType, utmVariant, marketingCta }: EmailFooterProps) {
  const viewerUrl = filingUrl
    ? getSecFilingViewerUrl(filingUrl, formType, utmVariant ? { variant: utmVariant } : undefined)
    : '';

  const ctaUrl = marketingCta ? EMAIL_LANDING_URL : viewerUrl;
  const ctaText = marketingCta ? 'Want more filings like this?' : 'View Full Filing on SEC.gov';

  return (
    <table width="100%" cellPadding="0" cellSpacing="0">
      <tbody>
        {/* CTA button - only show when there's a real CTA URL */}
        {ctaUrl && (
        <tr>
          <td style={{
            padding: '20px 15px',
            textAlign: 'center',
            borderTop: `1px solid ${EmailColors.structure.border}`,
          }}>
            <a
              href={ctaUrl}
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
              {ctaText}
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
