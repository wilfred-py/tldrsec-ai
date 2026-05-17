import * as React from 'react';
import { EmailColors, EmailStyles, isUsableMetricRow, markdownToHtml } from '../design-system';
import { EmailLeadHeader } from './sections/EmailLeadHeader';
import { FormPlusMaterialityBadgeRow } from './sections/FormPlusMaterialityBadgeRow';
import { EmailFooter } from './sections/EmailFooter';
import { StalenessBanner } from './sections/StalenessBanner';
import { HangingBulletItem } from './sections/BulletList';
import { XSentimentBlock } from './sections/XSentimentBlock';
import { PillDelta } from './sections/PillDelta';
import { FilingTemplateData } from '../../../../lib/email/types';
import {
  extractMaterialitySignal,
  materialityToBadge,
  buildMaterialityFeedbackMailto,
} from '../../../../lib/email/materiality';
import { wrapPercentsInPills, escapeHtmlMinimal } from '../../../../lib/email/pill-pct';

interface Form10KMinimalistTemplateProps {
  filing: FilingTemplateData;
}

const MONO_FONT = '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Courier New", monospace';

/**
 * Minimalist 10-K email template — Smart Brevity, story-first layout.
 *
 * Order (top → bottom):
 *   Header → Materiality badge → Summary/story → Scorecard → Segment mix
 *   → Watch for → X sentiment → Why it matters → Footer
 *
 * Story-first is deliberate: the long-form summary is the magazine-cover
 * lede; "Why it matters" is a closer that adds interpretation AFTER the
 * data has established the picture. The WIM section sits below the
 * X-sentiment block so it can pull on the same factClaims/discussion
 * context the model just saw at prompt time.
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
    priorValue?: string | number;
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

  // "Why it matters" content. Primary path: the model produced a real
  // interpretive sentence via the rewritten WIM prompt (40-400 chars,
  // forbidden to restate metrics). Fallback path: model returned empty
  // string OR omitted the field. We build a pill-chip composite from
  // financialHighlights as a graceful degradation — same pattern as the
  // 10-Q template's WIM fallback. This is what renders BEFORE the prompt
  // rewrite ships to flag-on cohorts; once the model produces real prose,
  // this fallback rarely fires.
  const modelWhyItMatters = typeof rawData?.whyItMatters === 'string'
    ? rawData.whyItMatters.trim()
    : '';
  let whyItMatters: React.ReactNode = null;
  if (modelWhyItMatters.length > 0) {
    whyItMatters = modelWhyItMatters;
  } else if (financialHighlights && financialHighlights.length > 0) {
    const withChanges = financialHighlights.filter(h => h.change);
    if (withChanges.length > 0) {
      const parts = withChanges.slice(0, 3).map((h, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && '; '}
          {h.label} <PillDelta value={h.change as string | number} /> YoY
        </React.Fragment>
      ));
      whyItMatters = <>{parts}.</>;
    }
  } else if (keyPoints && keyPoints.length > 1) {
    whyItMatters = keyPoints[1];
  } else if (summaryText) {
    const sentences = summaryText.split(/(?<=[.!?])\s+/);
    whyItMatters = sentences.length > 1 ? sentences[1] : '';
  }

  // Data snapshot rows: top financial metrics. Carries priorValue when the
  // LLM emitted a prior-year value alongside the current — renders in
  // dedicated columns so prior/arrow/current/pill all align vertically
  // across rows.
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

  // Story (the summary lede) — pull from summary field first, falling back
  // to keyPoints. The story moves to ABOVE the scorecard in this layout —
  // it's the magazine-cover paragraph that sets the picture before the
  // numbers land.
  const summaryProse = typeof rawData?.summary === 'string' && rawData.summary.trim()
    ? rawData.summary.trim()
    : summaryText || '';
  const storyParts: string[] = [];
  if (keyPoints && keyPoints.length > 1) {
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

              {/* STORY-FIRST: summary prose leads the body — the magazine-cover
                  paragraph that sets the narrative BEFORE the scorecard
                  numbers land. Moved here from the post-scorecard slot per
                  autoplan PR1-polish D3=A. Inline % tokens are wrapped in
                  red/green/neutral pill chips by wrapPercentsInPills so the
                  prose reads with the same skim-able semantics as the
                  scorecard. */}
              {summaryProse && (
                <div
                  style={{ ...EmailStyles.prose, marginTop: '8px' }}
                  dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(markdownToHtml(summaryProse)) }}
                />
              )}

              {/* Data snapshot — financial metrics.
                  5-column layout for vertical alignment of prior/arrow/current/pill
                  across rows: METRIC | PRIOR | → | CURRENT | PILL */}
              {dataRows.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>

                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '4px', borderCollapse: 'collapse' as const }}>
                    <tbody>
                      {dataRows.map((row, idx) => {
                        const borderBottom = idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none';
                        const cellBase = {
                          borderBottom,
                          fontFamily: MONO_FONT,
                          fontVariantNumeric: 'tabular-nums' as const,
                          whiteSpace: 'nowrap' as const,
                        };
                        // Tightened layout v5 — arrows are now visually snug
                        // to the current value. Prior cell ends with the
                        // arrow on its right edge (zero right-padding); the
                        // current cell is LEFT-aligned with a tiny left
                        // padding so the value starts immediately after the
                        // arrow. The right edge of current is ragged across
                        // rows by design — the pill column to the right
                        // anchors the row's right-edge alignment.
                        return (
                          <tr key={idx}>
                            <td style={{
                              ...EmailStyles.dataLabel,
                              padding: '10px 0',
                              borderBottom,
                              width: '40%',
                            }}>{row.label}</td>
                            <td style={{
                              ...cellBase,
                              fontSize: '13px',
                              color: EmailColors.text.muted,
                              textAlign: 'right' as const,
                              padding: '10px 0',
                            }}>
                              {row.priorValue ? (
                                <>
                                  {row.priorValue}
                                  <span style={{ margin: '0 6px', color: EmailColors.text.muted }}>→</span>
                                </>
                              ) : null}
                            </td>
                            <td style={{
                              ...cellBase,
                              fontSize: '13px',
                              fontWeight: 600,
                              color: '#111827',
                              textAlign: 'left' as const,
                              padding: '10px 12px 10px 0',
                              width: '100%',
                            }}>
                              {row.value}
                            </td>
                            <td style={{
                              padding: '10px 0',
                              borderBottom,
                              textAlign: 'right' as const,
                              whiteSpace: 'nowrap' as const,
                            }}>
                              {row.change ? <PillDelta value={row.change} /> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Segment mix — horizontal bar chart for revenue breakdown.
                  Email-safe: nested <table> cells with width percentages
                  (no <svg>, no <canvas>). Layout per row:
                    [name 120px] [bar — scaled to display ≥ MIN_DISPLAY_PCT
                    with the % label INSIDE the bar] [revenue] [growth pill
                    right-aligned at row's far right]
                  Bar widths use a floor+normalize scale so even 1%-share
                  segments get a bar wide enough to fit their % label
                  inline. Raw share % is still what's displayed in the
                  label — only the visual width is adjusted. */}
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

                // True share %: what the label says.
                const rawPcts = segments.map((_, idx) =>
                  total > 0 ? (weights[idx] / total) * 100 : 100 / segments.length,
                );

                // Display width: apply a floor so every bar is wide enough
                // to fit its inline % text (≈ 24-32px depending on label
                // length, which works out to ~6-7% of a 540px-wide inner
                // table). Then normalize so the displayed widths still sum
                // to 100%. The label text is the RAW share — only the
                // visual width is adjusted.
                const MIN_DISPLAY_PCT = 7;
                const floored = rawPcts.map(p => Math.max(p, MIN_DISPLAY_PCT));
                const flooredTotal = floored.reduce((a, b) => a + b, 0);
                const displayPcts = floored.map(p => (p / flooredTotal) * 100);

                return (
                  <>
                    <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                      <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                    </table>
                    <div style={{ ...EmailStyles.watchForHeader, marginBottom: '10px' }}>Segment mix:</div>
                    <table width="100%" cellPadding="0" cellSpacing="0">
                      <tbody>
                        {segments.map((s, idx) => {
                          const rawPct = rawPcts[idx];
                          const displayPct = displayPcts[idx];
                          const colors = palette[idx % palette.length];
                          const pctText = `${rawPct.toFixed(0)}%`;
                          return (
                            <tr key={idx}>
                              <td style={{
                                padding: '4px 0',
                                fontSize: '13px',
                                color: '#374151',
                                whiteSpace: 'nowrap' as const,
                                paddingRight: '12px',
                                width: '120px',
                              }}>
                                {s.name}
                              </td>
                              <td style={{ padding: '4px 0' }}>
                                {/* 3-column inner table: bar | revenue (left) | growth pill (right-aligned).
                                    Bar width uses normalized displayPct so even small segments
                                    have room for their inline % label. The pill cell is
                                    pinned to the right edge of the row. */}
                                <table width="100%" cellPadding="0" cellSpacing="0">
                                  <tbody>
                                    <tr>
                                      <td width={`${Math.max(2, Math.round(displayPct))}%`} style={{
                                        height: '16px',
                                        backgroundColor: colors.bg,
                                        borderLeft: `3px solid ${colors.fg}`,
                                        fontSize: '11px',
                                        color: colors.fg,
                                        fontWeight: 600,
                                        fontFamily: MONO_FONT,
                                        paddingLeft: '6px',
                                        whiteSpace: 'nowrap' as const,
                                      }}>
                                        {pctText}
                                      </td>
                                      <td style={{
                                        paddingLeft: '10px',
                                        whiteSpace: 'nowrap' as const,
                                        fontSize: '12px',
                                        color: '#111827',
                                        fontFamily: MONO_FONT,
                                        fontVariantNumeric: 'tabular-nums' as const,
                                      }}>
                                        {String(s.revenue)}
                                      </td>
                                      <td style={{
                                        textAlign: 'right' as const,
                                        whiteSpace: 'nowrap' as const,
                                        paddingLeft: '8px',
                                      }}>
                                        {s.growth && <PillDelta value={s.growth} size="small" />}
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

              {/* Key takeaways — additional points beyond what's in the summary lede */}
              {storyText && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>

                  <div
                    style={EmailStyles.prose}
                    dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(markdownToHtml(storyText)) }}
                  />
                </>
              )}

              {/* Watch for — risk factors. Each item's % tokens are
                  pill-wrapped via HangingBulletItem's html prop. */}
              {watchForItems.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div style={EmailStyles.watchForHeader}>Watch for:</div>
                  {watchForItems.map((risk, idx) => (
                    <HangingBulletItem
                      key={idx}
                      html={wrapPercentsInPills(escapeHtmlMinimal(risk))}
                    />
                  ))}
                </>
              )}

              {/* Fallback: when no structured data, render full summaryText */}
              {!hasStructuredData && !summaryProse && summaryText && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div
                    style={EmailStyles.prose}
                    dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(markdownToHtml(summaryText)) }}
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

      {/* Why it matters — moved to the END of the body content per
          autoplan PR1-polish D3=A. The story above sets the picture; this
          section closes with interpretation. When the rewritten WIM prompt
          fires (flag on, 10-K), the model produces a real interpretive
          sentence here. When it doesn't, the pill-chip fallback shows the
          top-3 YoY changes — same visual register as the scorecard.
          String-path % tokens get pill-wrapped inline; ReactNode-path
          (the fallback) already uses PillDelta. */}
      {whyItMatters && (
        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginTop: '12px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '0 15px 16px' }}>
                <p style={EmailStyles.whyItMatters}>
                  <strong style={{ color: '#000000' }}>Why it matters: </strong>
                  {typeof whyItMatters === 'string' ? (
                    <span dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(escapeHtmlMinimal(whyItMatters)) }} />
                  ) : (
                    whyItMatters
                  )}
                </p>
              </td>
            </tr>
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
