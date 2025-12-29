import * as React from 'react';
import { EmailColors, getChangeStyle, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { SectionHeader } from './sections/SectionHeader';
import { FilingTemplateData } from '../../../../lib/email/types';

interface Form10KMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Minimalist 10-K email template
 * Morning Brew style: clean, scannable, lead with key metrics
 *
 * Layout:
 * - Header: ticker, company name, fiscal year
 * - Financial Highlights: bullet points with YoY changes
 * - Segment Performance: inline data
 * - Key Risks: bullet points
 * - CTA: View full filing
 */
export function Form10KMinimalistTemplate({ filing }: Form10KMinimalistTemplateProps) {
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

  // Extract structured data if available (from AI summaryJSON)
  const rawData = summaryData as Record<string, unknown> | undefined;

  // Try to extract financial data from various possible structures
  const financialHighlights = rawData?.financialHighlights as Array<{
    label: string;
    value: string | number;
    change?: string | number;
  }> | undefined;

  const keyPoints = rawData?.keyPoints as string[] | undefined;
  const riskFactors = rawData?.riskFactors as string[] | undefined;
  const segments = rawData?.segments as Array<{
    name: string;
    revenue: string | number;
    growth: string | number;
  }> | undefined;

  // Extract simple summary if available
  const _parsedContent = rawData?.parsedContent as Record<string, unknown> | undefined;

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
      />

      {/* Main content */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>
              {/* Financial Highlights Section */}
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

              {/* Key Points Section (if no structured financial data) */}
              {keyPoints && keyPoints.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="📊" title="Key Takeaways" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {keyPoints.slice(0, 5).map((point, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '4px 0',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                                {point}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Segment Performance */}
              {segments && segments.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="📊" title="Segment Performance" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {segments.map((segment, index) => {
                            const changeStyle = getChangeStyle(segment.growth);
                            const arrow = getChangeArrow(segment.growth);
                            return (
                              <tr key={index}>
                                <td style={{
                                  padding: '8px 0',
                                  fontSize: '14px',
                                  color: EmailColors.text.body,
                                  borderTop: index > 0 ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                                }}>
                                  <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                    {segment.name}:
                                  </span>
                                  <span style={{ float: 'right' }}>
                                    {segment.revenue}
                                    <span style={{ ...changeStyle, marginLeft: '6px' }}>
                                      ({arrow}{segment.growth})
                                    </span>
                                  </span>
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

              {/* Summary Text (always show as fallback) */}
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
        formType={filingType || '10-K'}
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default Form10KMinimalistTemplate;
