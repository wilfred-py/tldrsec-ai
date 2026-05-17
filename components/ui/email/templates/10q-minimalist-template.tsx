import * as React from 'react';
import { EmailColors, EmailStyles, isUsableMetricRow, markdownToHtml } from '../design-system';
import { EmailLeadHeader } from './sections/EmailLeadHeader';
import { FormPlusMaterialityBadgeRow } from './sections/FormPlusMaterialityBadgeRow';
import { EmailFooter } from './sections/EmailFooter';
import { StalenessBanner } from './sections/StalenessBanner';
import { XSentimentBlock } from './sections/XSentimentBlock';
import { PillDelta, MetricPill } from './sections/PillDelta';
import { FilingTemplateData } from '../../../../lib/email/types';
import {
  extractMaterialitySignal,
  materialityToBadge,
  buildMaterialityFeedbackMailto,
} from '../../../../lib/email/materiality';
import { wrapPercentsInPills } from '../../../../lib/email/pill-pct';

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
 * 5-column grid: METRIC | PREVIOUS | LATEST | YoY | QoQ.
 * Color is applied ONLY to the % delta pills, never to the dollar values.
 * "Previous" is its own column (added 2026-05-17 per autoplan PR1-polish
 * D3=A) — previously rendered inline in Latest as `[muted prior] → [current]`,
 * which broke vertical alignment when prior strings had different lengths.
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
    padding: '12px 10px 8px',
    borderBottom: `1px solid ${EmailColors.structure.border}`,
  },
  headNumLast: {
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
  cellPrior: {
    fontSize: '13px',
    fontWeight: 400,
    color: EmailColors.text.muted,
    fontFamily: MONO_FONT,
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
    padding: '11px 10px',
    verticalAlign: 'middle' as const,
    whiteSpace: 'nowrap' as const,
  },
  cellValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: EmailColors.text.headline,
    fontFamily: MONO_FONT,
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
    padding: '11px 10px',
    verticalAlign: 'middle' as const,
    whiteSpace: 'nowrap' as const,
  },
  cellDelta: {
    textAlign: 'right' as const,
    padding: '11px 8px',
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

/**
 * Normalize the "Latest" column value to two decimal places so the scorecard
 * reads with consistent precision: `$611M` → `$611.00M`, `$3.59` → `$3.59`,
 * `51.43%` → `51.43%`, `$1.2B` → `$1.20B`. Anything we can't parse (e.g.
 * "N/A", "—") passes through unchanged.
 */
function formatValue(raw: string): string {
  const trimmed = raw.trim();

  const dollarMagnitude = trimmed.match(/^(\$?)(-?\d+(?:\.\d+)?)\s*([MBKT])$/i);
  if (dollarMagnitude) {
    const num = parseFloat(dollarMagnitude[2]);
    if (!isNaN(num)) return `${dollarMagnitude[1]}${num.toFixed(2)}${dollarMagnitude[3].toUpperCase()}`;
  }

  const plainDollar = trimmed.match(/^(\$)(-?[\d,]+(?:\.\d+)?)$/);
  if (plainDollar) {
    const num = parseFloat(plainDollar[2].replace(/,/g, ''));
    if (!isNaN(num)) return `${plainDollar[1]}${num.toFixed(2)}`;
  }

  const percent = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (percent) {
    const num = parseFloat(percent[1]);
    if (!isNaN(num)) return `${num.toFixed(2)}%`;
  }

  return trimmed;
}

/**
 * 10-Q Email Template - Smart Brevity, story-first layout.
 *
 * Order (top → bottom):
 *   Header → Materiality badge → Summary/story → Earnings Scorecard
 *   → Watch for → X sentiment → Why it matters → Footer
 *
 * Story-first is deliberate. "Why it matters" sits at the very bottom
 * (after X sentiment, before the View Filing button) so it can act as a
 * synthesis-of-the-whole-email closer, not a metric restatement above
 * the scorecard.
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
  // Filter out rows whose value is a sentinel placeholder ("N/A", "Null",
  // "$NaN", etc.) before any downstream consumer sees them. The unified-prompt
  // contract instructs the AI to emit "N/A" for unavailable values; the
  // currency normalizer downstream then turns those into "$NaN" by parseFloat.
  // Without this filter the scorecard renders all-"$NaN" rows and the
  // "Why it matters" line says "Revenue is N/A YoY, N/A QoQ".
  const rawFinancialHighlights = rawData?.financialHighlights as Array<{
    label: string;
    value: string | number;
    priorValue?: string | number;
    change?: string | number;
    qoqChange?: string | number;
  }> | undefined;
  const financialHighlights = rawFinancialHighlights?.filter(isUsableMetricRow);

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
      leadSentence = `${h.label}: ${h.value}`;
    } else if (summaryText) {
      leadSentence = summaryText.split(/(?<=[.!?])\s+/)[0] || summaryText;
    }
  }

  // Build "Why it matters" content.
  //
  // Primary path: the model produced a real interpretive sentence via the
  // rewritten WIM prompt (forbidden to restate metrics). Render as text.
  //
  // Fallback path (model returned empty / omitted): build a pill-chip
  // composite from financialHighlights so the field still has something
  // useful. The white-meta block is hard to read with arrow markers — pills
  // match the scorecard's visual register and the chip colors carry the
  // tone (red / green / gray) without an arrow glyph.
  const modelWhyItMatters = typeof rawData?.whyItMatters === 'string'
    ? rawData.whyItMatters.trim()
    : '';
  let whyItMatters: React.ReactNode = null;
  if (modelWhyItMatters.length > 0) {
    whyItMatters = modelWhyItMatters;
  } else if (financialHighlights && financialHighlights.length > 0) {
    const withChanges = financialHighlights.filter(h => h.change || h.qoqChange);
    if (withChanges.length > 0) {
      const parts = withChanges.slice(0, 2).map((h, idx) => {
        const pieces: React.ReactNode[] = [];
        if (h.change) {
          pieces.push(
            <React.Fragment key="yoy">
              <PillDelta value={h.change} />
              <span style={{ marginLeft: '4px', marginRight: '4px' }}> YoY</span>
            </React.Fragment>
          );
        }
        if (h.qoqChange) {
          if (pieces.length > 0) pieces.push(<span key="sep" style={{ marginRight: '4px' }}>,</span>);
          pieces.push(
            <React.Fragment key="qoq">
              <PillDelta value={h.qoqChange} />
              <span style={{ marginLeft: '4px' }}> QoQ</span>
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={idx}>
            {idx > 0 && '. '}
            {h.label} is {pieces}
          </React.Fragment>
        );
      });
      whyItMatters = <>{parts}.</>;
    }
  }
  if (!whyItMatters && quarterlyTrends && quarterlyTrends.length > 0) {
    const summaries = quarterlyTrends.slice(0, 2).map((t, idx) => {
      const pillValue = t.trend === 'up' ? '+1' : t.trend === 'down' ? '-1' : '0';
      return (
        <React.Fragment key={idx}>
          {idx > 0 && '; '}
          {t.metric} trending <PillDelta value={pillValue} /> at {t.current}
        </React.Fragment>
      );
    });
    whyItMatters = <>{summaries}.</>;
  }
  if (!whyItMatters && summaryText) {
    const sentences = summaryText.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1) {
      whyItMatters = sentences[1];
    }
  }

  // Data snapshot rows: financial metrics with YoY + QoQ in same row.
  // Cap at 6 so the canonical 10-Q metric set fits without scrolling:
  // Revenue, Gross Margin, Operating Margin, FCF Margin, Net Income, EPS.
  const dataRows: { label: string; value: string; priorValue?: string; change?: string | number; qoqChange?: string | number }[] = [];
  if (financialHighlights) {
    for (const h of financialHighlights.slice(0, 6)) {
      dataRows.push({
        label: h.label,
        value: String(h.value),
        priorValue: h.priorValue !== undefined && h.priorValue !== null ? String(h.priorValue) : undefined,
        change: h.change,
        qoqChange: h.qoqChange,
      });
    }
  }

  // Story (summary lede) — moved ABOVE the scorecard per autoplan PR1-polish
  // D3=A. The long-form `summary` field is the magazine-cover paragraph that
  // sets the picture before the data lands.
  const summaryProse = typeof rawData?.summary === 'string' && rawData.summary.trim()
    ? rawData.summary.trim()
    : summaryText || '';

  // Additional story narrative beyond the summary lede: guidance updates +
  // quarterly trends woven together. Defensively coerce — schema says
  // string[] but the LLM occasionally returns objects, which would
  // otherwise render as "[object Object]".
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

      {/* Form badge + materiality signal row — see 10k-minimalist-template
          for the symmetric materiality wiring contract. */}
      {(() => {
        const materialitySignal = extractMaterialitySignal(summaryData);
        const materialityBadge = materialityToBadge(materialitySignal);
        const signal = materialityBadge ?? { label: 'QUARTERLY REPORT', colorKey: 'neutral' as const };
        const showFeedback = materialityBadge !== null;
        const feedbackUrl = buildMaterialityFeedbackMailto({
          ticker: displayTicker,
          formType: filingType || '10-Q',
        });
        return (
          <>
            <FormPlusMaterialityBadgeRow
              filingType={filingType || '10-Q'}
              signal={signal}
            />
            {showFeedback && (
              <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '8px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '0 15px', fontSize: '11px', color: EmailColors.text.muted }}>
                      <em>{materialitySignal.rationale}</em>{' '}
                      <a href={feedbackUrl} style={{ color: EmailColors.text.muted, textDecoration: 'underline' }}>
                        Wrong call?
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </>
        );
      })()}

      {/* Smart Brevity body */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>

          {/* STORY-FIRST: summary prose leads the body. Moved here from
              the post-scorecard slot per autoplan PR1-polish D3=A. Inline
              % tokens get wrapped in red/green/neutral pill chips by
              wrapPercentsInPills for skim-able semantics. */}
          {summaryProse && (
            <tr>
              <td style={{ padding: '12px 15px 4px' }}>
                <div
                  style={EmailStyles.prose}
                  dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(markdownToHtml(summaryProse)) }}
                />
              </td>
            </tr>
          )}

          {/* Data snapshot: black bar header + 5-column financials grid */}
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
                          fontFamily: MONO_FONT,
                        }}>
                          {dataRows.length} metrics
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              {/* Column headers — 5 columns: Metric | Previous | Latest | YoY | QoQ.
                  Previous was inlined into Latest in v3; broken out into its
                  own column for vertical alignment per autoplan PR1-polish D3=A. */}
              <tr>
                <td style={{ padding: '0' }}>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse' as const }}>
                    <thead>
                      <tr>
                        <th style={fin.headMetric}>Metric</th>
                        <th style={fin.headNum}>Previous</th>
                        <th style={fin.headNum}>Latest</th>
                        <th style={fin.headNum}>YoY</th>
                        <th style={fin.headNumLast}>QoQ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.map((row, idx) => {
                        const isOdd = idx % 2 === 1;
                        const rowBg = isOdd ? EmailColors.structure.backgroundAlt : EmailColors.structure.background;
                        return (
                          <tr key={idx} style={{ backgroundColor: rowBg }}>
                            <td style={fin.cellMetric}>{row.label}</td>
                            <td style={fin.cellPrior}>
                              {row.priorValue
                                ? <MetricPill value={formatValue(row.priorValue)} tone="prior" />
                                : <span style={fin.dash}>—</span>}
                            </td>
                            <td style={fin.cellValue}>
                              <MetricPill value={formatValue(row.value)} tone="latest" />
                            </td>
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

          {/* Additional story narrative — guidance + trends. Sits below the
              scorecard; the long-form summary already leads the body above. */}
          {storyParts.length > 0 && (
            <tr>
              <td style={{ padding: '20px 15px 0' }}>
                <div
                  style={EmailStyles.prose}
                  dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(markdownToHtml(storyParts.join('\n\n'))) }}
                />
              </td>
            </tr>
          )}

          {/* X (Twitter) sentiment — standalone section above WIM.
              v12 removed the "What to Watch" section; the forward-looking
              risks are now folded into the whyItMatters synthesis. */}
          <tr>
            <td>
              <XSentimentBlock rawData={summaryData} formType="10-Q" />
            </td>
          </tr>

          {/* Fallback: full summary text when no structured data and no
              summary lede already rendered above */}
          {!hasStructuredData && !summaryProse && summaryText && (
            <tr>
              <td style={{ padding: '20px 15px 0' }}>
                <div
                  style={EmailStyles.prose}
                  dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(markdownToHtml(summaryText)) }}
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

          {/* Bottom spacer */}
          <tr><td style={{ height: '20px', lineHeight: '20px', fontSize: 0 }}>&nbsp;</td></tr>
        </tbody>
      </table>

      {/* Why It Matters — consolidated synthesis section per v12. This is
          now the ONLY interpretive section in the email body: the "What to
          Watch" section was removed, and forward-looking risks are folded
          into this multi-paragraph prose. Black bar header gives it
          visual weight since it now carries the synthesis load alone. When the rewritten WIM prompt fires
          (flag on, 10-Q), the model produces a real interpretive sentence
          that synthesizes the data + sentiment context above. When it
          doesn't, the pill-chip fallback shows YoY/QoQ for the top
          metrics — same visual register as the scorecard pills.
          String-path % tokens get pill-wrapped inline; ReactNode-path
          (the fallback) already uses PillDelta. */}
      {whyItMatters && (
        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginTop: '20px' }}>
          <tbody>
            <tr>
              <td style={{ backgroundColor: '#000000', padding: '11px 15px' }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase' as const,
                }}>
                  Why It Matters
                </span>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '14px 15px 18px' }}>
                {typeof whyItMatters === 'string' ? (
                  <div
                    style={EmailStyles.prose}
                    dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(markdownToHtml(whyItMatters)) }}
                  />
                ) : (
                  <p style={EmailStyles.whyItMatters}>{whyItMatters}</p>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || '10-Q'}
      />
    </div>
  );
}

export default Form10QMinimalistTemplate;
