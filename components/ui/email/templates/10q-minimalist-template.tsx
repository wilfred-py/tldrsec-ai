import * as React from 'react';
import { EmailColors, EmailStyles, getChangeStyle, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailLeadHeader } from './sections/EmailLeadHeader';
import { FormPlusMaterialityBadgeRow } from './sections/FormPlusMaterialityBadgeRow';
import { EmailFooter } from './sections/EmailFooter';
import { StalenessBanner } from './sections/StalenessBanner';
import { FilingTemplateData } from '../../../../lib/email/types';

interface Form10QMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * 10-Q Email Template - Smart Brevity format
 *
 * Signal-first layout:
 * - [QUARTERLY REPORT] pill badge
 * - Lead sentence from top highlight
 * - "Why it matters:" QoQ/YoY context
 * - Data snapshot: financial metrics with YoY + QoQ in same rows
 * - Story: guidance updates + trends as narrative
 * - "Watch for:" risks + next quarter expectations
 * - Fallback: full summaryText via markdownToHtml()
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

  // Determine if we have any structured data at all
  const hasStructuredData = (financialHighlights && financialHighlights.length > 0) ||
    (keyPoints && keyPoints.length > 0) ||
    (guidanceUpdates && guidanceUpdates.length > 0) ||
    (riskFactors && riskFactors.length > 0) ||
    (quarterlyTrends && quarterlyTrends.length > 0);

  // Prefer AI-provided headline, fall back to structured extraction
  const aiHeadline = typeof rawData?.headline === 'string' ? rawData.headline : '';
  let leadSentence = aiHeadline;
  if (!leadSentence) {
    if (keyPoints && keyPoints.length > 0) {
      leadSentence = keyPoints[0];
    } else if (financialHighlights && financialHighlights.length > 0) {
      const h = financialHighlights[0];
      const changeStr = h.change ? ` (${getChangeArrow(h.change)}${h.change} YoY)` : '';
      leadSentence = `${h.label}: ${h.value}${changeStr}`;
    } else if (summaryText) {
      leadSentence = summaryText.split(/(?<=[.!?])\s+/)[0] || summaryText;
    }
  }

  // Build "Why it matters" context from QoQ/YoY data
  let whyItMatters = '';
  if (financialHighlights && financialHighlights.length > 0) {
    const withChanges = financialHighlights.filter(h => h.change || h.qoqChange);
    if (withChanges.length > 0) {
      const parts = withChanges.slice(0, 2).map(h => {
        const pieces: string[] = [];
        if (h.change) pieces.push(`${getChangeArrow(h.change)}${h.change} YoY`);
        if (h.qoqChange) pieces.push(`${getChangeArrow(h.qoqChange)}${h.qoqChange} QoQ`);
        return `${h.label} is ${pieces.join(', ')}`;
      });
      whyItMatters = parts.join('. ') + '.';
    }
  }
  if (!whyItMatters && quarterlyTrends && quarterlyTrends.length > 0) {
    const summaries = quarterlyTrends.slice(0, 2).map(t => {
      const arrow = t.trend === 'up' ? '↑' : t.trend === 'down' ? '↓' : '→';
      return `${t.metric} trending ${arrow} at ${t.current}`;
    });
    whyItMatters = summaries.join('; ') + '.';
  }
  if (!whyItMatters && summaryText) {
    // Grab the second sentence as context
    const sentences = summaryText.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1) {
      whyItMatters = sentences[1];
    }
  }

  // Data snapshot rows: financial metrics with YoY + QoQ in same row
  const dataRows: { label: string; value: string; change?: string | number; qoqChange?: string | number }[] = [];
  if (financialHighlights) {
    for (const h of financialHighlights.slice(0, 5)) {
      dataRows.push({
        label: h.label,
        value: String(h.value),
        change: h.change,
        qoqChange: h.qoqChange,
      });
    }
  }

  // Story narrative: guidance updates + quarterly trends woven together
  const storyParts: string[] = [];
  if (guidanceUpdates && guidanceUpdates.length > 0) {
    storyParts.push(...guidanceUpdates);
  }
  if (quarterlyTrends && quarterlyTrends.length > 0) {
    for (const trend of quarterlyTrends) {
      const arrow = trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '→';
      storyParts.push(`**${trend.metric}** ${arrow} ${trend.current}`);
    }
  }
  // If no guidance/trends but we have extra key points beyond the lead, include them
  if (storyParts.length === 0 && keyPoints && keyPoints.length > 1) {
    storyParts.push(...keyPoints.slice(1, 4));
  }

  // Watch for: risks + any remaining key points
  const watchFor: string[] = [];
  if (riskFactors && riskFactors.length > 0) {
    watchFor.push(...riskFactors.slice(0, 3));
  }

  // Build preheader text for inbox preview
  const preheaderText = leadSentence
    ? `${displayTicker} 10-Q: ${leadSentence.substring(0, 120)}`
    : `${displayTicker} quarterly report filed${filingDate ? ` on ${filingDate}` : ''}`;

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: EmailColors.structure.background,
      color: EmailColors.text.body,
    }}>
      {/* Preheader — hidden text for inbox preview */}
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

      {/* Staleness warning (above header) */}
      {filingDate && (
        <div style={{ padding: '0 15px' }}>
          <StalenessBanner filingDate={new Date(filingDate)} />
        </div>
      )}

      {/* Lead-with-headline header */}
      <EmailLeadHeader
        ticker={displayTicker}
        companyName={companyName}
        filingDate={filingDate}
        headline={leadSentence || `${companyName || displayTicker} filed a quarterly report (10-Q)`}
      />

      {/* Form badge + signal badge row */}
      <FormPlusMaterialityBadgeRow
        filingType={filingType || '10-Q'}
        signal={{ label: 'QUARTERLY REPORT', colorKey: 'neutral' }}
      />

      {/* Smart Brevity body */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>

              {/* Why it matters */}
              {whyItMatters && (
                <p style={EmailStyles.whyItMatters}>
                  <strong style={{ color: '#000000' }}>Why it matters: </strong>
                  {whyItMatters}
                </p>
              )}

              {/* Data snapshot */}
              {dataRows.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>

                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '4px' }}>
                    <tbody>
                      {dataRows.map((row, idx) => {
                        const changeStyle = getChangeStyle(row.change);
                        const arrow = getChangeArrow(row.change);
                        const qoqStyle = getChangeStyle(row.qoqChange);
                        const qoqArrow = getChangeArrow(row.qoqChange);

                        // Build the value cell content: value + YoY + QoQ inline
                        const changeParts: string[] = [];
                        if (row.change) changeParts.push(`${arrow}${row.change} YoY`);
                        if (row.qoqChange) changeParts.push(`${qoqArrow}${row.qoqChange} QoQ`);

                        return (
                          <tr key={idx}>
                            <td style={{
                              ...EmailStyles.dataLabel,
                              borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                            }}>{row.label}</td>
                            <td style={{
                              ...EmailStyles.dataValue,
                              borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                            }}>
                              <span>{row.value}</span>
                              {row.change && (
                                <span style={{ ...changeStyle, marginLeft: '8px', fontSize: '12px' }}>
                                  {arrow}{row.change} YoY
                                </span>
                              )}
                              {row.qoqChange && (
                                <span style={{ ...qoqStyle, marginLeft: '6px', fontSize: '12px' }}>
                                  {qoqArrow}{row.qoqChange} QoQ
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Story — guidance + trends narrative */}
              {storyParts.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>

                  <div
                    style={EmailStyles.prose}
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(storyParts.join('\n\n')) }}
                  />
                </>
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

              {/* Fallback: full summary text when no structured data */}
              {!hasStructuredData && summaryText && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>

                  <div
                    style={EmailStyles.prose}
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(summaryText) }}
                  />
                </>
              )}

              {/* No data at all */}
              {!hasStructuredData && !summaryText && (
                <p style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: EmailColors.text.meta,
                  textAlign: 'center',
                  padding: '20px 0',
                }}>
                  View the full 10-Q filing for quarterly details.
                </p>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || '10-Q'}
      />
    </div>
  );
}

export default Form10QMinimalistTemplate;
