import * as React from 'react';
import { EmailColors } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { FilingTemplateData } from '../../../../lib/email/types';
import { extractForm144Data } from '../../../../lib/email/form144-data-extractor';

interface Form144MinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Parse a value that could be string or number to a number
 * Handles: "1,234", "$1,234.56", "1.5M", "2K", 1234, etc.
 */
function parseNumericValue(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;

  // Remove currency symbols and commas
  const cleaned = String(value).replace(/[$,]/g, '');

  // Handle suffixes like K, M, B
  const suffixMatch = cleaned.match(/^([\d.]+)\s*([KMB])$/i);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1]);
    const suffix = suffixMatch[2].toUpperCase();
    const multiplier = suffix === 'B' ? 1000000000 : suffix === 'M' ? 1000000 : suffix === 'K' ? 1000 : 1;
    return num * multiplier;
  }

  return parseFloat(cleaned) || 0;
}

/**
 * Format a value as compact currency display
 */
function formatCompactValue(value: number): string {
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  if (value > 0) return `$${value.toFixed(0)}`;
  return '$0';
}

/**
 * Determine if this is a notable sale (2-level signal system)
 * Notable: >$10M value, mentioned as significant, or part of pattern
 * Routine: Pre-planned 10b5-1, small relative amount, scheduled
 */
function isNotableSale(
  signalStrength: string,
  summaryText: string,
  estimatedValue: number
): boolean {
  const signalLower = signalStrength.toLowerCase();
  const summaryLower = summaryText?.toLowerCase() || '';

  // Check for explicit notable indicators
  if (signalLower.includes('notable') || signalLower.includes('significant') || signalLower.includes('large')) {
    return true;
  }

  // Check for routine indicators
  if (signalLower.includes('routine') || signalLower.includes('10b5-1') || signalLower.includes('scheduled')) {
    return false;
  }

  // Value-based determination: >$10M is notable
  if (estimatedValue >= 10000000) {
    return true;
  }

  // Check summary text for indicators
  if (summaryLower.includes('significant') || summaryLower.includes('large divestiture') || summaryLower.includes('pattern')) {
    return true;
  }

  if (summaryLower.includes('10b5-1') || summaryLower.includes('routine') || summaryLower.includes('scheduled')) {
    return false;
  }

  // Default to notable for moderate-sized sales
  return estimatedValue >= 1000000;
}

/**
 * Get signal configuration (2-level: Notable vs Routine)
 */
function getSignalConfig(isNotable: boolean, has10b51: boolean) {
  if (isNotable) {
    return {
      level: 'NOTABLE SALE',
      verdict: 'Worth Attention',
      description: has10b51
        ? 'Large planned sale under 10b5-1 - significant size warrants review.'
        : 'This transaction size may be relevant to your investment thesis.',
      bgColor: '#FEF3C7',      // Amber 100
      borderColor: '#F59E0B',  // Amber 500
      textColor: '#92400E',    // Amber 800
      icon: '!',
    };
  } else {
    return {
      level: 'ROUTINE FILING',
      verdict: 'Pre-planned Sale',
      description: has10b51
        ? 'Scheduled 10b5-1 trade - no discretionary decision by insider.'
        : 'Likely routine diversification, not a signal about company outlook.',
      bgColor: '#F1F5F9',      // Slate 100
      borderColor: '#94A3B8',  // Slate 400
      textColor: '#475569',    // Slate 600
      icon: '\u2713',
    };
  }
}

/**
 * Format text with bold styling for key values
 */
