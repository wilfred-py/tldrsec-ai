import * as React from 'react';
import { EmailColors, EmailStyles, isUsableMetricRow, markdownToHtml } from '../design-system';
import { EmailLeadHeader } from './sections/EmailLeadHeader';
import { FormPlusMaterialityBadgeRow } from './sections/FormPlusMaterialityBadgeRow';
import { EmailFooter } from './sections/EmailFooter';
import { StalenessBanner } from './sections/StalenessBanner';
import { HangingBulletItem } from './sections/BulletList';
import { XSentimentBlock } from './sections/XSentimentBlock';
import { FilingTemplateData } from '../../../../lib/email/types';
import {
  extractMaterialitySignal,
  materialityToBadge,
  buildMaterialityFeedbackMailto,
} from '../../../../lib/email/materiality';

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

  // Data snapshot rows: top financial metrics. Carries priorValue when the
  // LLM emitted a prior-year value alongside the current — renders as
  // "[prior] → [current]" with the prior in light grey, matching the
  // 10-Q scorecard's side-by-side layout.
  const dataRows: { label: string; value: string; priorValue?: string; change?: string | number }[] = [];
  if (financialHighlights) {
    for (const h of financialHighlights.slice(0, 5)) {
      const fh = h as { label: string; value: string | number; priorValue?: string | number; change?: string | number };
      dataRows.push({
        label: fh.label,
        value: String(fh.value),
        priorValue: fh.priorValue !== undefined && fh.priorValue !== null ? String(fh.priorValue) : undefined,
        change: fh.change,
      });
    }
  }

  // Story: segment performance + remaining key takeaways woven into prose
  const storyParts: string[] = [];
  // Segments render as a visual bar chart in the dedicated "Segment mix"
  // section below — skipping the prose duplicate here. Falls back to prose
  // only when there's no structured segment data.
  if (!segments || segments.length === 0) {
    // Backwards-compat: older summaries with segment data nested in
    // keyPoints will still surface via the keyPoints fallback.
  }
  if (keyPoints && keyPoints.length > 1) {
    // Skip the first (used as lead sentence) and weave the rest
    storyParts.push(...keyPoints.slice(1));
  }
  const storyText = storyParts.join(' ');

  // Watch-for items: risk factors
  const watchForItems = riskFactors ? riskFactors.slice(0, 4) : [];

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

      {/* Form badge + materiality signal row.
          materialitySignal is OPTIONAL on summaryJSON — extractor defaults to
          'noise' when absent. For noise we fall back to the existing
          'ANNUAL REPORT' neutral label (no double-rendered badge per autoplan
          Design Decision #15). For high/medium/low we render the materiality
          pill in the existing signal slot. */}
      {(() => {
        const materialitySignal = extractMaterialitySignal(summaryData);
        const materialityBadge = materialityToBadge(materialitySignal);
        const signal = materialityBadge ?? { label: 'ANNUAL REPORT', colorKey: 'neutral' as const };
        const showFeedback = materialityBadge !== null;
        const feedbackUrl = buildMaterialityFeedbackMailto({
          ticker: displayTicker,
          formType: filingType || '10-K',
        });
        return (
          <>
            <FormPlusMaterialityBadgeRow
              filingType={filingType || '10-K'}
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
                        // Derive pill tone from the change value. Mirrors the
                        // 10-Q PillDelta logic: + → green, − → red, 0/null → gray.
                        const changeStr = row.change != null ? String(row.change).trim() : '';
                        const isPositive = /^\+/.test(changeStr) || (changeStr && !changeStr.startsWith('-') && !changeStr.startsWith('−') && parseFloat(changeStr) > 0);
                        const isNegative = /^[-−]/.test(changeStr) || (changeStr && parseFloat(changeStr) < 0);
                        const pillBg = isPositive ? EmailColors.semantic.pillPositiveBg
                          : isNegative ? EmailColors.semantic.pillNegativeBg
                          : EmailColors.semantic.pillNeutralBg;
                        const pillFg = isPositive ? EmailColors.semantic.pillPositiveFg
                          : isNegative ? EmailColors.semantic.pillNegativeFg
                          : EmailColors.semantic.pillNeutralFg;
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
                              {row.priorValue && (
                                <>
                                  <span style={{
                                    color: EmailColors.text.muted,
                                    fontFamily: 'inherit' as const,
                                    fontVariantNumeric: 'tabular-nums' as const,
                                  }}>{row.priorValue}</span>
                                  <span style={{
                                    color: EmailColors.text.muted,
                                    margin: '0 6px',
                                  }}>→</span>
                                </>
                              )}
                              {row.value}
                              {row.change && (
                                <span style={{
                                  display: 'inline-block' as const,
                                  marginLeft: '8px',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: pillBg,
                                  color: pillFg,
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  fontFamily: '"JetBrains Mono", Monaco, Consolas, monospace',
                                  fontVariantNumeric: 'tabular-nums' as const,
                                  letterSpacing: '0.2px',
                                  lineHeight: '1.2',
                                  whiteSpace: 'nowrap' as const,
                                }}>
                                  {changeStr.startsWith('+') ? changeStr : (isPositive ? `+${changeStr}` : changeStr)}
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

              {/* Segment mix — horizontal bar chart for revenue breakdown.
                  Email-safe: uses nested <table> cells with width percentages
                  (no <svg>, no <canvas>). Bar width is proportional to
                  segment revenue. Bars colored from the muted BadgeColors
                  palette so the mix reads at a glance without competing
                  with the scorecard pills. */}
              {segments && segments.length > 0 && (() => {
                // Parse "$185B" / "185" / "$2.3M" into a numeric weight for
                // proportional bar widths. Falls back to equal weights if
                // any segment can't be parsed.
                const parseNum = (v: string | number): number => {
                  if (typeof v === 'number') return v;
                  const s = String(v).trim();
                  const num = parseFloat(s.replace(/[^\d.-]/g, ''));
                  if (isNaN(num)) return 0;
                  const upper = s.toUpperCase();
                  if (upper.includes('B')) return num * 1_000;
                  if (upper.includes('M')) return num;
                  return num;
                };
                const weights = segments.map(s => parseNum(s.revenue));
                const total = weights.reduce((a, b) => a + b, 0);
                const palette = [
                  { bg: '#FEF3C7', fg: '#92400E' }, // amber
                  { bg: '#EEF2FF', fg: '#4338CA' }, // indigo
                  { bg: '#F1F5F9', fg: '#475569' }, // slate
                  { bg: '#EDE9FE', fg: '#5B21B6' }, // violet
                  { bg: '#EBF8FF', fg: '#1E40AF' }, // blue
                  { bg: '#F5F3FF', fg: '#6D28D9' }, // purple
                ];
                return (
                  <>
                    <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                      <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                    </table>
                    <div style={{ ...EmailStyles.watchForHeader, marginBottom: '10px' }}>Segment mix:</div>
                    <table width="100%" cellPadding="0" cellSpacing="0">
                      <tbody>
                        {segments.map((s, idx) => {
                          const pct = total > 0 ? (weights[idx] / total) * 100 : 100 / segments.length;
                          const colors = palette[idx % palette.length];
                          const growthStr = s.growth != null ? String(s.growth).trim() : '';
                          const isPositive = /^\+/.test(growthStr) || (growthStr && parseFloat(growthStr) > 0);
                          const isNegative = /^[-−]/.test(growthStr) || (growthStr && parseFloat(growthStr) < 0);
                          const pillBg = isPositive ? EmailColors.semantic.pillPositiveBg
                            : isNegative ? EmailColors.semantic.pillNegativeBg
                            : EmailColors.semantic.pillNeutralBg;
                          const pillFg = isPositive ? EmailColors.semantic.pillPositiveFg
                            : isNegative ? EmailColors.semantic.pillNegativeFg
                            : EmailColors.semantic.pillNeutralFg;
                          return (
                            <tr key={idx}>
                              <td style={{ padding: '4px 0 4px 0', fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' as const, paddingRight: '12px', width: '120px' }}>
                                {s.name}
                              </td>
                              <td style={{ padding: '4px 0' }}>
                                <table width="100%" cellPadding="0" cellSpacing="0">
                                  <tbody>
                                    <tr>
                                      <td width={`${Math.max(2, Math.round(pct))}%`} style={{
                                        height: '14px',
                                        backgroundColor: colors.bg,
                                        borderLeft: `3px solid ${colors.fg}`,
                                        fontSize: '11px',
                                        color: colors.fg,
                                        fontWeight: 600,
                                        fontFamily: '"JetBrains Mono", Monaco, Consolas, monospace',
                                        paddingLeft: '8px',
                                        whiteSpace: 'nowrap' as const,
                                      }}>
                                        {pct >= 8 ? `${pct.toFixed(0)}%` : ''}
                                      </td>
                                      <td style={{ paddingLeft: '8px', whiteSpace: 'nowrap' as const, fontSize: '12px', color: '#111827', fontFamily: '"JetBrains Mono", Monaco, Consolas, monospace', fontVariantNumeric: 'tabular-nums' as const }}>
                                        {String(s.revenue)}
                                        {s.growth && (
                                          <span style={{
                                            display: 'inline-block' as const,
                                            marginLeft: '6px',
                                            padding: '1px 6px',
                                            borderRadius: '3px',
                                            backgroundColor: pillBg,
                                            color: pillFg,
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            letterSpacing: '0.2px',
                                          }}>
                                            {growthStr.startsWith('+') ? growthStr : (isPositive ? `+${growthStr}` : growthStr)}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                );
              })()}

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
      <XSentimentBlock rawData={summaryData} formType="10-K" />

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || '10-K'}
      />
    </div>
  );
}

export default Form10KMinimalistTemplate;
