import * as React from 'react';
import { EmailColors, EMAIL_LOGO_URL, EMAIL_LOGO_WIDTH, EMAIL_LOGO_HEIGHT } from '../../design-system';

/**
 * Default category labels for the filing type badge.
 * Maps normalized (uppercased) filing types to short, human-readable categories.
 * Templates can override via the `filingCategory` prop for dynamic values.
 */
const DEFAULT_CATEGORY_MAP: Record<string, string> = {
  '4': 'Insider',
  'FORM 4': 'Insider',
  'FORM4': 'Insider',
  '10-K': 'Annual',
  '10K': 'Annual',
  '10-Q': 'Quarterly',
  '10Q': 'Quarterly',
  '8-K': 'Current Report',
  '8K': 'Current Report',
  'FORM 8-K': 'Current Report',
  'FORM8-K': 'Current Report',
  '144': 'Sale Notice',
  'FORM 144': 'Sale Notice',
  'FORM144': 'Sale Notice',
  'DEF 14A': 'Proxy',
  'S-1': 'IPO',
  'S-3': 'Offering',
  '11-K': 'Employee Plan',
};

interface EmailHeaderProps {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string | Date;
  filerName?: string;
  filerRole?: string;
  filingCategory?: string;
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
  filingCategory,
}: EmailHeaderProps) {
  const formattedDate = filingDate instanceof Date
    ? filingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date(filingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Show filer name if it's not the default fallback
  const hasFiler = filerName && filerName !== 'Insider';

  const displayType = filingType || 'SEC';
  const category = filingCategory
    || DEFAULT_CATEGORY_MAP[displayType.toUpperCase().trim()]
    || 'Filing';

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
              {displayType} | {category}
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
