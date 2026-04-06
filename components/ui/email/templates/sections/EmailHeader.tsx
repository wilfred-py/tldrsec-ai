import * as React from 'react';
import { EmailColors } from '../../design-system';

interface EmailHeaderProps {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string | Date;
  filerName?: string;
  filerRole?: string;
  dataQuality?: 'full' | 'partial' | 'extractor-only' | 'degraded';
}

/**
 * Minimalist email header component
 * Morning Brew style: clean headline, essential info only
 */
export function EmailHeader({
  ticker,
  companyName,
  filingType,
  filingDate,
  filerName,
  filerRole,
}: EmailHeaderProps) {
  const formattedDate = filingDate instanceof Date
    ? filingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date(filingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Show filer name if it's not the default fallback
  const hasFiler = filerName && filerName !== 'Insider';

  return (
    <table width="100%" cellPadding="0" cellSpacing="0">
      <tbody>
        {/* Logo row */}
        <tr>
          <td style={{
            padding: '20px 15px 16px',
            borderBottom: `1px solid ${EmailColors.structure.border}`,
          }}>
            <table width="100%" cellPadding="0" cellSpacing="0">
              <tbody>
                <tr>
                  <td>
                    <span style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: EmailColors.text.headline,
                    }}>
                      tldr<span style={{ color: '#0079F2' }}>SEC</span>
                    </span>
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

        {/* Headline row */}
        <tr>
          <td style={{ padding: '20px 15px 16px' }}>
            {/* Filing type badge */}
            <div style={{
              display: 'inline-block',
              padding: '3px 8px',
              backgroundColor: '#F3F4F6',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              color: EmailColors.text.meta,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.5px',
              marginBottom: '8px',
            }}>
              {filingType} {hasFiler ? '| Insider' : ''}
            </div>

            <h1 style={{
              margin: '0 0 4px 0',
              fontSize: '22px',
              fontWeight: 700,
              color: EmailColors.text.headline,
              lineHeight: '1.3',
            }}>
              {ticker}: {hasFiler ? filerName : companyName}
              {hasFiler && filerRole && (
                <span style={{
                  fontWeight: 400,
                  fontSize: '16px',
                  color: EmailColors.text.meta
                }}>, {filerRole}</span>
              )}
            </h1>

            <p style={{
              margin: '0',
              fontSize: '14px',
              color: EmailColors.text.meta,
            }}>
              {companyName}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default EmailHeader;
