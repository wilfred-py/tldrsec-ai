import * as React from 'react';
import { EmailColors } from '../design-system';
import { EmailFooter } from './sections/EmailFooter';

interface CampaignInviteTemplateProps {
  unsubscribeUrl: string;
  signupUrl?: string;
}

/**
 * Campaign Email 3: "Your Trial Is Ready"
 * Conversion email with clear CTA, FAQ section.
 * Design review: CTA above the fold, numbered list below, FAQ last.
 */
export function CampaignInviteTemplate({
  unsubscribeUrl,
  signupUrl = 'https://tldrsec.app/sign-up',
}: CampaignInviteTemplateProps) {
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
              <td><span style={{ fontSize: '18px', fontWeight: 700, color: '#000' }}>tldrSEC</span></td>
              <td style={{ textAlign: 'right' }}><span style={{ fontSize: '12px', color: EmailColors.text.meta }}>Early Access</span></td>
            </tr></tbody></table>
          </td>
        </tr>

        {/* Headline + Value + CTA (above the fold) */}
        <tr>
          <td style={{ padding: '24px 15px 8px' }}>
            <h1 style={{ margin: '0 0 12px', fontSize: '24px', fontWeight: 700, color: '#000', lineHeight: '1.3' }}>Your trial is ready.</h1>
            <p style={{ margin: 0, fontSize: '15px', color: EmailColors.text.body, lineHeight: '1.6' }}>
              You&apos;ve seen what our AI does with SEC filings. Now get it working for your portfolio.
            </p>
          </td>
        </tr>

        {/* CTA - above the fold per design review */}
        <tr>
          <td style={{ padding: '16px 15px 24px', textAlign: 'center' }}>
            <a href={signupUrl} style={{
              display: 'inline-block',
              padding: '16px 40px',
              backgroundColor: EmailColors.semantic.accent,
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 600,
            }}>
              Start Your 7-Day Free Trial
            </a>
          </td>
        </tr>

        {/* What you get (below the fold) */}
        <tr>
          <td style={{ padding: '0 15px 16px' }}>
            <div style={{ border: `1px solid ${EmailColors.structure.border}`, borderRadius: '15px', padding: '15px' }}>
              <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600, color: '#000' }}>When you sign up:</h2>
              <table width="100%" cellPadding="0" cellSpacing="0"><tbody>
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '14px', color: '#059669', verticalAlign: 'top', fontWeight: 700 }} width="24">1.</td>
                  <td style={{ padding: '8px 0 8px 8px', fontSize: '14px', color: EmailColors.text.body, lineHeight: '1.5' }}>Pick the companies you track from 2,000+ SEC-listed equities</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '14px', color: '#059669', verticalAlign: 'top', fontWeight: 700 }} width="24">2.</td>
                  <td style={{ padding: '8px 0 8px 8px', fontSize: '14px', color: EmailColors.text.body, lineHeight: '1.5' }}>Get an AI summary within minutes of every filing: 10-K, 10-Q, 8-K, Form 4, and more</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', fontSize: '14px', color: '#059669', verticalAlign: 'top', fontWeight: 700 }} width="24">3.</td>
                  <td style={{ padding: '8px 0 8px 8px', fontSize: '14px', color: EmailColors.text.body, lineHeight: '1.5' }}>Never miss an insider trade, earnings report, or material event again</td>
                </tr>
              </tbody></table>
            </div>
          </td>
        </tr>

        {/* FAQ */}
        <tr>
          <td style={{ padding: '0 15px 20px' }}>
            <div style={{ border: `1px solid ${EmailColors.structure.border}`, borderRadius: '15px', padding: '15px' }}>
              <h2 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#000', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>FAQ</h2>

              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#000' }}>What filing types do you cover?</p>
              <p style={{ margin: '0 0 14px', fontSize: '14px', color: EmailColors.text.body, lineHeight: '1.5' }}>
                All of them. 10-K, 10-Q, 8-K, Form 4, Form 144, DEF 14A, S-1, S-3, Schedule 13D/G, and more. If it&apos;s filed with the SEC, we summarize it.
              </p>

              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#000' }}>How fast are the summaries?</p>
              <p style={{ margin: '0 0 14px', fontSize: '14px', color: EmailColors.text.body, lineHeight: '1.5' }}>
                Within minutes of the filing appearing on EDGAR. Most arrive in your inbox in under 10 minutes.
              </p>

              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#000' }}>What if I don&apos;t like it?</p>
              <p style={{ margin: 0, fontSize: '14px', color: EmailColors.text.body, lineHeight: '1.5' }}>
                Cancel before day 7 and you pay nothing. No questions asked.
              </p>
            </div>
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

export default CampaignInviteTemplate;
