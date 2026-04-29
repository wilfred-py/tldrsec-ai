import * as React from 'react';
import { EmailColors, EmailStyles, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailLeadHeader } from './sections/EmailLeadHeader';
import { FormPlusMaterialityBadgeRow } from './sections/FormPlusMaterialityBadgeRow';
import { EmailFooter } from './sections/EmailFooter';
import { StalenessBanner } from './sections/StalenessBanner';
import { XSentimentSection, shouldRenderXSentiment } from './sections/XSentimentSection';
import { FilingTemplateData } from '../../../../lib/email/types';

/**
 * Coerce a possibly-non-string array entry into a clean string.
 *
 * The unified-prompts schema declares `guidanceUpdates`/`keyPoints` as
 * `string[]`, but Grok occasionally returns object literals (e.g.
 * `{ metric, current, change }`) instead — which then render as
 * "[object Object]" through `markdownToHtml`. This helper extracts a
 * displayable string from common object shapes and drops anything else.
 */
function coerceStoryItem(item: unknown): string | null {
  if (typeof item === 'string') {
    const trimmed = item.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    for (const key of ['text', 'description', 'summary', 'content', 'value', 'detail']) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    // Synthesize "<metric>: <value>" if both are simple scalars
    const metric = obj.metric ?? obj.label ?? obj.name;
    const value = obj.current ?? obj.value ?? obj.amount;
    if (
      (typeof metric === 'string' || typeof metric === 'number') &&
      (typeof value === 'string' || typeof value === 'number')
    ) {
      return `**${metric}** ${value}`;
    }
  }
  return null;
}

interface Form10QMinimalistTemplateProps {
  filing: FilingTemplateData;
}

const MONO_FONT = '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Courier New", monospace';

/**
 * Litquidity-style financial scorecard cell styles.
 * 4-column grid: METRIC | LATEST | YoY | QoQ.
 * Color is applied ONLY to the % delta pills, never to the dollar value.
 */
const fin = {
  headMetric: {
    fontSize: '10px',
    fontWeight: 700,
    color: EmailColors.text.muted,
    letterSpacing: '0.9px',
    textTransform: 'uppercase' as const,
    textAlign: 'left' as const,
    padding: '12px 15px 8px',
    borderBottom: `1px solid ${EmailColors.structure.border}`,
  },
  headNum: {
    fontSize: '10px',
    fontWeight: 700,
    color: EmailColors.text.muted,
    letterSpacing: '0.9px',
    textTransform: 'uppercase' as const,
    textAlign: 'right' as const,
    padding: '12px 15px 8px',
    borderBottom: `1px solid ${EmailColors.structure.border}`,
  },
  cellMetric: {
    fontSize: '13px',
    fontWeight: 600,
    color: EmailColors.text.headline,
    padding: '11px 15px',
    verticalAlign: 'middle' as const,
  },
  cellValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: EmailColors.text.headline,
    fontFamily: MONO_FONT,
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
    padding: '11px 15px',
    verticalAlign: 'middle' as const,
    whiteSpace: 'nowrap' as const,
  },
  cellDelta: {
    textAlign: 'right' as const,
    padding: '11px 8px 11px 15px',
    verticalAlign: 'middle' as const,
    whiteSpace: 'nowrap' as const,
  },
  cellDeltaLast: {
    textAlign: 'right' as const,
    padding: '11px 15px 11px 8px',
    verticalAlign: 'middle' as const,
    whiteSpace: 'nowrap' as const,
  },
  dash: {
    color: EmailColors.text.muted,
    fontSize: '12px',
    fontFamily: MONO_FONT,
  },
} as const;

type DeltaTone = 'positive' | 'negative' | 'zero' | 'unparseable';

/**
 * Parse a YoY/QoQ change value into a tone + display text.
 *
 * Numeric strings ("+6.1%", "-2.7", 6.1) → positive/negative/zero with
 * "+N%" / "−N%" formatting. Non-numeric strings ("N/A", "n/m") and basis-
 * point measures ("5 points") fall through as "unparseable" — they render
 * in a neutral gray pill with the raw text preserved, never colored as
 * positive by accident.
 */
