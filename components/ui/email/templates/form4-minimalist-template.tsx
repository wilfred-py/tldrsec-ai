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
  shares?: string | number;
  pricePerShare?: string | number;
  totalValue?: string | number;
  acquisitionDisposition?: string;
  code?: string;
}

/**
 * Safely parse a value that could be string or number to a number
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
 * Check if a transaction is a gift
 * Handles multiple representations:
 * - type: 'Gift', 'gift', 'G', 'g'
 * - type containing 'gift' (e.g., 'Gift Transaction')
 * - code: 'G'
 * - price: '$0' or '0' with disposition 'D' (gifts are typically $0 dispositions)
 */
function isGiftTransaction(tx: TransactionData): boolean {
  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';
  const priceNum = parseNumericValue(tx.pricePerShare);

  // Explicit gift indicators
  if (type === 'gift' || type === 'g' || type.includes('gift') || code === 'G') {
    return true;
  }

  // $0 disposition is likely a gift (not a sale)
  if (priceNum === 0 && tx.acquisitionDisposition === 'D' && tx.shares) {
    return true;
  }

  return false;
}

/**
 * Check if a transaction is a sale (not gift)
 * A sale is a disposition with non-zero price
 */
function isSaleTransaction(tx: TransactionData): boolean {
  if (isGiftTransaction(tx)) return false;
  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  // Explicit sale indicators
  if (type.includes('sale') || type.includes('sell') || type === 's' || code === 'S') {
    return true;
  }

  // Disposition with a price is a sale (gifts are $0)
  if (tx.acquisitionDisposition === 'D') {
    const price = tx.pricePerShare?.replace(/[$,]/g, '') || '';
    const priceNum = parseFloat(price) || 0;
    return priceNum > 0;
  }

  return false;
}

/**
 * Aggregate transactions by type for cleaner display
 * Groups similar transactions (all gifts together, all sales together)
 * Returns up to 3 aggregated transaction groups
 */
interface AggregatedTransaction {
  type: 'gift' | 'sale' | 'purchase';
  totalShares: number;
  totalValue: number;
  avgPrice: number;
  count: number;
  // For display
  sharesDisplay: string;
  valueDisplay: string;
  priceDisplay: string;
}

function aggregateTransactionsByType(transactions: TransactionData[]): AggregatedTransaction[] {
  const groups: Record<string, { shares: number; value: number; count: number; prices: number[] }> = {
    gift: { shares: 0, value: 0, count: 0, prices: [] },
    sale: { shares: 0, value: 0, count: 0, prices: [] },
    purchase: { shares: 0, value: 0, count: 0, prices: [] },
  };

  for (const tx of transactions) {
    let groupKey: 'gift' | 'sale' | 'purchase';
    if (isGiftTransaction(tx)) {
      groupKey = 'gift';
    } else if (isSaleTransaction(tx)) {
      groupKey = 'sale';
    } else {
      groupKey = 'purchase';
    }

    const shares = Math.round(parseNumericValue(tx.shares));
    const price = parseNumericValue(tx.pricePerShare);

    // Calculate value: prefer totalValue if it's meaningful (> 0), otherwise calculate from shares * price
    let value = 0;
    if (tx.totalValue) {
      const parsedTotalValue = parseNumericValue(tx.totalValue);
      // Only use totalValue if it's actually meaningful (not $0 for sales/purchases)
      if (parsedTotalValue > 0 || groupKey === 'gift') {
        value = parsedTotalValue;
      } else {
        // totalValue was $0 but this isn't a gift - calculate from shares * price
        value = shares * price;
      }
    } else {
      value = shares * price;
    }

    groups[groupKey].shares += shares;
    groups[groupKey].value += value;
    groups[groupKey].count += 1;
    if (price > 0) groups[groupKey].prices.push(price);
  }

  // Format and return non-empty groups
  const result: AggregatedTransaction[] = [];
  for (const [type, data] of Object.entries(groups)) {
    if (data.count > 0) {
      const avgPrice = data.prices.length > 0
        ? data.prices.reduce((a, b) => a + b, 0) / data.prices.length
        : 0;

      result.push({
        type: type as 'gift' | 'sale' | 'purchase',
        totalShares: data.shares,
        totalValue: data.value,
        avgPrice,
        count: data.count,
        sharesDisplay: data.shares.toLocaleString(),
        valueDisplay: formatAggregatedValue(data.value),
        priceDisplay: avgPrice > 0 ? `$${avgPrice.toFixed(2)}` : '$0',
      });
    }
  }

  // Sort: sales first, then gifts, then purchases
  return result.sort((a, b) => {
    const order = { sale: 0, gift: 1, purchase: 2 };
    return order[a.type] - order[b.type];
  });
}

function formatAggregatedValue(value: number): string {
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  if (value > 0) return `$${value.toFixed(0)}`;
  return '$0';
}