function formatText(text: string): string {
  if (!text) return '';
  let html = text;
  // Escape all HTML entities to prevent XSS from AI-generated content
  html = html.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;');
  html = html.replace(/</g, '&lt;');
  html = html.replace(/>/g, '&gt;');
  html = html.replace(/"/g, '&quot;');
  html = html.replace(/'/g, '&#39;');
  // Bold dollar amounts
  html = html.replace(
    /(\$[\d,]+(?:\.\d+)?[KMB]?)/g,
    `<strong style="color:${EmailColors.text.headline};font-weight:700;">$1</strong>`
  );
  // Bold percentages
  html = html.replace(
    /(-?\d+(?:\.\d+)?%)/g,
    `<strong style="color:${EmailColors.text.headline};font-weight:700;">$1</strong>`
  );
  // Bold share counts (including decimal values for fractional shares like RSUs/DSUs)
  html = html.replace(
    /([\d,]+(?:\.\d+)?)\s+(shares?)/gi,
    `<strong style="color:${EmailColors.text.headline};font-weight:700;">$1</strong> $2`
  );
  html = html.replace(/—/g, '&mdash;');
  return html;
}

/**
 * Form 144 Email Template - Minimalist Signal-First Design
 *
 * 2-level signal system:
 * - NOTABLE SALE (amber): Large/significant sales worth attention
 * - ROUTINE FILING (gray): Pre-planned 10b5-1 or small regular sales
 */
export function Form144MinimalistTemplate({ filing }: Form144MinimalistTemplateProps) {
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

  const data = summaryData as Record<string, unknown> | undefined;

  // Extract structured data from summaryText if summaryData is sparse
  const extractedData = summaryText ? extractForm144Data(summaryText) : null;

  // Merge data sources - prefer summaryData, fall back to extracted
  const filerName = (data?.filerName || extractedData?.filerName || 'Insider') as string;
  const filerRole = (data?.filerRole || data?.position || extractedData?.filerRole || '') as string;
  const shares = (data?.shares || data?.sharesSold || extractedData?.shares || '') as string;
  const estimatedValue = (data?.estimatedValue || extractedData?.estimatedValue || '') as string;
  const _pricePerShare = (data?.pricePerShare || extractedData?.pricePerShare || '') as string;
  const percentOfHoldings = (data?.percentOfHoldings || data?.percentOwnership || extractedData?.percentOfHoldings || '') as string;
  const tradingPlan = (data?.tradingPlan || extractedData?.tradingPlan || '') as string;
  const signalStrength = (data?.signalStrength || extractedData?.signalStrength || '') as string;
  const remainingHoldings = (data?.remainingHoldings || data?.sharesRemaining || extractedData?.remainingHoldings || '') as string;
  const sharesOutstanding = (data?.sharesOutstanding || '') as string;
  const investorImplication = (data?.investorImplication || extractedData?.investorImplication || '') as string;

  const displayTicker = symbol || ticker || 'N/A';

  // Parse values for signal determination
  const estimatedValueNum = parseNumericValue(estimatedValue);
  const has10b51 = tradingPlan.toLowerCase().includes('10b5-1') ||
    signalStrength.toLowerCase().includes('10b5-1') ||
    (summaryText?.toLowerCase() || '').includes('10b5-1');

  // Determine signal level (2-level system)
  const isNotable = isNotableSale(signalStrength, summaryText || '', estimatedValueNum);
  const signal = getSignalConfig(isNotable, has10b51);

  // Extract first sentence as the headline
  let headline = summaryText?.split(/(?<=[.!?])\s+/)[0] || '';
  if (headline.length < 30 && summaryText && summaryText.length > headline.length) {
    headline = summaryText;
  }

  // Determine if we have meaningful transaction data
  const hasTransactionData = shares || estimatedValue || percentOfHoldings;

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
        filingType={filingType || 'Form 144'}
        filingDate={filingDate}
        filerName={filerName}
        filerRole={filerRole}
      />

      {/* Main content */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>

              {/* ═══════════════════════════════════════════════════════════
                  THE VERDICT - 2-Level Signal (Notable vs Routine)
                  ═══════════════════════════════════════════════════════════ */}
              <table width="100%" cellPadding="0" cellSpacing="0" style={{
                backgroundColor: signal.bgColor,
                borderRadius: '12px',
                marginBottom: '16px',
                border: `2px solid ${signal.borderColor}`,
              }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '20px' }}>
                      {/* Signal Level Badge */}
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          <tr>
                            <td>
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 12px',
                                backgroundColor: signal.borderColor,
                                color: '#FFFFFF',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: 700,
                                letterSpacing: '1px',
                                textTransform: 'uppercase' as const,
                              }}>
                                {signal.icon} {signal.level}
                              </span>
                            </td>
                          </tr>

                          {/* The Verdict */}
                          <tr>
                            <td style={{ paddingTop: '12px' }}>
                              <div style={{
                                fontSize: '24px',
                                fontWeight: 700,
                                color: signal.textColor,
                                lineHeight: '1.2',
                              }}>
                                {signal.verdict}
                              </div>
                            </td>
                          </tr>

                          {/* Quick explanation */}
                          <tr>
                            <td style={{ paddingTop: '8px' }}>
                              <div style={{
                                fontSize: '14px',
                                lineHeight: '1.5',
                                color: signal.textColor,
                                opacity: 0.9,
                              }}>
                                {signal.description}
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ═══════════════════════════════════════════════════════════
                  KEY METRICS - Single row: Value first, then Shares
                  ═══════════════════════════════════════════════════════════ */}
              {hasTransactionData && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '16px' }}>
                  <tbody>
                    <tr>
                      <td>
                        <table width="100%" cellPadding="0" cellSpacing="0">
                          <tbody>
                            <tr>
                              {/* Estimated Value Card - FIRST (most important) */}
                              {estimatedValue && (
                                <td style={{
                                  width: shares ? '48%' : '100%',
                                  padding: '16px',
                                  backgroundColor: '#FEF2F2',
                                  borderRadius: '8px',
                                  verticalAlign: 'top',
                                }}>
                                  <div style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: '#991B1B',
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: '0.5px',
                                    marginBottom: '4px',
                                  }}>
                                    Estimated Value
                                  </div>
                                  <div style={{
                                    fontSize: '22px',
                                    fontWeight: 800,
                                    color: '#DC2626',
                                    lineHeight: '1.2',
                                  }}>
                                    {estimatedValue || formatCompactValue(estimatedValueNum)}
                                  </div>
                                  {percentOfHoldings && (
                                    <div style={{
                                      fontSize: '12px',
                                      color: '#991B1B',
                                      opacity: 0.8,
                                      marginTop: '4px',
                                    }}>
                                      {percentOfHoldings} of holdings
                                    </div>
                                  )}
                                </td>
                              )}

                              {/* Gap spacer */}
                              {shares && estimatedValue && (
                                <td style={{ width: '4%' }}></td>
                              )}

                              {/* Shares to Sell Card - SECOND */}
                              {shares && (
                                <td style={{
                                  width: estimatedValue ? '48%' : '100%',
                                  padding: '16px',
                                  backgroundColor: '#FEF2F2',
                                  borderRadius: '8px',
                                  verticalAlign: 'top',
                                }}>
                                  <div style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: '#991B1B',
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: '0.5px',
                                    marginBottom: '4px',
                                  }}>
                                    Shares to Sell
                                  </div>
                                  <div style={{
                                    fontSize: '22px',
                                    fontWeight: 800,
                                    color: '#DC2626',
                                    lineHeight: '1.2',
                                  }}>
                                    {shares}
                                  </div>
                                  {remainingHoldings && parseNumericValue(remainingHoldings) > 0 && (
                                    <div style={{
                                      fontSize: '12px',
                                      color: '#991B1B',
                                      opacity: 0.8,
                                      marginTop: '4px',
                                    }}>
                                      → {remainingHoldings} remaining
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  OWNERSHIP IMPACT - Before/after ownership comparison
                  Matches Form 4 visual: before → ↓ → after (percentage)
                  ═══════════════════════════════════════════════════════════ */}
              {/* Ownership Impact: Only show when we have the insider's actual remaining holdings.
                  sharesOutstanding is the issuer's total class outstanding — NOT the insider's position.
                  Showing issuer-level data as "ownership impact" is misleading for director/officer filers. */}
              {shares && remainingHoldings && parseNumericValue(remainingHoldings) > 0 && (() => {
                const sharesNum = parseNumericValue(shares);
                const remainingNum = parseNumericValue(remainingHoldings);
                if (!Number.isFinite(sharesNum) || !Number.isFinite(remainingNum)) return null;
                const outstandingNum = parseNumericValue(sharesOutstanding);
                const beforeNum = sharesNum + remainingNum;
                const pctChange = beforeNum > 0 ? -((sharesNum / beforeNum) * 100) : 0;
                const pctColor = '#DC2626'; // Sales are always red
                const pctDisplay = `${pctChange.toFixed(1)}%`;

                return (
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '16px' }}>
                    <tbody>
                      <tr>
                        <td style={{
                          padding: '16px',
                          backgroundColor: EmailColors.structure.backgroundAlt,
                          borderRadius: '8px',
                          textAlign: 'center',
                        }}>
                          <div style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: EmailColors.text.meta,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.5px',
                            marginBottom: '8px',
                          }}>
                            Ownership Impact
                          </div>
                          {/* Previous ownership (before sale) */}
                          <div style={{
                            fontSize: '14px',
                            color: EmailColors.text.muted,
                            marginBottom: '6px',
                          }}>
                            {beforeNum.toLocaleString()} shares
                          </div>
                          {/* Direction arrow */}
                          <div style={{
                            fontSize: '20px',
                            lineHeight: '1',
                            margin: '4px 0',
                            color: pctColor,
                          }}>
                            ↓
                          </div>
                          {/* New ownership (after sale) */}
                          <div style={{
                            fontSize: '16px',
                            fontWeight: 700,
                            color: EmailColors.text.headline,
                            marginTop: '6px',
                          }}>
                            {remainingNum.toLocaleString()} shares
                            <span style={{
                              marginLeft: '8px',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: pctColor,
                            }}>
                              ({pctDisplay})
                            </span>
                          </div>
                          {outstandingNum > 0 && (
                            <div style={{
                              fontSize: '11px',
                              color: EmailColors.text.meta,
                              marginTop: '8px',
                            }}>
                              of {outstandingNum.toLocaleString()} class shares outstanding
                            </div>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}

              {/* ═══════════════════════════════════════════════════════════
                  THE STORY - Summary with key values highlighted
                  ═══════════════════════════════════════════════════════════ */}
              {headline && (
                <SectionCard>
                  <tr>
                    <td
                      style={{
                        fontSize: '15px',
                        lineHeight: '1.6',
                        color: EmailColors.text.body,
                      }}
                      dangerouslySetInnerHTML={{ __html: formatText(headline) }}
                    />
                  </tr>
                </SectionCard>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  INVESTOR IMPLICATION - What this means for shareholders
                  ═══════════════════════════════════════════════════════════ */}
              {investorImplication && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '16px' }}>
                  <tbody>
                    <tr>
                      <td style={{
                        padding: '16px',
                        backgroundColor: '#F0F9FF',
                        borderRadius: '8px',
                        borderLeft: `4px solid #0EA5E9`,
                      }}>
                        <div style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#0369A1',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.5px',
                          marginBottom: '8px',
                        }}>
                          💡 Investor Takeaway
                        </div>
                        <div style={{
                          fontSize: '14px',
                          lineHeight: '1.5',
                          color: '#0C4A6E',
                        }}>
                          {investorImplication}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Filing Details removed - too much noise for skimming */}

              {/* No data fallback */}
              {!hasTransactionData && !summaryText && (
                <SectionCard>
                  <tr>
                    <td style={{
                      fontSize: '14px',
                      lineHeight: '1.6',
                      color: EmailColors.text.meta,
                      textAlign: 'center',
                      padding: '20px',
                    }}>
                      View the full Form 144 filing for transaction details.
                    </td>
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
        formType={filingType || 'Form 144'}
      />
    </div>
  );
}

export default Form144MinimalistTemplate;
