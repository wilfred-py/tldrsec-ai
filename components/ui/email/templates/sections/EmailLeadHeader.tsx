import * as React from 'react';
import {
  EmailColors,
  EmailStyles,
  EMAIL_LOGO_URL,
  EMAIL_LOGO_WIDTH,
  EMAIL_LOGO_HEIGHT,
  capHeadline,
  ensureTickerPrefix,
} from '../../design-system';

interface EmailLeadHeaderProps {
  ticker: string;
  companyName: string;
  filingDate: string | Date;
  headline: string;
  filerName?: string;
  filerRole?: string;
  headlineMaxChars?: number;
}

/**
 * Lead-with-headline header for filing notification emails.
 *
 * Layout (top to bottom):
 *   1. Logo + date row
 *   2. Headline (lead sentence) — capped, ticker-prefixed if missing
 *   3. Ticker · Company · Filer line
 *
 * The form-type and materiality badges are NOT rendered here; templates
 * render them via <FormPlusMaterialityBadgeRow /> below this header so the
 * reader sees the headline before the badge cluster.
 *
 * The bare <EmailHeader /> remains in use by campaign-demo-template.tsx
 * and other marketing emails — do not consolidate.
 */
export function EmailLeadHeader({
  ticker,
  companyName,
  filingDate,
  headline,
  filerName,
  filerRole,
  headlineMaxChars = 90,
}: EmailLeadHeaderProps) {
  const formattedDate = filingDate instanceof Date
    ? filingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date(filingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const hasFiler = filerName && filerName !== 'Insider';

  const safeHeadline = capHeadline(ensureTickerPrefix(headline, ticker), headlineMaxChars);

  return (
    <table width="100%" cellPadding="0" cellSpacing="0">
      <tbody>
        {/* Logo + date row */}
        <tr>
          <td style={{
            padding: '20px 15px 16px',
            borderBottom: `1px solid ${EmailColors.structure.border}`,
          }}>
            <table width="100%" cellPadding="0" cellSpacing="0">
              <tbody>
                <tr>
                  <td>
                    <img
                      src={EMAIL_LOGO_URL}
                      alt="tldrSEC"
                      width={EMAIL_LOGO_WIDTH}
                      height={EMAIL_LOGO_HEIGHT}
                      style={{
                        display: 'block',
                        width: `${EMAIL_LOGO_WIDTH}px`,
                        height: `${EMAIL_LOGO_HEIGHT}px`,
                        border: '0',
                        fontSize: '18px',
                        fontWeight: 700,
                        color: EmailColors.text.headline,
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: '12px',
                      color: EmailColors.text.meta,
                    }}>
                      {formattedDate}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>

        {/* Headline (lead sentence) */}
        {safeHeadline && (
          <tr>
            <td style={{ padding: '16px 15px 8px' }}>
              <h1 style={EmailStyles.leadSentence}>
                {safeHeadline}
              </h1>
            </td>
          </tr>
        )}

        {/* Ticker · Company · Filer line */}
        <tr>
          <td style={{ padding: '0 15px 12px' }}>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: EmailColors.text.meta,
            }}>
              {ticker} · {companyName}
              {hasFiler && (
                <span> · {filerName}{filerRole ? `, ${filerRole}` : ''}</span>
              )}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default EmailLeadHeader;