function parseDelta(value: string | number | undefined): { tone: DeltaTone; text: string } | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const stripped = raw.replace(/[%+,$\s]/g, '');
  // Reject anything with non-numeric characters left after stripping the
  // sign / unit decorations — "5points" → not a clean percentage.
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return { tone: 'unparseable', text: raw };
  const num = parseFloat(stripped);
  if (isNaN(num)) return { tone: 'unparseable', text: raw };
  if (num === 0) return { tone: 'zero', text: '0%' };
  const isNegative = num < 0;
  const abs = Math.abs(num);
  const sign = isNegative ? '\u2212' : '+';
  return { tone: isNegative ? 'negative' : 'positive', text: `${sign}${abs}%` };
}

/**
 * Pill chip showing a percentage delta. Green for positive, red for
 * negative, gray for zero AND for unparseable values like "N/A" / "n/m".
 * The pill is the ONLY colored element in the financial scorecard rows —
 * labels and dollar values stay neutral.
 */
function PillDelta({ value }: { value: string | number }) {
  const parsed = parseDelta(value);
  if (!parsed) return <span style={fin.dash}>—</span>;

  const colors = parsed.tone === 'positive'
    ? { bg: EmailColors.semantic.pillPositiveBg, text: EmailColors.semantic.pillPositiveFg }
    : parsed.tone === 'negative'
      ? { bg: EmailColors.semantic.pillNegativeBg, text: EmailColors.semantic.pillNegativeFg }
      : { bg: EmailColors.semantic.pillNeutralBg, text: EmailColors.semantic.pillNeutralFg };

  return (
    <span style={{
      display: 'inline-block' as const,
      padding: '3px 8px',
      borderRadius: '4px',
      backgroundColor: colors.bg,
      color: colors.text,
      fontSize: '11px',
      fontWeight: 700,
      fontFamily: MONO_FONT,
      fontVariantNumeric: 'tabular-nums' as const,
      letterSpacing: '0.2px',
      lineHeight: '1.2',
      whiteSpace: 'nowrap' as const,
    }}>
      {parsed.text}
    </span>
  );
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

  // Story narrative: guidance updates + quarterly trends woven together.
  // Defensively coerce — schema says string[] but the LLM occasionally
  // returns objects, which would otherwise render as "[object Object]".
  const storyParts: string[] = [];
  if (guidanceUpdates && guidanceUpdates.length > 0) {
    for (const item of guidanceUpdates as unknown[]) {
      const s = coerceStoryItem(item);
      if (s) storyParts.push(s);
    }
  }
  if (quarterlyTrends && quarterlyTrends.length > 0) {
    for (const trend of quarterlyTrends) {
      const arrow = trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '→';
      storyParts.push(`**${trend.metric}** ${arrow} ${trend.current}`);
    }
  }
  // If no guidance/trends but we have extra key points beyond the lead, include them
  if (storyParts.length === 0 && keyPoints && keyPoints.length > 1) {
    for (const item of keyPoints.slice(1, 4) as unknown[]) {
      const s = coerceStoryItem(item);
      if (s) storyParts.push(s);
    }
  }

  // Watch for: risks + any remaining key points
  const watchFor: string[] = [];
  if (riskFactors && riskFactors.length > 0) {
    for (const item of riskFactors.slice(0, 3) as unknown[]) {
      const s = coerceStoryItem(item);
      if (s) watchFor.push(s);
    }
  }

  // X (Twitter) sentiment payload — only present when x_sentiment provider ran.
  const xSentiment = rawData?.xSentiment as
    NonNullable<FilingTemplateData['summaryData']>['xSentiment'] | undefined;
  const renderXSentiment = shouldRenderXSentiment(xSentiment);

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

          {/* Why it matters — padded */}
          {whyItMatters && (
            <tr>
              <td style={{ padding: '0 15px 4px' }}>
                <p style={EmailStyles.whyItMatters}>
                  <strong style={{ color: '#000000' }}>Why it matters: </strong>
                  {whyItMatters}
                </p>
              </td>
            </tr>
          )}

          {/* Data snapshot: black bar header + 4-column financials grid */}
          {dataRows.length > 0 && (
            <>
              {/* Spacer above the black bar (margin doesn't work on td) */}
              <tr><td style={{ height: '20px', lineHeight: '20px', fontSize: 0 }}>&nbsp;</td></tr>
              {/* Full-width black "EARNINGS SCORECARD" bar */}
              <tr>
                <td style={{
                  backgroundColor: '#000000',
                  padding: '11px 15px',
                }}>
                  <table width="100%" cellPadding="0" cellSpacing="0">
                    <tbody>
                      <tr>
                        <td style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#FFFFFF',
                          letterSpacing: '1.2px',
                          textTransform: 'uppercase' as const,
                        }}>
                          Earnings Scorecard
                        </td>
                        <td style={{
                          textAlign: 'right' as const,
                          fontSize: '10px',
                          fontWeight: 600,
                          color: '#9CA3AF',
                          letterSpacing: '0.6px',
                          textTransform: 'uppercase' as const,
                          fontFamily: '"JetBrains Mono", Monaco, Consolas, monospace',
                        }}>
                          {dataRows.length} metrics
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              {/* Column headers */}
              <tr>
                <td style={{ padding: '0' }}>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse' as const }}>
                    <thead>
                      <tr>
                        <th style={fin.headMetric}>Metric</th>
                        <th style={fin.headNum}>Latest</th>
                        <th style={fin.headNum}>YoY</th>
                        <th style={fin.headNum}>QoQ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.map((row, idx) => {
                        const isOdd = idx % 2 === 1;
                        const rowBg = isOdd ? EmailColors.structure.backgroundAlt : EmailColors.structure.background;
                        return (
                          <tr key={idx} style={{ backgroundColor: rowBg }}>
                            <td style={fin.cellMetric}>{row.label}</td>
                            <td style={fin.cellValue}>{row.value}</td>
                            <td style={fin.cellDelta}>
                              {row.change ? <PillDelta value={row.change} /> : <span style={fin.dash}>—</span>}
                            </td>
                            <td style={fin.cellDeltaLast}>
                              {row.qoqChange ? <PillDelta value={row.qoqChange} /> : <span style={fin.dash}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </td>
              </tr>
            </>
          )}

          {/* Story — guidance + trends narrative */}
          {storyParts.length > 0 && (
            <tr>
              <td style={{ padding: '20px 15px 0' }}>
                <div
                  style={EmailStyles.prose}
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(storyParts.join('\n\n')) }}
                />
              </td>
            </tr>
          )}

          {/* Watch for — black bar header + numbered list */}
          {watchFor.length > 0 && (
            <>
              {/* Spacer above the black bar (margin doesn't work on td) */}
              <tr><td style={{ height: '20px', lineHeight: '20px', fontSize: 0 }}>&nbsp;</td></tr>
              <tr>
                <td style={{
                  backgroundColor: '#000000',
                  padding: '11px 15px',
                }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase' as const,
                  }}>
                    What to Watch
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px 15px 8px' }}>
                  <table width="100%" cellPadding="0" cellSpacing="0">
                    <tbody>
                      {watchFor.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{
                            padding: '8px 0',
                            borderBottom: idx < watchFor.length - 1 ? '1px solid #F0F0F0' : 'none',
                            fontSize: '14px',
                            color: EmailColors.text.body,
                            lineHeight: '1.5',
                            verticalAlign: 'top' as const,
                          }}>
                            <span style={{
                              fontFamily: '"JetBrains Mono", Monaco, Consolas, monospace',
                              color: EmailColors.text.muted,
                              fontWeight: 700,
                              marginRight: '10px',
                              fontSize: '12px',
                            }}>
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            {item}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            </>
          )}

          {/* Fallback: full summary text when no structured data */}
          {!hasStructuredData && summaryText && (
            <tr>
              <td style={{ padding: '20px 15px 0' }}>
                <div
                  style={EmailStyles.prose}
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(summaryText) }}
                />
              </td>
            </tr>
          )}

          {/* No data at all */}
          {!hasStructuredData && !summaryText && (
            <tr>
              <td style={{ padding: '0 15px' }}>
                <p style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: EmailColors.text.meta,
                  textAlign: 'center',
                  padding: '20px 0',
                  margin: 0,
                }}>
                  View the full 10-Q filing for quarterly details.
                </p>
              </td>
            </tr>
          )}

          {/* X (Twitter) sentiment — F3-validated payload from xAI x_search */}
          {renderXSentiment && xSentiment && (
            <XSentimentSection
              direction={xSentiment.direction}
              shift={xSentiment.shift}
              confidence={xSentiment.confidence}
              discussionSynthesis={xSentiment.discussionSynthesis}
              factClaims={xSentiment.factClaims}
              citationUrls={xSentiment.citationUrls}
              windowHours={xSentiment.windowHours}
            />
          )}

          {/* Bottom spacer */}
          <tr><td style={{ height: '20px', lineHeight: '20px', fontSize: 0 }}>&nbsp;</td></tr>
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
