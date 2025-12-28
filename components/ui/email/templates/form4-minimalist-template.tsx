import * as React from 'react';
import { EmailColors } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { FilingTemplateData } from '../../../../lib/email/types';
import { extractForm4Data } from '../../../../lib/email/form4-data-extractor';

interface Form4MinimalistTemplateProps {
  filing: FilingTemplateData;
}

interface TransactionData {
  type?: string;
  shares?: string;
  pricePerShare?: string;
  totalValue?: string;
  acquisitionDisposition?: string;
}

/**
 * Determine signal level and get appropriate styling
 */
function getSignalConfig(signalStrength: string, summaryText: string, isSale: boolean, percentChange: string) {
  const signalLower = signalStrength.toLowerCase();
  const summaryLower = summaryText?.toLowerCase() || '';

  // Check for 10b5-1 plan (reduces signal significance)
  const has10b51 = signalLower.includes('10b5-1') || summaryLower.includes('10b5-1');

  // Check for strong signals
  const isStrong = signalLower.includes('strong') ||
    (Math.abs(parseFloat(percentChange) || 0) > 50 && !has10b51);

  // Check for weak signals
  const isWeak = signalLower.includes('weak') || has10b51 ||
    summaryLower.includes('routine') || summaryLower.includes('auto-pilot');

  if (isStrong) {
    return {
      level: 'HIGH',
      verdict: isSale ? 'Notable Sale' : 'Notable Buy',
      description: 'This transaction may warrant attention for your investment thesis.',
      bgColor: '#FEF3C7',
      borderColor: '#F59E0B',
      textColor: '#92400E',
      icon: '⚠️',
    };
  } else if (isWeak) {
    return {
      level: 'LOW',
      verdict: 'Routine Transaction',
      description: has10b51
        ? 'Pre-scheduled 10b5-1 trade — no discretionary decision by insider.'
        : 'Likely not material to your investment decision.',
      bgColor: '#F1F5F9',
      borderColor: '#94A3B8',
      textColor: '#475569',
      icon: '✓',
    };
  } else {
    return {
      level: 'MODERATE',
      verdict: 'Worth Monitoring',
      description: 'Consider in context of broader insider activity patterns.',
      bgColor: '#EEF2FF',
      borderColor: '#6366F1',
      textColor: '#4338CA',
      icon: '👀',
    };
  }
}

/**
 * Format text with bold styling for key elements
 */
function formatText(text: string): string {
  if (!text) return '';
  let html = text;
  html = html.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;');
  html = html.replace(
    /(\$[\d,]+(?:\.\d+)?[KMB]?)/g,
    `<strong style="color:${EmailColors.text.headline};font-weight:700;">$1</strong>`
  );
  html = html.replace(
    /(-?\d+(?:\.\d+)?%)/g,
    `<strong style="color:${EmailColors.text.headline};font-weight:700;">$1</strong>`
  );
  html = html.replace(
    /([\d,]+)\s+(shares?)/gi,
    `<strong style="color:${EmailColors.text.headline};font-weight:700;">$1</strong> $2`
  );
  html = html.replace(/—/g, '&mdash;');
  return html;
}

/**
 * Form 4 Email Template - Signal-First Design
 *
 * The verdict/signal is the HERO - users should know in 2 seconds
 * if this matters to their portfolio.
 */