function getAggregatedTransactionConfig(type: 'gift' | 'sale' | 'purchase') {
  switch (type) {
    case 'gift':
      return {
        label: 'Gift',
        icon: '🎁',
        bgColor: '#F3E8FF',
        textColor: '#7C3AED',
        valueColor: '#7C3AED',
      };
    case 'sale':
      return {
        label: 'Sold',
        icon: '📉',
        bgColor: '#FEF2F2',
        textColor: '#991B1B',
        valueColor: '#DC2626',
      };
    case 'purchase':
      return {
        label: 'Bought',
        icon: '📈',
        bgColor: '#F0FDF4',
        textColor: '#166534',
        valueColor: '#16A34A',
      };
  }
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
    code: t.code,
  })) : [];
  const transactions = dataTransactions.length > 0 ? dataTransactions : extractedTransactions;
  const firstTx = transactions[0] || {};

  const percentChange = (data?.percentageChange || data?.changePercent || extractedData?.percentageChange || '') as string;
  const newStake = (data?.newStake || data?.sharesRemaining || extractedData?.newStake || '') as string;
  const previousStake = (data?.previousStake || data?.sharesOwned || extractedData?.previousStake || '') as string;
  const signalStrength = (data?.signalStrength || extractedData?.signalStrength || '') as string;

  // For signal config, check if primary transaction is a sale (not gift)
  const primaryIsSale = transactions.length > 0 ? isSaleTransaction(firstTx) : percentChange?.startsWith('-');

  // Aggregate transactions by type for cleaner multi-transaction display
  const aggregatedTransactions = aggregateTransactionsByType(transactions);

  const displayTicker = symbol || ticker || 'N/A';
  const hasTransactionData = transactions.length > 0 || percentChange;

  // Get signal configuration
  const signal = getSignalConfig(signalStrength, summaryText || '', primaryIsSale, percentChange);

  // Extract first sentence as the headline, but ensure we have meaningful content
  let headline = summaryText?.split(/(?<=[.!?])\s+/)[0] || '';
  // If headline is too short or just a name fragment, use full summary
  if (headline.length < 30 && summaryText && summaryText.length > headline.length) {
    headline = summaryText;
  }

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
                  THE NUMBERS - Quick scan metrics (supports multiple transaction types)
                  Shows aggregated totals: Sale + Gift + Purchase (up to 3 types)
                  Mobile-first: Stacks on small screens, side-by-side on desktop
                  ═══════════════════════════════════════════════════════════ */}
              {hasTransactionData && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '16px' }}>
                  <tbody>
                    <tr>
                      <td>
                        {/* Mobile-first responsive layout using stacked tables */}
                        {/* Each transaction type is a separate table that can stack */}
                        <table width="100%" cellPadding="0" cellSpacing="0">
                          <tbody>
                            <tr>
                              {/* Aggregated transaction types display - shows all transaction types (sale, gift, purchase) */}
                              {aggregatedTransactions.length > 0 ? (
                                <>
                                  {aggregatedTransactions.slice(0, 3).map((aggTx, idx) => {
                                    const config = getAggregatedTransactionConfig(aggTx.type);
                                    const totalCols = Math.min(aggregatedTransactions.length, 3);
                                    const isLast = idx === Math.min(aggregatedTransactions.length, 3) - 1;

                                    // For mobile: use percentage width that works well on small screens
                                    // For 2 items: 48% each (with 4% gap)
                                    // For 1 item: 100%
                                    // For 3 items: 31% each (with gaps)
                                    const widthPercent = totalCols === 1 ? 100 : totalCols === 2 ? 48 : 31;

                                    return (
                                      <React.Fragment key={idx}>
                                        <td style={{
                                          width: `${widthPercent}%`,
                                          padding: '16px',
                                          backgroundColor: config.bgColor,
                                          borderRadius: '8px',
                                          verticalAlign: 'top',
                                        }}>
                                          <div style={{
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            color: config.textColor,
                                            textTransform: 'uppercase' as const,
                                            letterSpacing: '0.5px',
                                            marginBottom: '4px',
                                          }}>
                                            {config.icon} {config.label}{aggTx.count > 1 ? ` (${aggTx.count})` : ''}
                                          </div>
                                          <div style={{
                                            fontSize: '22px',
                                            fontWeight: 800,
                                            color: config.valueColor,
                                            lineHeight: '1.2',
                                          }}>
                                            {/* All transaction types show $ value as primary */}
                                            {aggTx.valueDisplay || '$0'}
                                          </div>
                                          {/* Secondary info: shares count */}
                                          <div style={{
                                            fontSize: '12px',
                                            color: config.textColor,
                                            opacity: 0.8,
                                            marginTop: '4px',
                                          }}>
                                            {aggTx.sharesDisplay} shares{aggTx.avgPrice > 0 ? ` @ ${aggTx.priceDisplay}` : ''}
                                          </div>
                                        </td>
                                        {/* Add gap spacer between items (not after last item) */}
                                        {!isLast && (
                                          <td style={{ width: totalCols === 2 ? '4%' : '3.5%' }}></td>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </>
                              ) : (
                                /* Fallback: Just stake impact if no transaction details */
                                <td style={{
                                  width: '100%',
                                  padding: '20px',
                                  backgroundColor: EmailColors.structure.backgroundAlt,
                                  borderRadius: '8px',
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
                                        color: primaryIsSale ? '#DC2626' : '#16A34A',
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
        formType={filingType || 'Form 4'}
        unsubscribeUrl={`${process.env.NEXT_PUBLIC_APP_URL || ''}/settings/notifications`}
      />
    </div>
  );
}

export default Form4MinimalistTemplate;
