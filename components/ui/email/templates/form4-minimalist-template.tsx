import * as React from 'react';
import { EmailColors, formatCurrency, formatNumber, formatPercent, getChangeStyle, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { SectionHeader } from './sections/SectionHeader';
import { FilingTemplateData } from '../../../../lib/email/types';

interface Form4MinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Minimalist Form 4 email template
 * Morning Brew style: clean, scannable, lead with the punchline
 *
 * Layout:
 * - Header: ticker, filer name, role
 * - Key Transaction: bullet points with highlighted values
 * - Holdings Summary: inline data (not tables)
 * - CTA: View full filing
 */
export function Form4MinimalistTemplate({ filing }: Form4MinimalistTemplateProps) {
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

  // Extract data from summaryData if available
  const filerName = summaryData?.reportingPerson || 'Insider';
  const filerRole = summaryData?.position || '';
  const totalValue = summaryData?.totalValue || '';
  const percentChange = summaryData?.changePercent || summaryData?.percentOwnership || '';
  const changeDirection = summaryData?.changeDirection;
  const transactionType = summaryData?.transactionType || '';
  const sharesAmount = summaryData?.shareAmount || summaryData?.amount || '';
  const priceRange = summaryData?.priceRange || summaryData?.price || '';
  const tradingPlan = summaryData?.tradingPlan || '';
  const sharesOwned = summaryData?.sharesOwned || '';
  const sharesRemaining = summaryData?.sharesRemaining || '';

  // Determine if this is a buy or sell
  const isSale = transactionType?.toLowerCase().includes('sale') ||
    transactionType?.toLowerCase().includes('sell') ||
    changeDirection === 'decrease';

  const displayTicker = symbol || ticker || 'N/A';

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
        filingType={filingType}
        filingDate={filingDate}
        filerName={typeof filerName === 'string' ? filerName : undefined}
        filerRole={typeof filerRole === 'string' ? filerRole : undefined}
      />

      {/* Main content */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>
              {/* Key Transaction Section */}
              <SectionCard>
                <SectionHeader emoji="📊" title="Key Transaction" />
                <tr>
                  <td>
                    <table width="100%" cellPadding="0" cellSpacing="0">
                      <tbody>
                        {/* Lead with the punchline - total value */}
                        {totalValue && (
                          <tr>
                            <td style={{
                              padding: '4px 0',
                              fontSize: '14px',
                              lineHeight: '1.5',
                              color: EmailColors.text.body,
                            }}>
                              <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                              <span style={{
                                fontWeight: 600,
                                color: isSale ? EmailColors.semantic.negative : EmailColors.semantic.positive,
                              }}>
                                {isSale ? 'Sold' : 'Acquired'} {totalValue}
                              </span>
                              {' '}in {displayTicker} stock
                            </td>
                          </tr>
                        )}

                        {/* Shares and price */}
                        {sharesAmount && (
                          <tr>
                            <td style={{
                              padding: '4px 0',
                              fontSize: '14px',
                              lineHeight: '1.5',
                              color: EmailColors.text.body,
                            }}>
                              <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                              <span style={{ fontWeight: 600 }}>
                                {sharesAmount} shares
                              </span>
                              {priceRange && ` at ${priceRange}`}
                            </td>
                          </tr>
                        )}

                        {/* Percentage change */}
                        {percentChange && (
                          <tr>
                            <td style={{
                              padding: '4px 0',
                              fontSize: '14px',
                              lineHeight: '1.5',
                              color: EmailColors.text.body,
                            }}>
                              <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                              <span style={{
                                fontWeight: 600,
                                color: changeDirection === 'decrease' ? EmailColors.semantic.negative : EmailColors.semantic.positive,
                              }}>
                                {changeDirection === 'decrease' ? '' : '+'}{percentChange}
                              </span>
                              {' '}change in holdings
                            </td>
                          </tr>
                        )}

                        {/* Trading plan note */}
                        {tradingPlan && (
                          <tr>
                            <td style={{
                              padding: '4px 0',
                              fontSize: '14px',
                              lineHeight: '1.5',
                              color: EmailColors.text.meta,
                            }}>
                              <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                              {tradingPlan}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </SectionCard>

              {/* Holdings Summary */}
              {(sharesOwned || sharesRemaining) && (
                <SectionCard>
                  <SectionHeader emoji="💼" title="Holdings After Transaction" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {sharesOwned && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ color: EmailColors.text.meta }}>Direct ownership:</span>
                                <span style={{
                                  float: 'right',
                                  fontWeight: 600,
                                  color: EmailColors.text.headline,
                                }}>
                                  {sharesOwned} shares
                                </span>
                              </td>
                            </tr>
                          )}
                          {sharesRemaining && sharesRemaining !== sharesOwned && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderTop: `1px solid ${EmailColors.structure.borderLight}`,
                              }}>
                                <span style={{ color: EmailColors.text.meta }}>Total remaining:</span>
                                <span style={{
                                  float: 'right',
                                  fontWeight: 600,
                                  color: EmailColors.text.headline,
                                }}>
                                  {sharesRemaining} shares
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

              {/* Summary Text */}
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
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default Form4MinimalistTemplate;
