import * as React from 'react';
import { EmailColors, getChangeStyle, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { SectionHeader } from './sections/SectionHeader';
import { FilingTemplateData } from '../../../../lib/email/types';

interface Form10QMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Minimalist 10-Q email template
 * Morning Brew style: clean, scannable, emphasize quarterly trends
 *
 * Layout:
 * - Header: ticker, company name, quarter
 * - Quarterly Highlights: bullet points with QoQ and YoY changes
 * - Guidance Updates: if available
 * - Key Risks/Concerns: bullet points
 * - CTA: View full filing
 */
export function Form10QMinimalistTemplate({ filing }: Form10QMinimalistTemplateProps) {
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
    qoqChange?: string | number;
  }> | undefined;

  const keyPoints = rawData?.keyPoints as string[] | undefined;
  const riskFactors = rawData?.riskFactors as string[] | undefined;
  const guidanceUpdates = rawData?.guidanceUpdates as string[] | undefined;
  const quarterlyTrends = rawData?.quarterlyTrends as Array<{
    metric: string;
    q1?: string | number;
    q2?: string | number;
    q3?: string | number;
    q4?: string | number;
    current: string | number;
    trend: 'up' | 'down' | 'flat';
  }> | undefined;

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
              {/* Quarterly Highlights Section */}
              {financialHighlights && financialHighlights.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="📊" title="Quarterly Highlights" />
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
                                      ({arrow}{item.change} YoY)
                                    </span>
                                  )}
                                  {item.qoqChange && (
                                    <span style={{
                                      ...getChangeStyle(item.qoqChange),
                                      marginLeft: '6px',
                                      fontSize: '12px',
                                    }}>
                                      ({getChangeArrow(item.qoqChange)}{item.qoqChange} QoQ)
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
                  <SectionHeader emoji="📈" title="Key Takeaways" />
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

              {/* Quarterly Trends */}
              {quarterlyTrends && quarterlyTrends.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="📉" title="Quarterly Trend" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {quarterlyTrends.map((trend, index) => {
                            const trendStyle = trend.trend === 'up'
                              ? EmailColors.semantic.positive
                              : trend.trend === 'down'
                              ? EmailColors.semantic.negative
                              : EmailColors.text.meta;
                            const trendArrow = trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '→';

                            return (
                              <tr key={index}>
                                <td style={{
                                  padding: '8px 0',
                                  fontSize: '14px',
                                  color: EmailColors.text.body,
                                  borderTop: index > 0 ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                                }}>
                                  <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                    {trend.metric}:
                                  </span>
                                  <span style={{ float: 'right' }}>
                                    {trend.current}
                                    <span style={{ color: trendStyle, marginLeft: '6px' }}>
                                      {trendArrow}
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

              {/* Guidance Updates */}
              {guidanceUpdates && guidanceUpdates.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="🎯" title="Guidance Updates" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {guidanceUpdates.map((update, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '4px 0',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                                {update}
                              </td>
                            </tr>
                          ))}
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
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default Form10QMinimalistTemplate;
