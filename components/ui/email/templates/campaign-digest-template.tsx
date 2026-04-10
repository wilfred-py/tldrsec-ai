import * as React from 'react';
import { EmailColors, EMAIL_LOGO_URL, EMAIL_LOGO_WIDTH, EMAIL_LOGO_HEIGHT } from '../design-system';
import { EmailFooter } from './sections/EmailFooter';

interface FilingSummaryItem {
  ticker: string;
  companyName: string;
  filingType: string;
  filingTypeLabel: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  headline: string;
  excerpt: string;
}

interface CampaignDigestTemplateProps {
  weekLabel: string;
  filings: FilingSummaryItem[];
  unsubscribeUrl: string;
  landingPageUrl?: string;
}

const importanceBadge = {
  critical: { bg: '#FEE2E2', color: '#991B1B', label: 'CRITICAL' },
  high: { bg: '#FEE2E2', color: '#991B1B', label: 'HIGH' },
  medium: { bg: '#FEF3C7', color: '#92400E', label: 'MEDIUM' },
  low: { bg: '#F3F4F6', color: '#4B5563', label: 'LOW' },
};

/**
 * Campaign Email 2: "What You Missed This Week"
 * Shows 3-4 real filing summaries with soft CTA.
 */
export function CampaignDigestTemplate({
  weekLabel,
  filings,
  unsubscribeUrl,
  landingPageUrl = 'https://tldrsec.app',
}: CampaignDigestTemplateProps) {
  return (
    <table width="100%" cellPadding="0" cellSpacing="0" style={{
      maxWidth: '600px',
      width: '100%',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: '#ffffff',
    }}>
      <tbody>
        {/* Header */}
        <tr>
          <td style={{ padding: '20px 15px 16px', borderBottom: `1px solid ${EmailColors.structure.border}` }}>
            <table width="100%" cellPadding="0" cellSpacing="0"><tbody><tr>
              <td><img src={EMAIL_LOGO_URL} alt="tldrSEC" width={EMAIL_LOGO_WIDTH} height={EMAIL_LOGO_HEIGHT} style={{ display: 'block', width: `${EMAIL_LOGO_WIDTH}px`, height: `${EMAIL_LOGO_HEIGHT}px`, border: '0', fontSize: '18px', fontWeight: 700, color: '#000' }} /></td>
              <td style={{ textAlign: 'right' }}><span style={{ fontSize: '12px', color: EmailColors.text.meta }}>Weekly Intelligence</span></td>
            </tr></tbody></table>
          </td>
        </tr>

        {/* Headline */}
        <tr>
          <td style={{ padding: '20px 15px 8px' }}>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#000', lineHeight: '1.3' }}>
              {filings.length} SEC Filings You Should Know About
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: '14px', color: EmailColors.text.meta }}>{weekLabel}</p>
          </td>
        </tr>

        {/* Filing Cards */}
        {filings.map((filing, idx) => {
          const badge = importanceBadge[filing.importance];
          return (
            <tr key={idx}>
              <td style={{ padding: idx === 0 ? '12px 15px' : '4px 15px 12px' }}>
                <div style={{ border: `1px solid ${EmailColors.structure.border}`, borderRadius: '15px', padding: '15px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <table cellPadding="0" cellSpacing="0" style={{ display: 'inline' }}><tbody><tr>
                      <td style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.3px', marginRight: '6px' }} bgcolor={badge.bg}>
                        <span style={{ color: badge.color }}>{badge.label}</span>
                      </td>
                      <td style={{ paddingLeft: '6px', fontSize: '11px', fontWeight: 600, color: EmailColors.text.meta, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                        {filing.filingTypeLabel}
                      </td>
                    </tr></tbody></table>
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 600, color: '#000' }}>{filing.headline}</h3>
                  <p style={{ margin: 0, fontSize: '14px', color: EmailColors.text.body, lineHeight: '1.5' }}>{filing.excerpt}</p>
                </div>
              </td>
            </tr>
          );
        })}

        {/* Soft CTA */}
        <tr>
          <td style={{ padding: '8px 15px 20px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: '15px', color: EmailColors.text.body }}>Want these delivered automatically?</p>
            <a href={landingPageUrl} style={{
              display: 'inline-block',
              padding: '14px 28px',
              backgroundColor: EmailColors.semantic.accent,
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
            }}>
              Get Early Access
            </a>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#9CA3AF' }}>
              We&apos;re opening access to waitlist members first.
            </p>
          </td>
        </tr>

        {/* Footer with unsubscribe */}
        <tr>
          <td>
            <EmailFooter filingUrl="" unsubscribeUrl={unsubscribeUrl} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default CampaignDigestTemplate;
