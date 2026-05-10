import * as React from 'react';
import { EmailColors, EmailStyles, getChangeStyle, getChangeArrow, isUsableMetricRow, markdownToHtml } from '../design-system';
import { EmailLeadHeader } from './sections/EmailLeadHeader';
import { FormPlusMaterialityBadgeRow } from './sections/FormPlusMaterialityBadgeRow';
import { EmailFooter } from './sections/EmailFooter';
import { StalenessBanner } from './sections/StalenessBanner';
import { HangingBulletItem } from './sections/BulletList';
import { XSentimentSection, shouldRenderXSentiment } from './sections/XSentimentSection';
import { FilingTemplateData } from '../../../../lib/email/types';

interface Form10KMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Minimalist 10-K email template — Smart Brevity format
 *
 * Layout:
 * - Preheader for inbox preview
 * - Header: ticker, company name, fiscal year
 * - [ANNUAL REPORT] pill badge
 * - Lead sentence from first key point or financial highlight
 * - "Why it matters:" revenue/earnings context
 * - Data snapshot: top financial metrics with YoY changes
 * - Story: segment performance + key takeaways woven into narrative prose
 * - "Watch for:" risk factors as bullets
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

  // Try to extract financial data from various possible structures.
  // Filter sentinel placeholder rows ("N/A" / "Null" / "$NaN") before any
  // downstream consumer sees them — the prompt instructs the AI to emit
  // these for unavailable values, and without filtering the scorecard
  // renders all-"$NaN" rows.
  const rawFinancialHighlights = rawData?.financialHighlights as Array<{
    label: string;
    value: string | number;
    change?: string | number;
  }> | undefined;
  const financialHighlights = rawFinancialHighlights?.filter(isUsableMetricRow);

  const keyPoints = rawData?.keyPoints as string[] | undefined;
  const riskFactors = rawData?.riskFactors as string[] | undefined;
  const segments = rawData?.segments as Array<{
    name: string;
    revenue: string | number;
    growth: string | number;
  }> | undefined;

  // Extract simple summary if available
  const _parsedContent = rawData?.parsedContent as Record<string, unknown> | undefined;

  // --- Smart Brevity content assembly ---

  const hasStructuredData = !!(
    (financialHighlights && financialHighlights.length > 0) ||
    (keyPoints && keyPoints.length > 0)
  );

  // Prefer AI-provided headline, fall back to structured extraction
  const aiHeadline = typeof rawData?.headline === 'string' ? rawData.headline : '';
  let leadSentence = aiHeadline;
  if (!leadSentence) {
    if (keyPoints && keyPoints.length > 0) {
      leadSentence = keyPoints[0];
    } else if (financialHighlights && financialHighlights.length > 0) {
      const first = financialHighlights[0];
      leadSentence = `${first.label}: ${first.value}${first.change ? ` (${first.change} YoY)` : ''}`;
    } else if (summaryText) {
      leadSentence = summaryText.split(/(?<=[.!?])\s+/)[0] || summaryText;
    }
  }

  // "Why it matters" context — pull revenue/earnings highlights or second key point
  let whyItMatters = '';
  if (financialHighlights && financialHighlights.length > 0) {
    const parts = financialHighlights.slice(0, 3).map(h =>
      `${h.label} ${h.value}${h.change ? ` (${h.change} YoY)` : ''}`
    );
    whyItMatters = parts.join('; ') + '.';
  } else if (keyPoints && keyPoints.length > 1) {
    whyItMatters = keyPoints[1];
  } else if (summaryText) {
    const sentences = summaryText.split(/(?<=[.!?])\s+/);
    whyItMatters = sentences.length > 1 ? sentences[1] : '';
  }

  // Data snapshot rows: top financial metrics
  const dataRows: { label: string; value: string; change?: string | number }[] = [];
  if (financialHighlights) {
    for (const h of financialHighlights.slice(0, 5)) {
      dataRows.push({ label: h.label, value: String(h.value), change: h.change });
    }
  }

  // Story: segment performance + remaining key takeaways woven into prose
  const storyParts: string[] = [];
  if (segments && segments.length > 0) {
    const segmentSummaries = segments.map(s =>
      `${s.name} generated ${s.revenue} in revenue (${s.growth} YoY)`
    );
    storyParts.push(segmentSummaries.join('. ') + '.');
  }
  if (keyPoints && keyPoints.length > 1) {
    // Skip the first (used as lead sentence) and weave the rest
    storyParts.push(...keyPoints.slice(1));
  }
  const storyText = storyParts.join(' ');

  // Watch-for items: risk factors
  const watchForItems = riskFactors ? riskFactors.slice(0, 4) : [];

  // X (Twitter) sentiment payload — populated when x_sentiment provider ran.
  const xSentiment = rawData?.xSentiment as
    NonNullable<FilingTemplateData['summaryData']>['xSentiment'] | undefined;
  const renderXSentiment = shouldRenderXSentiment(xSentiment);

  // Preheader text for inbox preview
  const preheaderText = `${displayTicker} Annual Report: ${leadSentence.substring(0, 120)}`;

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

      {/* Staleness warning (above header per new layout) */}
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
        headline={leadSentence || `${companyName || displayTicker} filed its annual report (10-K)`}
      />

      {/* Form badge + signal badge row */}
      <FormPlusMaterialityBadgeRow
        filingType={filingType || '10-K'}
        signal={{ label: 'ANNUAL REPORT', colorKey: 'neutral' }}
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

              {/* Data snapshot — financial metrics */}
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
                        return (
                          <tr key={idx}>
                            <td style={{
                              ...EmailStyles.dataLabel,
                              borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                            }}>{row.label}</td>
                            <td style={{
                              ...EmailStyles.dataValue,
                              color: '#111827',
                              borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                            }}>
                              {row.value}
                              {row.change && (
                                <span style={{ ...changeStyle, marginLeft: '6px', fontSize: '13px' }}>
                                  {arrow}{row.change}
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

              {/* Story — segment performance + key takeaways */}
              {storyText && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>

                  <div
                    style={EmailStyles.prose}
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(storyText) }}
                  />
                </>
              )}

              {/* Watch for — risk factors */}
              {watchForItems.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div style={EmailStyles.watchForHeader}>Watch for:</div>
                  {watchForItems.map((risk, idx) => (
                    <HangingBulletItem key={idx} text={risk} />
                  ))}
                </>
              )}

              {/* Fallback: when no structured data, render full summaryText */}
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
                  View the full 10-K filing for details.
                </p>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* X (Twitter) sentiment — F3-validated payload from xAI x_search */}
      {renderXSentiment && xSentiment && (
        <table width="100%" cellPadding="0" cellSpacing="0">
          <tbody>
            <XSentimentSection
              direction={xSentiment.direction}
              shift={xSentiment.shift}
              confidence={xSentiment.confidence}
              discussionSynthesis={xSentiment.discussionSynthesis}
              factClaims={xSentiment.factClaims}
              citationUrls={xSentiment.citationUrls}
              windowHours={xSentiment.windowHours}
            />
            <tr><td style={{ height: '20px', lineHeight: '20px', fontSize: 0 }}>&nbsp;</td></tr>
          </tbody>
        </table>
      )}

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || '10-K'}
      />
    </div>
  );
}

export default Form10KMinimalistTemplate;
