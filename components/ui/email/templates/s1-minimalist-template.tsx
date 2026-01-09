import * as React from 'react';
import { EmailColors, getChangeStyle, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { SectionHeader } from './sections/SectionHeader';
import { FilingTemplateData } from '../../../../lib/email/types';

interface FormS1MinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Minimalist S-1 (IPO Registration) email template
 * Morning Brew style: clean, scannable, lead with key metrics
 *
 * Layout:
 * - Header: ticker, company name, IPO details
 * - Offering Details: size, price range, shares
 * - Financial Highlights: key pre-IPO metrics
 * - Use of Proceeds: where the money goes
 * - Risk Factors: top risks
 * - CTA: View full filing
 */
export function FormS1MinimalistTemplate({ filing }: FormS1MinimalistTemplateProps) {
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

  const offeringSize = rawData?.offeringSize as string | undefined;
  const priceRange = rawData?.priceRange as string | undefined;
  const sharesOffered = rawData?.sharesOffered as string | undefined;
  const businessDescription = rawData?.businessDescription as string | undefined;
  const exchangeListing = rawData?.exchangeListing as string | undefined;
  const expectedTradingDate = rawData?.expectedTradingDate as string | undefined;

  const useOfProceeds = rawData?.useOfProceeds as string[] | undefined;
  const financialHighlights = rawData?.financialHighlights as Array<{
    label: string;
    value: string | number;
    change?: string | number;
  }> | undefined;
  const riskFactors = rawData?.riskFactors as string[] | undefined;
  const underwriters = rawData?.underwriters as string[] | undefined;

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
        filingType={filingType || 'S-1'}
        filingDate={filingDate}
      />

      {/* Main content */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>
              {/* IPO Signal Banner */}
              <SectionCard>
                <tr>
                  <td style={{
                    padding: '16px',
                    backgroundColor: '#F5F3FF',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      backgroundColor: '#7C3AED',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '8px',
                    }}>
                      IPO Registration
                    </span>
                    {businessDescription && (
                      <p style={{
                        margin: '8px 0 0',
                        fontSize: '14px',
                        color: EmailColors.text.body,
                        lineHeight: '1.5',
                      }}>
                        {businessDescription}
                      </p>
                    )}
                  </td>
                </tr>
              </SectionCard>

              {/* Offering Details */}
              {(offeringSize || priceRange || sharesOffered) && (
                <SectionCard>
                  <SectionHeader emoji="💰" title="Offering Details" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {offeringSize && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Offering Size:
                                </span>
                                <span style={{ float: 'right', fontWeight: 600, color: '#059669' }}>
                                  {offeringSize}
                                </span>
                              </td>
                            </tr>
                          )}
                          {priceRange && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Price Range:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {priceRange}
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
                                borderBottom: exchangeListing ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
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
                          {exchangeListing && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: expectedTradingDate ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Exchange:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {exchangeListing}
                                </span>
                              </td>
                            </tr>
                          )}
                          {expectedTradingDate && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Expected Trading:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {expectedTradingDate}
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

              {/* Financial Highlights */}
              {financialHighlights && financialHighlights.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="📈" title="Financial Highlights" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {financialHighlights.map((item, index) => {
                            const changeStyle = getChangeStyle(item.change);
                            const arrow = getChangeArrow(item.change);
                            return (
                              <tr key={index}>
                                <td style={{
                                  padding: '4px 0',
                                  fontSize: '14px',
                                  lineHeight: '1.5',
                                  color: EmailColors.text.body,
                                }}>
                                  <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                                  <span style={{ fontWeight: 600 }}>{item.label}:</span>
                                  {' '}{item.value}
                                  {item.change && (
                                    <span style={{ ...changeStyle, marginLeft: '6px' }}>
                                      ({arrow}{item.change})
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
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

              {/* Underwriters */}
              {underwriters && underwriters.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="🏦" title="Underwriters" />
                  <tr>
                    <td>
                      <p style={{
                        margin: '0',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        color: EmailColors.text.body,
                      }}>
                        {underwriters.join(', ')}
                      </p>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Risk Factors */}
              {riskFactors && riskFactors.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="⚠️" title="Key Risks" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {riskFactors.slice(0, 3).map((risk, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '4px 0',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                                {risk}
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
        formType={filingType || 'S-1'}
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default FormS1MinimalistTemplate;
