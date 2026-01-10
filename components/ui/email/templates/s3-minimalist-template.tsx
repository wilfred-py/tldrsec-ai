import * as React from 'react';
import { EmailColors, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { SectionHeader } from './sections/SectionHeader';
import { FilingTemplateData } from '../../../../lib/email/types';

interface FormS3MinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Minimalist S-3 (Secondary Offering) email template
 * Morning Brew style: clean, scannable, lead with key metrics
 *
 * Layout:
 * - Header: ticker, company name, offering type
 * - Offering Details: amount, dilution impact
 * - Shelf Registration: if applicable
 * - Selling Shareholders: who's selling
 * - Use of Proceeds: where the money goes
 * - CTA: View full filing
 */
export function FormS3MinimalistTemplate({ filing }: FormS3MinimalistTemplateProps) {
  const {
    companyName,
    symbol,
    ticker,
    filingType,
    filingDate,
    filingUrl,
    summaryText,
    summaryData,
  } = filing;

  const displayTicker = symbol || ticker || 'N/A';

  // Extract structured data if available
  const rawData = summaryData as Record<string, unknown> | undefined;

  const offeringType = rawData?.offeringType as string | undefined;
  const offeringAmount = rawData?.offeringAmount as string | undefined;
  const sharesOffered = rawData?.sharesOffered as string | undefined;
  const dilutionImpact = rawData?.dilutionImpact as string | undefined;
  const pricePerShare = rawData?.pricePerShare as string | undefined;

  const sellingShareholders = rawData?.sellingShareholders as Array<{
    name: string;
    shares: string;
  }> | undefined;

  const shelfRegistration = rawData?.shelfRegistration as {
    totalAuthorized?: string;
    remainingCapacity?: string;
    expirationDate?: string;
  } | undefined;

  const useOfProceeds = rawData?.useOfProceeds as string[] | undefined;

  // Determine signal color based on offering type
  const getOfferingTypeColor = (type: string | undefined) => {
    if (!type) return { bg: '#F3F4F6', text: '#374151' };
    const lowerType = type.toLowerCase();
    if (lowerType.includes('shelf')) return { bg: '#DBEAFE', text: '#1D4ED8' }; // Blue for shelf
    if (lowerType.includes('atm') || lowerType.includes('at-the-market')) return { bg: '#FEF3C7', text: '#B45309' }; // Yellow for ATM
    if (lowerType.includes('secondary')) return { bg: '#FEE2E2', text: '#B91C1C' }; // Red for secondary (dilution)
    return { bg: '#ECFDF5', text: '#059669' }; // Green for primary
  };

  const typeColors = getOfferingTypeColor(offeringType);

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: EmailColors.structure.background,
      color: EmailColors.text.body,
    }}>
      {/* Header */}
      <EmailHeader
        ticker={displayTicker}
        companyName={companyName}
        filingType={filingType || 'S-3'}
        filingDate={filingDate}
      />

      {/* Main content */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>
              {/* Offering Type Signal Banner */}
              <SectionCard>
                <tr>
                  <td style={{
                    padding: '16px',
                    backgroundColor: typeColors.bg,
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      backgroundColor: typeColors.text,
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {offeringType || 'Secondary Offering'}
                    </span>
                    {dilutionImpact && (
                      <p style={{
                        margin: '12px 0 0',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#B91C1C',
                      }}>
                        Dilution Impact: {dilutionImpact}
                      </p>
                    )}
                  </td>
                </tr>
              </SectionCard>

              {/* Offering Details */}
              {(offeringAmount || sharesOffered || pricePerShare) && (
                <SectionCard>
                  <SectionHeader emoji="💰" title="Offering Details" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {offeringAmount && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Offering Amount:
                                </span>
                                <span style={{ float: 'right', fontWeight: 600, color: '#059669' }}>
                                  {offeringAmount}
                                </span>
                              </td>
                            </tr>
                          )}
                          {sharesOffered && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: pricePerShare ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Shares Offered:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {sharesOffered}
                                </span>
                              </td>
                            </tr>
                          )}
                          {pricePerShare && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Price Per Share:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {pricePerShare}
                                </span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Shelf Registration Details */}
              {shelfRegistration && (shelfRegistration.totalAuthorized || shelfRegistration.remainingCapacity) && (
                <SectionCard>
                  <SectionHeader emoji="📋" title="Shelf Registration" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {shelfRegistration.totalAuthorized && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Total Authorized:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {shelfRegistration.totalAuthorized}
                                </span>
                              </td>
                            </tr>
                          )}
                          {shelfRegistration.remainingCapacity && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: shelfRegistration.expirationDate ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Remaining Capacity:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {shelfRegistration.remainingCapacity}
                                </span>
                              </td>
                            </tr>
                          )}
                          {shelfRegistration.expirationDate && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Expiration:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {shelfRegistration.expirationDate}
                                </span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Selling Shareholders */}
              {sellingShareholders && sellingShareholders.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="👥" title="Selling Shareholders" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {sellingShareholders.slice(0, 5).map((holder, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: index < sellingShareholders.length - 1 ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  {holder.name}:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {holder.shares}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Use of Proceeds */}
              {useOfProceeds && useOfProceeds.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="💼" title="Use of Proceeds" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {useOfProceeds.slice(0, 4).map((item, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '4px 0',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                                {item}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Summary Text (fallback) */}
              {summaryText && (
                <SectionCard>
                  <SectionHeader emoji="📝" title="Summary" />
                  <tr>
                    <td
                      style={{
                        fontSize: '14px',
                        lineHeight: '1.6',
                        color: EmailColors.text.body,
                      }}
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(summaryText) }}
                    />
                  </tr>
                </SectionCard>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || 'S-3'}
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default FormS3MinimalistTemplate;
