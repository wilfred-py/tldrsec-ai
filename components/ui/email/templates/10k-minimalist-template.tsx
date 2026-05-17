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

interface Form10KMinimalistTemplateProps {
  filing: FilingTemplateData;
}

const MONO_FONT = '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Courier New", monospace';

/**
 * Annual-scorecard cell styles — visual twin of the 10-Q Earnings Scorecard
 * but with a 4-column layout (no QoQ for annual filings). Mirrors
 * 10q-minimalist-template's `fin` styles so the two templates render
 * identically across the shared columns.
 *
 * Color is applied ONLY to the % delta pill — labels and dollar values
 * stay neutral so the green/red chip carries the tone without competing
 * with the numbers.
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
 * Normalize value to 2dp for visual consistency: `$215.94B`, `71.10%`,
 * `$4.90`. Anything unparseable (e.g. "N/A", "—") passes through.
 * Mirrors 10q-minimalist-template's formatValue.
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
      {/* Materiality badge at the top — the rationale text + "Wrong call?"
          link have moved to the BOTTOM (above the footer CTA) per v12
          polish, so the top of the email stays clean. The rationale block
          is rendered below the WIM section. */}
      {(() => {
        const materialitySignal = extractMaterialitySignal(summaryData);
        const materialityBadge = materialityToBadge(materialitySignal);
        const signal = materialityBadge ?? { label: 'ANNUAL REPORT', colorKey: 'neutral' as const };
        return (
          <FormPlusMaterialityBadgeRow
            filingType={filingType || '10-K'}
            signal={signal}
          />
        );
      })()}

      {/* Smart Brevity body — tr-per-section structure mirroring 10-Q so the
          black scorecard / watch-for bars span the full email width
          (previously inset by the body td's 15px horizontal padding). */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>

          {/* STORY-FIRST: summary prose leads the body. Pills wrap inline %
              tokens for skim-able semantics. */}
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

          {/* Annual Scorecard — visual twin of 10-Q Earnings Scorecard.
              4-col layout: Metric | Previous | Latest | YoY. No arrow —
              prior/latest sit in their own right-aligned columns. */}
          {dataRows.length > 0 && (
            <>
              {/* Spacer above the black bar (margin doesn't work on td) */}
              <tr><td style={{ height: '20px', lineHeight: '20px', fontSize: 0 }}>&nbsp;</td></tr>
              {/* Full-width black "ANNUAL SCORECARD" bar */}
              <tr>
                <td style={{ backgroundColor: '#000000', padding: '11px 15px' }}>
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
                          Annual Scorecard
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

              {/* Column headers — 4 columns: Metric | Previous | Latest | YoY */}
              <tr>
                <td style={{ padding: '0' }}>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse' as const }}>
                    <thead>
                      <tr>
                        <th style={fin.headMetric}>Metric</th>
                        <th style={fin.headNum}>Previous</th>
                        <th style={fin.headNum}>Latest</th>
                        <th style={fin.headNumLast}>YoY</th>
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
                            <td style={fin.cellDeltaLast}>
                              {row.change ? <PillDelta value={row.change} /> : <span style={fin.dash}>—</span>}
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

          {/* Segment mix — horizontal bar chart for revenue breakdown.
              Email-safe: nested <table> cells with width percentages
              (no <svg>, no <canvas>). Layout per row:
                [name 120px] [bar with inline %] [revenue] [growth pill right-aligned]
              Bar widths use floor+normalize so even 1%-share segments
              have room for their inline % label. Raw share % is what's
              displayed — only visual width is adjusted. */}
          {segments && segments.length > 0 && (
            <tr>
              <td style={{ padding: '20px 15px 0' }}>
                {(() => {
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
                  // Palette: each entry has the segment's accent color (fg),
                  // its CURRENT-year bar background (bg), and a LIGHTER
                  // background (bgLight) for the prior-year underlay bar.
                  // bgLight is bg mixed ~50% toward white so the prior bar
                  // reads as "secondary" without losing the segment's color
                  // identity.
                  const palette = [
                    { bg: '#FEF3C7', bgLight: '#FEF9E3', fg: '#92400E' }, // amber
                    { bg: '#EEF2FF', bgLight: '#F6F8FF', fg: '#4338CA' }, // indigo
                    { bg: '#F1F5F9', bgLight: '#F8FAFC', fg: '#475569' }, // slate
                    { bg: '#EDE9FE', bgLight: '#F6F4FF', fg: '#5B21B6' }, // violet
                    { bg: '#EBF8FF', bgLight: '#F5FCFF', fg: '#1E40AF' }, // blue
                    { bg: '#F5F3FF', bgLight: '#FAF9FF', fg: '#6D28D9' }, // purple
                  ];
                  const rawPcts = segments.map((_, idx) =>
                    total > 0 ? (weights[idx] / total) * 100 : 100 / segments.length,
                  );

                  // Derive prior-year revenue per segment from current + YoY
                  // growth: prior = current / (1 + growth/100). When growth
                  // is missing or unparseable, prior defaults to current
                  // (renders as a same-width prior bar — visually a no-op).
                  const parseGrowth = (g: string | number | undefined): number => {
                    if (g === undefined || g === null) return 0;
                    const s = String(g).trim();
                    const m = s.match(/^([+-]?\d+(?:\.\d+)?)\s*%?$/);
                    if (!m) return 0;
                    const n = parseFloat(m[1]);
                    return isNaN(n) ? 0 : n;
                  };
                  const priorWeights = segments.map((s, idx) => {
                    const growth = parseGrowth(s.growth);
                    if (growth === -100) return 0;
                    return weights[idx] / (1 + growth / 100);
                  });

                  // Bar widths use sqrt of absolute revenue relative to the
                  // largest current segment. This (a) keeps single-digit
                  // segments visually meaningfully smaller than two-digit
                  // ones, (b) shows real growth/degrowth between the prior
                  // and current bar — the gap between the two bar widths
                  // IS the YoY jump in visible form.
                  const maxRev = Math.max(...weights, ...priorWeights);
                  const sqrtCurrentDisplay = weights.map(w =>
                    maxRev > 0 ? (Math.sqrt(w) / Math.sqrt(maxRev)) * 100 : 0,
                  );
                  const sqrtPriorDisplay = priorWeights.map(w =>
                    maxRev > 0 ? (Math.sqrt(w) / Math.sqrt(maxRev)) * 100 : 0,
                  );
                  // Floor at 4% so even tiny segments still show a visible
                  // bar fragment.
                  const displayPcts = sqrtCurrentDisplay.map(d => Math.max(d, 4));
                  const displayPctsPrior = sqrtPriorDisplay.map(d => Math.max(d, 4));
                  return (
                    <>
                      <div style={{ ...EmailStyles.watchForHeader, marginBottom: '10px' }}>Segment mix:</div>

                      {/* Per-row segment chart. Each row has TWO stacked
                          bars: the current-year bar on top (accent border +
                          full color) and a lighter prior-year bar
                          underneath. The visible gap between the two bars
                          is the YoY revenue jump rendered visually — wider
                          top bar = growth, narrower top bar = shrinkage.
                          Bar widths use sqrt(abs revenue) / sqrt(max
                          current revenue) so single-digit segments still
                          read meaningfully smaller than two-digit ones,
                          while preserving real growth/degrowth visibility. */}
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {segments.map((s, idx) => {
                            const rawPct = rawPcts[idx];
                            const currentDisplay = displayPcts[idx];
                            const priorDisplay = displayPctsPrior[idx];
                            const colors = palette[idx % palette.length];
                            const pctText = `${rawPct.toFixed(0)}%`;
                            return (
                              <tr key={idx}>
                                <td style={{
                                  padding: '6px 0',
                                  fontSize: '13px',
                                  color: '#374151',
                                  whiteSpace: 'nowrap' as const,
                                  paddingRight: '12px',
                                  width: '120px',
                                  verticalAlign: 'middle' as const,
                                }}>
                                  {s.name}
                                </td>
                                <td style={{ padding: '6px 0' }}>
                                  {/* Dual-bar group rendered as TWO SEPARATE
                                      nested tables, stacked. v11 used a
                                      single table with two rows for the
                                      current/prior bars; HTML table layout
                                      reconciles column widths across rows,
                                      so the prior cell's width was being
                                      forced to match the current cell —
                                      making both bars look the same length.
                                      Separate tables per bar means each
                                      bar's td width is honored
                                      independently. The right-hand
                                      value/pill column stays beside the
                                      bar pair. */}
                                  <table width="100%" cellPadding="0" cellSpacing="0">
                                    <tbody>
                                      <tr>
                                        <td style={{ width: '70%', verticalAlign: 'middle' as const }}>
                                          {/* Current-year bar (top, full color, accent border) */}
                                          <table width="100%" cellPadding="0" cellSpacing="0">
                                            <tbody>
                                              <tr>
                                                <td width={`${Math.max(2, Math.round(currentDisplay))}%`} style={{
                                                  height: '14px',
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
                                                <td>&nbsp;</td>
                                              </tr>
                                            </tbody>
                                          </table>
                                          {/* Prior-year bar (bottom, neutral grey, thinner) */}
                                          <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginTop: '2px' }}>
                                            <tbody>
                                              <tr>
                                                <td width={`${Math.max(2, Math.round(priorDisplay))}%`} style={{
                                                  height: '6px',
                                                  backgroundColor: '#E5E7EB',
                                                  borderLeft: `3px solid ${colors.fg}`,
                                                  fontSize: 0,
                                                  lineHeight: '6px',
                                                }}>
                                                  &nbsp;
                                                </td>
                                                <td>&nbsp;</td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </td>
                                        <td style={{
                                          paddingLeft: '10px',
                                          whiteSpace: 'nowrap' as const,
                                          fontSize: '12px',
                                          color: '#111827',
                                          fontFamily: MONO_FONT,
                                          fontVariantNumeric: 'tabular-nums' as const,
                                          verticalAlign: 'middle' as const,
                                        }}>
                                          {String(s.revenue)}
                                        </td>
                                        <td style={{
                                          textAlign: 'right' as const,
                                          whiteSpace: 'nowrap' as const,
                                          paddingLeft: '8px',
                                          verticalAlign: 'middle' as const,
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
              </td>
            </tr>
          )}

          {/* Key takeaways — additional points beyond the summary lede */}
          {storyText && (
            <tr>
              <td style={{ padding: '20px 15px 0' }}>
                <div
                  style={EmailStyles.prose}
                  dangerouslySetInnerHTML={{ __html: wrapPercentsInPills(markdownToHtml(storyText)) }}
                />
              </td>
            </tr>
          )}

          {/* X (Twitter) sentiment — standalone section above WIM.
              v12 removed the "What to Watch" section entirely; the risks
              that used to live there are now folded into the
              whyItMatters synthesis below. */}
          <tr>
            <td>
              <XSentimentBlock rawData={summaryData} formType="10-K" />
            </td>
          </tr>

          {/* Fallback: when no structured data, render full summaryText */}
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
                  View the full 10-K filing for details.
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
          Watch" section was removed, and the forward-looking risks that
          would have lived there are folded into this multi-paragraph
          prose. Black bar header gives it visual weight (matches
          scorecard) since it now carries the synthesis load alone. */}
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

      {/* SEC filing link + materiality rationale + "Wrong call?" feedback —
          moved to the bottom per v12 polish. The SEC link is rendered as
          a plain blue hyperlink (no longer the email's primary CTA — that
          slot is now the marketing "Want more filings like this?" button
          in EmailFooter). */}
      {(() => {
        const materialitySignal = extractMaterialitySignal(summaryData);
        const materialityBadge = materialityToBadge(materialitySignal);
        const showRationale = materialityBadge !== null;
        const feedbackUrl = buildMaterialityFeedbackMailto({
          ticker: displayTicker,
          formType: filingType || '10-K',
        });
        return (
          <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginTop: '20px' }}>
            <tbody>
              {filingUrl && (
                <tr>
                  <td style={{ padding: '0 15px 8px', fontSize: '13px' }}>
                    <a
                      href={filingUrl}
                      style={{
                        color: EmailColors.semantic.accent,
                        textDecoration: 'underline',
                        fontWeight: 500,
                      }}
                    >
                      View original filing on SEC.gov →
                    </a>
                  </td>
                </tr>
              )}
              {showRationale && (
                <tr>
                  <td style={{ padding: '0 15px 16px', fontSize: '11px', color: EmailColors.text.muted }}>
                    <em>{materialitySignal.rationale}</em>{' '}
                    <a
                      href={feedbackUrl}
                      style={{ color: EmailColors.text.muted, textDecoration: 'underline' }}
                    >
                      Wrong call?
                    </a>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        );
      })()}

      {/* Footer with marketing CTA — "Want more filings like this?" links
          to the landing page (NOT the SEC filing). The SEC filing link
          is above this block, rendered as a plain blue hyperlink. */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || '10-K'}
        marketingCta
      />
    </div>
  );
}

export default Form10KMinimalistTemplate;
