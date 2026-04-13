import * as React from 'react';
import { EmailColors, EmailStyles, EMAIL_LOGO_URL, EMAIL_LOGO_WIDTH, EMAIL_LOGO_HEIGHT } from '../../design-system';

/**
 * Default category labels for the filing type badge.
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
}

/**
 * Simplified email header — logo, date, category badge, company meta
 * The h1 headline is removed; the lead sentence in the template body replaces it.
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

        {/* Category badge + company meta */}
        <tr>
          <td style={{ padding: '16px 15px 12px' }}>
            <div style={EmailStyles.categoryBadge}>
              {displayType} | {category}
            </div>

            <p style={{
              margin: '8px 0 0',
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

export default EmailHeader;