export function Form4MinimalistTemplate({ filing }: Form4MinimalistTemplateProps) {
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
  const extractedData = summaryText ? extractForm4Data(summaryText) : null;
  const hasExtractedData = extractedData && (
    extractedData.filerName ||
    extractedData.transactions.length > 0 ||
    extractedData.totalValue
  );

  // Use extracted data as fallback when summaryData is incomplete
  const filerName = (data?.filerName || data?.reportingPerson || extractedData?.filerName || 'Insider') as string;
  const filerRole = (data?.relationship || data?.position || extractedData?.relationship || '') as string;

  // Merge transactions from both sources
  const dataTransactions = (data?.transactions || []) as TransactionData[];
  const extractedTransactions = hasExtractedData ? extractedData.transactions.map(t => ({
    type: t.type,
    shares: t.shares,
    pricePerShare: t.pricePerShare,
    totalValue: t.totalValue,
    acquisitionDisposition: t.acquisitionDisposition,
  })) : [];
  const transactions = dataTransactions.length > 0 ? dataTransactions : extractedTransactions;
  const firstTx = transactions[0] || {};

  const totalValue = (data?.totalValue || firstTx.totalValue || extractedData?.totalValue || '') as string;
  const sharesAmount = (firstTx.shares || data?.shareAmount || data?.amount || '') as string;
  const pricePerShare = (firstTx.pricePerShare || data?.priceRange || data?.price || '') as string;
  const percentChange = (data?.percentageChange || data?.changePercent || extractedData?.percentageChange || '') as string;
  const newStake = (data?.newStake || data?.sharesRemaining || extractedData?.newStake || '') as string;
  const previousStake = (data?.previousStake || data?.sharesOwned || extractedData?.previousStake || '') as string;
  const signalStrength = (data?.signalStrength || extractedData?.signalStrength || '') as string;

  const transactionType = (firstTx.type || data?.transactionType || extractedData?.transactionType || '') as string;
  const acquisitionDisposition = (firstTx.acquisitionDisposition || '') as string;
  const isSale = transactionType?.toLowerCase().includes('sale') ||
    transactionType?.toLowerCase().includes('sell') ||
    acquisitionDisposition === 'D' ||
    percentChange?.startsWith('-');

  const displayTicker = symbol || ticker || 'N/A';
  const hasTransactionData = totalValue || sharesAmount || percentChange;

  // Get signal configuration
  const signal = getSignalConfig(signalStrength, summaryText || '', isSale, percentChange);

  // Extract first sentence as the headline
  const headline = summaryText?.split(/(?<=[.!?])\s+/)[0] || '';

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
        filingType={filingType}
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
                  THE VERDICT - This is the HERO section
                  Users should know in 2 seconds if this matters
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
                                {signal.icon} {signal.level} SIGNAL
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
                  THE NUMBERS - Quick scan metrics
                  ═══════════════════════════════════════════════════════════ */}
              {hasTransactionData && (
                <SectionCard>
                  <tr>
                    <td>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          <tr>
                            {/* Left: Transaction Amount */}
                            {totalValue && (
                              <td style={{
                                width: '50%',
                                padding: '16px',
                                backgroundColor: isSale ? '#FEF2F2' : '#F0FDF4',
                                borderRadius: '8px',
                                verticalAlign: 'top',
                              }}>
                                <div style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: isSale ? '#991B1B' : '#166534',
                                  textTransform: 'uppercase' as const,
                                  letterSpacing: '0.5px',
                                  marginBottom: '4px',
                                }}>
                                  {isSale ? '📉 Sold' : '📈 Bought'}
                                </div>
                                <div style={{
                                  fontSize: '28px',
                                  fontWeight: 800,
                                  color: isSale ? '#DC2626' : '#16A34A',
                                  lineHeight: '1.1',
                                }}>
                                  {totalValue}
                                </div>
                                {sharesAmount && (
                                  <div style={{
                                    fontSize: '13px',
                                    color: EmailColors.text.meta,
                                    marginTop: '6px',
                                  }}>
                                    {sharesAmount} shares @ {pricePerShare || 'avg'}
                                  </div>
                                )}
                              </td>
                            )}

                            {/* Right: Stake Impact */}
                            <td style={{
                              width: totalValue ? '50%' : '100%',
                              padding: '16px',
                              paddingLeft: totalValue ? '12px' : '16px',
                              verticalAlign: 'top',
                            }}>
                              {percentChange && (
                                <>
                                  <div style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: EmailColors.text.meta,
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: '0.5px',
                                    marginBottom: '4px',
                                  }}>
                                    Stake Impact
                                  </div>
                                  <div style={{
                                    fontSize: '28px',
                                    fontWeight: 800,
                                    color: isSale ? '#DC2626' : '#16A34A',
                                    lineHeight: '1.1',
                                  }}>
                                    {percentChange}
                                  </div>
                                </>
                              )}
                              {(previousStake || newStake) && (
                                <div style={{
                                  fontSize: '13px',
                                  color: EmailColors.text.meta,
                                  marginTop: '6px',
                                }}>
                                  {previousStake && newStake
                                    ? `${previousStake} → ${newStake}`
                                    : newStake || previousStake
                                  }
                                </div>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  THE STORY - One-liner summary
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
                      View the full Form 4 filing for transaction details.
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
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default Form4MinimalistTemplate;
