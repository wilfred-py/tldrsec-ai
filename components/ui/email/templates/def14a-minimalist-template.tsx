import * as React from 'react';
import { EmailColors, EmailStyles, BadgeColors, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { FilingTemplateData } from '../../../../lib/email/types';

interface FormDEF14AMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Smart Brevity DEF 14A (Proxy Statement) email template
 *
 * Layout:
 * - Preheader for inbox preview
 * - Header: ticker, company name, filing metadata
 * - [PROXY VOTE] pill badge with meeting date
 * - Lead sentence: most consequential proposal
 * - "Why it matters:" compensation + governance context
 * - Data snapshot: CEO comp, pay ratio, meeting/record dates
 * - Story: all proposals as numbered prose list with FOR/AGAINST coloring
 * - "Watch for:" director independence concerns, notable proposals
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

  // Determine if we have structured data for Smart Brevity layout
  const hasStructuredData = !!(
    boardProposals?.length ||
    executiveCompensation?.length ||
    shareholderProposals?.length ||
    meetingDate
  );

  // Get recommendation inline style (colored text, no badge)
  const getRecColor = (rec: string): string => {
    const lower = rec.toLowerCase();
    if (lower.includes('for') && !lower.includes('against')) return '#166534';
    if (lower.includes('against')) return '#991B1B';
    return '#6B7280';
  };

  const getRecLabel = (rec: string): string => {
    const lower = rec.toLowerCase();
    if (lower.includes('for') && !lower.includes('against')) return 'FOR';
    if (lower.includes('against')) return 'AGAINST';
    return rec.toUpperCase();
  };

  // Build lead sentence from the most consequential proposal
  const buildLeadSentence = (): string => {
    // Try say-on-pay first as it's usually the most attention-getting
    if (sayOnPay?.recommendation) {
      return `${companyName} asks shareholders to approve executive pay at its ${meetingType?.toLowerCase() || 'annual'} meeting${meetingDate ? ` on ${meetingDate}` : ''}.`;
    }
    // Fall back to first board proposal
    if (boardProposals?.length) {
      const first = boardProposals[0];
      return `${companyName} puts ${boardProposals.length} proposal${boardProposals.length > 1 ? 's' : ''} to a shareholder vote${meetingDate ? ` on ${meetingDate}` : ''}, including ${first.description.toLowerCase()}.`;
    }
    // Minimal fallback
    return `${companyName} filed a proxy statement${meetingDate ? ` ahead of its ${meetingDate} meeting` : ''}.`;
  };

  // Build "Why it matters" narrative
  const buildWhyItMatters = (): string => {
    const parts: string[] = [];

    // CEO compensation context
    const ceo = executiveCompensation?.find(e =>
      e.title?.toLowerCase().includes('ceo') ||
      e.title?.toLowerCase().includes('chief executive')
    );
    if (ceo) {
      parts.push(`CEO ${ceo.name} received ${ceo.totalCompensation} in total compensation`);
    }
    if (ceoPayRatio) {
      parts.push(`with a CEO-to-median-worker pay ratio of ${ceoPayRatio}`);
    }

    // Governance context
    if (directorNominees?.length) {
      const independentCount = directorNominees.filter(n =>
        n.independent?.toLowerCase().includes('yes')
      ).length;
      if (independentCount > 0) {
        parts.push(`${independentCount} of ${directorNominees.length} director nominees are independent`);
      } else {
        parts.push(`${directorNominees.length} directors are up for election`);
      }
    }

    if (shareholderProposals?.length) {
      parts.push(`shareholders submitted ${shareholderProposals.length} proposal${shareholderProposals.length > 1 ? 's' : ''} the board opposes`);
    }

    if (parts.length === 0) {
      return 'Proxy statements reveal how management is compensated, who governs the company, and what shareholders are voting on. Review proposals before the vote deadline.';
    }

    // Join with proper punctuation
    let sentence = parts[0];
    for (let i = 1; i < parts.length; i++) {
      sentence += i === parts.length - 1 ? `, and ${parts[i]}` : `, ${parts[i]}`;
    }
    return sentence + '.';
  };

  // Build data snapshot rows
  const dataRows: { label: string; value: string }[] = [];

  // CEO total comp
  const ceo = executiveCompensation?.find(e =>
    e.title?.toLowerCase().includes('ceo') ||
    e.title?.toLowerCase().includes('chief executive')
  );
  if (ceo) {
    dataRows.push({ label: 'CEO TOTAL COMP', value: ceo.totalCompensation });
  }
  if (ceoPayRatio) {
    dataRows.push({ label: 'PAY RATIO', value: ceoPayRatio });
  }
  if (meetingDate) {
    dataRows.push({ label: 'MEETING DATE', value: meetingDate });
  }
  if (recordDate) {
    dataRows.push({ label: 'RECORD DATE', value: recordDate });
  }
  if (sayOnPay?.frequency) {
    dataRows.push({ label: 'SAY-ON-PAY FREQ', value: sayOnPay.frequency });
  }

  // Build watch-for items
  const watchFor: string[] = [];

  // Director independence concerns
  if (directorNominees?.length) {
    const nonIndependent = directorNominees.filter(n =>
      n.independent && !n.independent.toLowerCase().includes('yes')
    );
    if (nonIndependent.length > 0) {
      watchFor.push(
        `${nonIndependent.length} non-independent director nominee${nonIndependent.length > 1 ? 's' : ''}: ${nonIndependent.map(n => n.name).join(', ')}`
      );
    }
  }

  // Notable shareholder proposals
  if (shareholderProposals?.length) {
    for (const prop of shareholderProposals.slice(0, 2)) {
      watchFor.push(`Shareholder proposal: ${prop.description}`);
    }
  }

  // Say-on-pay if present
  if (sayOnPay?.recommendation) {
    watchFor.push(`Say-on-pay vote — board recommends ${sayOnPay.recommendation}`);
  }

  // All proposals combined for the story section
  const allProposals: Array<{
    number?: string;
    description: string;
    recommendation: string;
    source: 'board' | 'shareholder';
  }> = [
    ...(boardProposals || []).map(p => ({ ...p, source: 'board' as const })),
    ...(shareholderProposals || []).map(p => ({ ...p, source: 'shareholder' as const })),
  ];

  // Preheader text for inbox preview
  const preheaderText = `PROXY VOTE: ${companyName} ${meetingType || 'annual meeting'}${meetingDate ? ` on ${meetingDate}` : ''} — ${allProposals.length} proposals`;

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: EmailColors.structure.background,
      color: EmailColors.text.body,
    }}>
      {/* Preheader — hidden inbox preview text */}
      <div style={{
        display: 'none',
        fontSize: '1px',
        color: EmailColors.structure.background,
        lineHeight: '1px',
        maxHeight: '0px',
        maxWidth: '0px',
        opacity: 0,
        overflow: 'hidden',
      }}>
        {preheaderText}
      </div>

      {/* Header */}
      <EmailHeader
        ticker={displayTicker}
        companyName={companyName}
        filingType={filingType || 'DEF 14A'}
        filingDate={filingDate}
      />

      {/* Smart Brevity body */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>

              {hasStructuredData ? (
                <>
                  {/* [PROXY VOTE] pill badge with meeting date */}
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{
                      ...EmailStyles.pillBadge,
                      backgroundColor: BadgeColors.moderate.bg,
                      color: BadgeColors.moderate.text,
                    }}>
                      PROXY VOTE
                    </span>
                    {meetingDate && (
                      <span style={{
                        ...EmailStyles.categoryBadge,
                        marginLeft: '8px',
                      }}>
                        {meetingType || 'Annual Meeting'} &middot; {meetingDate}
                      </span>
                    )}
                  </div>

                  {/* Lead sentence */}
                  <h1 style={EmailStyles.leadSentence}>
                    {buildLeadSentence()}
                  </h1>

                  {/* Why it matters */}
                  <p style={EmailStyles.whyItMatters}>
                    <strong style={{ color: '#000000' }}>Why it matters: </strong>
                    {buildWhyItMatters()}
                  </p>

                  {/* Thin divider before data snapshot */}
                  {dataRows.length > 0 && (
                    <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                      <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                    </table>
                  )}

                  {/* Data snapshot */}
                  {dataRows.length > 0 && (
                    <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '4px' }}>
                      <tbody>
                        {dataRows.map((row, idx) => (
                          <tr key={idx}>
                            <td style={{
                              ...EmailStyles.dataLabel,
                              borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                            }}>{row.label}</td>
                            <td style={{
                              ...EmailStyles.dataValue,
                              borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                            }}>{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Thin divider before proposals story */}
                  {allProposals.length > 0 && (
                    <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                      <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                    </table>
                  )}

                  {/* Story — all proposals as numbered prose list */}
                  {allProposals.length > 0 && (
                    <div>
                      {/* Board proposals */}
                      {boardProposals && boardProposals.length > 0 && (
                        <>
                          <div style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: EmailColors.text.meta,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '8px',
                          }}>
                            Board Proposals
                          </div>
                          {boardProposals.map((proposal, idx) => (
                            <p key={`bp-${idx}`} style={{
                              ...EmailStyles.prose,
                              marginBottom: '8px',
                            }}>
                              <strong style={{ color: '#000000' }}>
                                {proposal.number || `${idx + 1}`}.
                              </strong>{' '}
                              {proposal.description}
                              {' — '}
                              <span style={{
                                fontWeight: 600,
                                color: getRecColor(proposal.recommendation),
                              }}>
                                {getRecLabel(proposal.recommendation)}
                              </span>
                            </p>
                          ))}
                        </>
                      )}

                      {/* Shareholder proposals */}
                      {shareholderProposals && shareholderProposals.length > 0 && (
                        <>
                          <div style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: EmailColors.text.meta,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '8px',
                            marginTop: boardProposals?.length ? '16px' : '0',
                          }}>
                            Shareholder Proposals
                          </div>
                          {shareholderProposals.map((proposal, idx) => (
                            <p key={`sp-${idx}`} style={{
                              ...EmailStyles.prose,
                              marginBottom: '8px',
                            }}>
                              <strong style={{ color: '#000000' }}>
                                {proposal.number || `S${idx + 1}`}.
                              </strong>{' '}
                              {proposal.description}
                              {' — Board: '}
                              <span style={{
                                fontWeight: 600,
                                color: getRecColor(proposal.recommendation),
                              }}>
                                {getRecLabel(proposal.recommendation)}
                              </span>
                            </p>
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {/* Watch for */}
                  {watchFor.length > 0 && (
                    <>
                      <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                        <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                      </table>
                      <div style={EmailStyles.watchForHeader}>Watch for:</div>
                      {watchFor.map((item, idx) => (
                        <div key={idx} style={{
                          padding: '3px 0 3px 16px',
                          fontSize: '14px',
                          color: EmailColors.text.body,
                          lineHeight: '1.5',
                        }}>
                          <span style={{ color: EmailColors.text.meta, marginRight: '8px' }}>•</span>
                          {item}
                        </div>
                      ))}
                    </>
                  )}
                </>
              ) : (
                /* Fallback — no structured data, render summaryText via markdownToHtml */
                <>
                  {/* Still show the pill badge */}
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{
                      ...EmailStyles.pillBadge,
                      backgroundColor: BadgeColors.moderate.bg,
                      color: BadgeColors.moderate.text,
                    }}>
                      PROXY VOTE
                    </span>
                  </div>

                  {summaryText ? (
                    <div
                      style={EmailStyles.prose}
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(summaryText) }}
                    />
                  ) : (
                    <p style={{
                      fontSize: '14px',
                      lineHeight: '1.6',
                      color: EmailColors.text.meta,
                      textAlign: 'center',
                      padding: '20px 0',
                    }}>
                      View the full proxy statement for details.
                    </p>
                  )}
                </>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || 'DEF 14A'}
      />
    </div>
  );
}

export default FormDEF14AMinimalistTemplate;
