import * as React from 'react';
import { EmailColors, getChangeStyle, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { SectionHeader } from './sections/SectionHeader';
import { FilingTemplateData } from '../../../../lib/email/types';

interface Form11KMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Minimalist 11-K (Employee Stock Plan) email template
 * Morning Brew style: clean, scannable, lead with key metrics
 *
 * Layout:
 * - Header: company name, plan name
 * - Plan Overview: assets, participants, fiscal year
 * - Contributions & Distributions: money flow
 * - Investment Options: top holdings
 * - CTA: View full filing
 */
export function Form11KMinimalistTemplate({ filing }: Form11KMinimalistTemplateProps) {
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

  const planName = rawData?.planName as string | undefined;
  const planFiscalYear = rawData?.planFiscalYear as string | undefined;
  const planAssets = rawData?.planAssets as string | undefined;
  const netAssetsChange = rawData?.netAssetsChange as string | undefined;
  const participantCount = rawData?.participantCount as string | undefined;
  const contributionsReceived = rawData?.contributionsReceived as string | undefined;
  const employerContributions = rawData?.employerContributions as string | undefined;
  const benefitsDistributed = rawData?.benefitsDistributed as string | undefined;
  const companyStockHoldings = rawData?.companyStockHoldings as string | undefined;
  const planType = rawData?.planType as string | undefined;

  const investmentOptions = rawData?.investmentOptions as Array<{
    name: string;
    allocation?: string;
    return?: string;
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
        filingType={filingType || '11-K'}
        filingDate={filingDate}
      />

      {/* Main content */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>
              {/* Plan Signal Banner */}
              <SectionCard>
                <tr>
                  <td style={{
                    padding: '16px',
                    backgroundColor: '#F0FDF4',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      backgroundColor: '#059669',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {planType || 'Employee Benefit Plan'}
                    </span>
                    {planName && (
                      <p style={{
                        margin: '12px 0 0',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: EmailColors.text.headline,
                      }}>
                        {planName}
                      </p>
                    )}
                    {planFiscalYear && (
                      <p style={{
                        margin: '4px 0 0',
                        fontSize: '13px',
                        color: EmailColors.text.meta,
                      }}>
                        Fiscal Year: {planFiscalYear}
                      </p>
                    )}
                  </td>
                </tr>
              </SectionCard>

              {/* Plan Overview */}
              {(planAssets || participantCount) && (
                <SectionCard>
                  <SectionHeader emoji="📊" title="Plan Overview" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {planAssets && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Total Plan Assets:
                                </span>
                                <span style={{ float: 'right', fontWeight: 600, color: '#059669' }}>
                                  {planAssets}
                                </span>
                              </td>
                            </tr>
                          )}
                          {netAssetsChange && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: participantCount ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Net Assets Change:
                                </span>
                                <span style={{
                                  float: 'right',
                                  ...getChangeStyle(netAssetsChange),
                                }}>
                                  {getChangeArrow(netAssetsChange)}{netAssetsChange}
                                </span>
                              </td>
                            </tr>
                          )}
                          {participantCount && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: companyStockHoldings ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Participants:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {participantCount}
                                </span>
                              </td>
                            </tr>
                          )}
                          {companyStockHoldings && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Company Stock Holdings:
                                </span>
                                <span style={{ float: 'right' }}>
                                  {companyStockHoldings}
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

              {/* Contributions & Distributions */}
              {(contributionsReceived || employerContributions || benefitsDistributed) && (
                <SectionCard>
                  <SectionHeader emoji="💵" title="Contributions & Distributions" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {contributionsReceived && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Employee Contributions:
                                </span>
                                <span style={{ float: 'right', color: '#059669' }}>
                                  +{contributionsReceived}
                                </span>
                              </td>
                            </tr>
                          )}
                          {employerContributions && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: benefitsDistributed ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Employer Match:
                                </span>
                                <span style={{ float: 'right', color: '#059669' }}>
                                  +{employerContributions}
                                </span>
                              </td>
                            </tr>
                          )}
                          {benefitsDistributed && (
                            <tr>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  Benefits Paid Out:
                                </span>
                                <span style={{ float: 'right', color: '#DC2626' }}>
                                  -{benefitsDistributed}
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

              {/* Investment Options */}
              {investmentOptions && investmentOptions.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="📈" title="Top Investment Options" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {investmentOptions.slice(0, 5).map((option, index) => {
                            const changeStyle = getChangeStyle(option.return);
                            const arrow = getChangeArrow(option.return);
                            return (
                              <tr key={index}>
                                <td style={{
                                  padding: '8px 0',
                                  fontSize: '14px',
                                  color: EmailColors.text.body,
                                  borderBottom: index < Math.min(investmentOptions.length, 5) - 1 ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                                }}>
                                  <div>
                                    <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                      {option.name}
                                    </span>
                                    <span style={{ float: 'right' }}>
                                      {option.allocation && (
                                        <span style={{ marginRight: '12px', color: EmailColors.text.meta }}>
                                          {option.allocation}
                                        </span>
                                      )}
                                      {option.return && (
                                        <span style={changeStyle}>
                                          {arrow}{option.return}
                                        </span>
                                      )}
                                    </span>
                                  </div>
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
        formType={filingType || '11-K'}
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default Form11KMinimalistTemplate;
