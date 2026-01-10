import * as React from 'react';
import { EmailColors, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { SectionHeader } from './sections/SectionHeader';
import { FilingTemplateData } from '../../../../lib/email/types';

interface FormDEF14AMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Minimalist DEF 14A (Proxy Statement) email template
 * Morning Brew style: clean, scannable, lead with key metrics
 *
 * Layout:
 * - Header: ticker, company name, meeting info
 * - Meeting Details: date, type, record date
 * - Board Proposals: management proposals and recommendations
 * - Executive Compensation: CEO/NEO pay highlights
 * - Shareholder Proposals: if any
 * - CTA: View full filing
 */
export function FormDEF14AMinimalistTemplate({ filing }: FormDEF14AMinimalistTemplateProps) {
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

  const meetingDate = rawData?.meetingDate as string | undefined;
  const meetingType = rawData?.meetingType as string | undefined;
  const recordDate = rawData?.recordDate as string | undefined;
  const ceoPayRatio = rawData?.ceoPayRatio as string | undefined;

  const executiveCompensation = rawData?.executiveCompensation as Array<{
    name: string;
    title?: string;
    totalCompensation: string;
  }> | undefined;

  const boardProposals = rawData?.boardProposals as Array<{
    number?: string;
    description: string;
    recommendation: string;
  }> | undefined;

  const shareholderProposals = rawData?.shareholderProposals as Array<{
    number?: string;
    description: string;
    recommendation: string;
  }> | undefined;

  const directorNominees = rawData?.directorNominees as Array<{
    name: string;
    independent?: string;
    tenure?: string;
  }> | undefined;

  const sayOnPay = rawData?.sayOnPay as {
    included?: string;
    recommendation?: string;
    frequency?: string;
  } | undefined;

  // Get recommendation color
  const getRecommendationStyle = (rec: string) => {
    const lowerRec = rec.toLowerCase();
    if (lowerRec.includes('for') && !lowerRec.includes('against')) {
      return { color: '#059669', fontWeight: 600 };
    }
    if (lowerRec.includes('against')) {
      return { color: '#DC2626', fontWeight: 600 };
    }
    return { color: '#6B7280', fontWeight: 600 };
  };

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
        filingType={filingType || 'DEF 14A'}
        filingDate={filingDate}
      />

      {/* Main content */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>
              {/* Proxy Statement Signal Banner */}
              <SectionCard>
                <tr>
                  <td style={{
                    padding: '16px',
                    backgroundColor: '#FDF2F8',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      backgroundColor: '#DB2777',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {meetingType || 'Proxy Statement'}
                    </span>
                    {meetingDate && (
                      <p style={{
                        margin: '12px 0 0',
                        fontSize: '16px',
                        fontWeight: 600,
                        color: EmailColors.text.headline,
                      }}>
                        Meeting Date: {meetingDate}
                      </p>
                    )}
                    {recordDate && (
                      <p style={{
                        margin: '4px 0 0',
                        fontSize: '13px',
                        color: EmailColors.text.meta,
                      }}>
                        Record Date: {recordDate}
                      </p>
                    )}
                  </td>
                </tr>
              </SectionCard>

              {/* Board Proposals */}
              {boardProposals && boardProposals.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="🗳️" title="Board Proposals" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {boardProposals.map((proposal, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '10px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: index < boardProposals.length - 1 ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div style={{ flex: 1 }}>
                                    {proposal.number && (
                                      <span style={{ fontWeight: 600, color: EmailColors.text.headline, marginRight: '8px' }}>
                                        {proposal.number}:
                                      </span>
                                    )}
                                    <span>{proposal.description}</span>
                                  </div>
                                  <span style={{
                                    ...getRecommendationStyle(proposal.recommendation),
                                    marginLeft: '12px',
                                    whiteSpace: 'nowrap',
                                    fontSize: '12px',
                                    textTransform: 'uppercase',
                                  }}>
                                    {proposal.recommendation}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Executive Compensation */}
              {executiveCompensation && executiveCompensation.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="💰" title="Executive Compensation" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {executiveCompensation.slice(0, 5).map((exec, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '8px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: index < Math.min(executiveCompensation.length, 5) - 1 ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <div>
                                  <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                    {exec.name}
                                  </span>
                                  {exec.title && (
                                    <span style={{ color: EmailColors.text.meta, marginLeft: '4px' }}>
                                      ({exec.title})
                                    </span>
                                  )}
                                  <span style={{ float: 'right', fontWeight: 600 }}>
                                    {exec.totalCompensation}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {ceoPayRatio && (
                            <tr>
                              <td style={{
                                padding: '12px 0 0',
                                fontSize: '13px',
                                color: EmailColors.text.meta,
                                borderTop: `1px solid ${EmailColors.structure.borderLight}`,
                                marginTop: '8px',
                              }}>
                                CEO Pay Ratio: <span style={{ fontWeight: 600, color: EmailColors.text.body }}>{ceoPayRatio}</span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Say-on-Pay */}
              {sayOnPay && (sayOnPay.recommendation || sayOnPay.frequency) && (
                <SectionCard>
                  <SectionHeader emoji="📊" title="Say-on-Pay Vote" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {sayOnPay.recommendation && (
                            <tr>
                              <td style={{
                                padding: '4px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                                Board Recommendation: <span style={getRecommendationStyle(sayOnPay.recommendation)}>{sayOnPay.recommendation}</span>
                              </td>
                            </tr>
                          )}
                          {sayOnPay.frequency && (
                            <tr>
                              <td style={{
                                padding: '4px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                                Vote Frequency: {sayOnPay.frequency}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Director Nominees */}
              {directorNominees && directorNominees.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="👥" title="Director Nominees" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {directorNominees.slice(0, 6).map((nominee, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '6px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: index < Math.min(directorNominees.length, 6) - 1 ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <span style={{ fontWeight: 600, color: EmailColors.text.headline }}>
                                  {nominee.name}
                                </span>
                                {nominee.independent && (
                                  <span style={{
                                    marginLeft: '8px',
                                    padding: '2px 6px',
                                    backgroundColor: nominee.independent.toLowerCase().includes('yes') ? '#ECFDF5' : '#F3F4F6',
                                    color: nominee.independent.toLowerCase().includes('yes') ? '#059669' : '#6B7280',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                  }}>
                                    {nominee.independent.toLowerCase().includes('yes') ? 'Independent' : 'Non-Independent'}
                                  </span>
                                )}
                                {nominee.tenure && (
                                  <span style={{ float: 'right', color: EmailColors.text.meta, fontSize: '13px' }}>
                                    {nominee.tenure}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* Shareholder Proposals */}
              {shareholderProposals && shareholderProposals.length > 0 && (
                <SectionCard>
                  <SectionHeader emoji="📣" title="Shareholder Proposals" />
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {shareholderProposals.map((proposal, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '10px 0',
                                fontSize: '14px',
                                color: EmailColors.text.body,
                                borderBottom: index < shareholderProposals.length - 1 ? `1px solid ${EmailColors.structure.borderLight}` : 'none',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div style={{ flex: 1 }}>
                                    {proposal.number && (
                                      <span style={{ fontWeight: 600, color: EmailColors.text.headline, marginRight: '8px' }}>
                                        {proposal.number}:
                                      </span>
                                    )}
                                    <span>{proposal.description}</span>
                                  </div>
                                  <span style={{
                                    ...getRecommendationStyle(proposal.recommendation),
                                    marginLeft: '12px',
                                    whiteSpace: 'nowrap',
                                    fontSize: '12px',
                                    textTransform: 'uppercase',
                                  }}>
                                    Board: {proposal.recommendation}
                                  </span>
                                </div>
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
        formType={filingType || 'DEF 14A'}
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default FormDEF14AMinimalistTemplate;
