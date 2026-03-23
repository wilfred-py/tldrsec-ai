import * as React from 'react';
import { EmailColors, getTransactionCodeDescription as getTransactionCodeDescriptionFromDesign, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { FilingTemplateData } from '../../../../lib/email/types';
import { extractForm4Data } from '../../../../lib/email/form4-data-extractor';
import { StalenessBanner } from './sections/StalenessBanner';
import {
  normalizeForm4Data,
  normalizePersonName,
  truncateWithEllipsis,
} from '../../../../lib/email/form4-field-normalizer';

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
  date?: string;
}

/**
 * Get SEC transaction code description
 * Maps SEC Form 4 transaction codes to human-readable descriptions
 * @deprecated Use getTransactionCodeDescription from design-system.ts instead
 */
export function getTransactionCodeDescription(code: string): string {
  return getTransactionCodeDescriptionFromDesign(code);
}

/**
 * Format transaction date for display
 * @deprecated Currently unused but kept for future transaction date display
 */
function _formatTransactionDate(date: string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return date;
  }
}

// Export to prevent unused variable warning (may be used by tests)
export { _formatTransactionDate as formatTransactionDate };

/**
 * Get color for percentage change
 * @deprecated Currently unused but kept for future stake change coloring
 */
function _getChangeColor(percentChange: string | undefined): string {
  if (!percentChange) return EmailColors.text.meta;
  const num = parseFloat(percentChange.replace(/[%+]/g, ''));
  if (isNaN(num) || num === 0) return EmailColors.text.meta;
  return num > 0 ? '#16A34A' : '#DC2626'; // Green for increase, red for decrease
}

// Export to prevent unused variable warning (may be used in future)
export { _getChangeColor as getChangeColor };

/**
 * Get arrow indicator for percentage change
 */
export function getStakeChangeArrow(percentChange: string | undefined): string {
  if (!percentChange) return '';
  const num = parseFloat(percentChange.replace(/[%+]/g, ''));
  if (isNaN(num) || num === 0) return '→';
  return num > 0 ? '↑' : '↓';
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
 * Check if a transaction is a trust/family transfer
 * Transfers represent changes in beneficial ownership form, NOT market transactions
 */
export function isTransferTransaction(tx: TransactionData): boolean {
  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  // Explicit transfer indicators
  if (type.includes('transfer') || type.includes('trust')) {
    return true;
  }

  // J, K, Z codes represent trust/family transfers and voting trust deposits
  if (code === 'J' || code === 'K' || code === 'Z') {
    return true;
  }

  return false;
}

/**
 * Check if a transaction is a gift
 * Handles multiple representations:
 * - type: 'Gift', 'gift', 'G', 'g'
 * - type containing 'gift' (e.g., 'Gift Transaction')
 * - code: 'G'
 * Note: $0 dispositions are NOT automatically gifts - they could be transfers
 */
export function isGiftTransaction(tx: TransactionData): boolean {
  // Transfers are not gifts, even if at $0
  if (isTransferTransaction(tx)) {
    return false;
  }

  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  // SEC code is authoritative. If a code is present and not G/W, not a gift.
  if (code && code !== 'G' && code !== 'W') return false;

  // Explicit gift indicators (W = will/descent, semantically similar to gift)
  if (type === 'gift' || type === 'g' || type.includes('gift') || code === 'G' || code === 'W') {
    return true;
  }

  return false;
}

/**
 * Check if a transaction is a sale (not gift or transfer)
 * A sale is a disposition with non-zero price
 */
export function isSaleTransaction(tx: TransactionData): boolean {
  // Transfers and gifts are not sales
  if (isTransferTransaction(tx) || isGiftTransaction(tx)) return false;

  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  // SEC code is authoritative. If a code is present and it's not 'S',
  // this is definitively NOT a sale regardless of AI-parsed type text.
  if (code && code !== 'S') return false;

  // Explicit sale indicators (code S or text-based for codeless transactions)
  if (type.includes('sale') || type.includes('sell') || type === 's' || code === 'S') {
    return true;
  }

  // Disposition with a price is a sale (only reached for codeless transactions)
  if (tx.acquisitionDisposition === 'D') {
    const price = typeof tx.pricePerShare === 'string'
      ? tx.pricePerShare.replace(/[$,]/g, '')
      : String(tx.pricePerShare || '');
    const priceNum = parseFloat(price) || 0;
    return priceNum > 0;
  }

  return false;
}

/**
 * Check if a transaction is a purchase (not transfer)
 */
export function isPurchaseTransaction(tx: TransactionData): boolean {
  // Transfers are not purchases
  if (isTransferTransaction(tx)) return false;

  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  // SEC code is authoritative. If a code is present and not P, not a purchase.
  if (code && code !== 'P') return false;

  // Explicit purchase indicators
  if (type.includes('purchase') || type.includes('bought') || type === 'p' || code === 'P') {
    return true;
  }

  // Acquisition with a non-zero price is a purchase (only for codeless transactions)
  // $0 codeless acquisitions are awards/grants, not purchases
  if (tx.acquisitionDisposition === 'A') {
    const price = typeof tx.pricePerShare === 'string'
      ? tx.pricePerShare.replace(/[$,]/g, '')
      : String(tx.pricePerShare || '');
    const priceNum = parseFloat(price) || 0;
    return priceNum > 0;
  }

  return false;
}

/**
 * Check if a transaction is an equity compensation award/grant
 * Covers SEC codes A (Award/Grant) and I (Discretionary 16b-3)
 */
export function isAwardTransaction(tx: TransactionData): boolean {
  if (isTransferTransaction(tx)) return false;

  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  if (code === 'A' || code === 'I') return true;

  if (type.includes('award') || type.includes('grant') ||
      type.includes('rsu') || type.includes('psu') ||
      type.includes('restricted stock') ||
      type.includes('stock option') || type.includes('option award') || type.includes('option grant')) {
    return true;
  }

  return false;
}

/**
 * Check if a transaction is a derivative exercise, conversion, or expiration
 * Covers SEC codes M, C, X, O, E, H
 */
export function isExerciseTransaction(tx: TransactionData): boolean {
  if (isTransferTransaction(tx)) return false;

  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  if (['M', 'C', 'X', 'O', 'E', 'H'].includes(code)) return true;

  if (type.includes('exercise') || type.includes('conversion') ||
      type.includes('convert') || type.includes('expir')) {
    return true;
  }

  return false;
}

/**
 * Check if a transaction is a disposition, tax withholding, or other non-market transaction
 * Covers SEC codes D, F, U, V, L
 */
export function isOtherTransaction(tx: TransactionData): boolean {
  if (isTransferTransaction(tx)) return false;

  const code = tx.code?.toUpperCase() || '';
  const type = tx.type?.toLowerCase() || '';

  if (['D', 'F', 'U', 'V', 'L'].includes(code)) return true;

  if (type.includes('tax') || type.includes('withholding') ||
      type.includes('disposition') || type.includes('tender')) {
    return true;
  }

  return false;
}

/**
 * Aggregate transactions by type for cleaner display
 * Groups similar transactions (all gifts together, all sales together, all transfers together)
 * Returns up to 4 aggregated transaction groups
 */
interface AggregatedTransaction {
  type: 'gift' | 'sale' | 'purchase' | 'transfer' | 'award' | 'exercise' | 'other';
  totalShares: number;
  totalValue: number;
  avgPrice: number;
  count: number;
  // For display
  sharesDisplay: string;
  valueDisplay: string;
  priceDisplay: string;
  // SEC transaction code (only populated for single transactions)
  code?: string;
  codeDescription?: string;
}

export function aggregateTransactionsByType(transactions: TransactionData[]): AggregatedTransaction[] {
  const groups: Record<string, { shares: number; value: number; count: number; prices: number[]; codes: string[] }> = {
    gift: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    sale: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    purchase: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    transfer: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    award: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    exercise: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    other: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
  };

  for (const tx of transactions) {
    let groupKey: 'gift' | 'sale' | 'purchase' | 'transfer' | 'award' | 'exercise' | 'other';
    if (isTransferTransaction(tx)) {
      groupKey = 'transfer';
    } else if (isGiftTransaction(tx)) {
      groupKey = 'gift';
    } else if (isSaleTransaction(tx)) {
      groupKey = 'sale';
    } else if (isAwardTransaction(tx)) {
      groupKey = 'award';
    } else if (isExerciseTransaction(tx)) {
      groupKey = 'exercise';
    } else if (isPurchaseTransaction(tx)) {
      groupKey = 'purchase';
    } else if (isOtherTransaction(tx)) {
      groupKey = 'other';
    } else {
      groupKey = 'other';
    }

    const shares = Math.round(parseNumericValue(tx.shares));
    const price = parseNumericValue(tx.pricePerShare ?? (tx as Record<string, unknown>).price as string | number | undefined);

    // Calculate value: prefer totalValue if it's meaningful (> 0), otherwise calculate from shares * price
    let value = 0;
    if (tx.totalValue) {
      const parsedTotalValue = parseNumericValue(tx.totalValue);
      // Only use totalValue if it's actually meaningful (not $0 for sales/purchases)
      if (parsedTotalValue > 0 || groupKey === 'gift' || groupKey === 'transfer') {
        value = parsedTotalValue;
      } else {
        // totalValue was $0 but this isn't a gift/transfer - calculate from shares * price
        value = shares * price;
      }
    } else {
      value = shares * price;
    }

    groups[groupKey].shares += shares;
    groups[groupKey].value += value;
    groups[groupKey].count += 1;
    if (price > 0) groups[groupKey].prices.push(price);
    if (tx.code) groups[groupKey].codes.push(tx.code);
  }

  // Format and return non-empty groups
  const result: AggregatedTransaction[] = [];
  for (const [type, data] of Object.entries(groups)) {
    if (data.count > 0) {
      const avgPrice = data.prices.length > 0
        ? data.prices.reduce((a, b) => a + b, 0) / data.prices.length
        : 0;

      // Get the primary code for single transactions
      const primaryCode = data.codes.length === 1 ? data.codes[0] : undefined;

      result.push({
        type: type as 'gift' | 'sale' | 'purchase' | 'transfer' | 'award' | 'exercise' | 'other',
        totalShares: data.shares,
        totalValue: data.value,
        avgPrice,
        count: data.count,
        sharesDisplay: data.shares.toLocaleString(),
        valueDisplay: formatAggregatedValue(data.value),
        priceDisplay: avgPrice > 0 ? `$${avgPrice.toFixed(2)}` : '$0',
        code: primaryCode,
        codeDescription: primaryCode ? getTransactionCodeDescription(primaryCode) : undefined,
      });
    }
  }

  // Sort: sales first, then transfers, gifts, awards, exercises, purchases, other
  return result.sort((a, b) => {
    const order = { sale: 0, transfer: 1, gift: 2, award: 3, exercise: 4, purchase: 5, other: 6 };
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

/**
 * Transaction type configuration for color coding and display
 * Used by email templates to style different transaction types
 */
interface TransactionTypeConfig {
  label: string;
  icon: string;
  bgColor: string;
  textColor: string;
  color: string; // Alias for primary color (used by tests)
  valueColor: string;
}

/**
 * Get configuration for a transaction type string
 * Exported for testing and external use
 */
export function getTransactionTypeConfig(type: string): TransactionTypeConfig {
  const typeLower = type.toLowerCase();

  // Check for transfer types first
  if (typeLower.includes('transfer') || typeLower.includes('trust')) {
    return {
      label: 'Transfer',
      icon: '🔄',
      bgColor: '#EBF8FF',
      textColor: '#1E40AF',
      color: '#3B82F6', // Blue
      valueColor: '#3B82F6',
    };
  }

  // Gift type
  if (typeLower.includes('gift') || typeLower === 'g') {
    return {
      label: 'Gift',
      icon: '🎁',
      bgColor: '#F3E8FF',
      textColor: '#7C3AED',
      color: '#7C3AED', // Purple
      valueColor: '#7C3AED',
    };
  }

  // Sale type
  if (typeLower.includes('sale') || typeLower.includes('sell') || typeLower === 's' || typeLower === 'sold') {
    return {
      label: 'Sold',
      icon: '📉',
      bgColor: '#FEF2F2',
      textColor: '#991B1B',
      color: '#DC2626', // Red
      valueColor: '#DC2626',
    };
  }

  // Award type
  if (typeLower.includes('award') || typeLower.includes('grant') || typeLower.includes('rsu') || typeLower.includes('psu') || typeLower.includes('restricted stock')) {
    return {
      label: 'Awarded',
      icon: '🏆',
      bgColor: '#FFFBEB',
      textColor: '#92400E',
      color: '#D97706', // Amber
      valueColor: '#D97706',
    };
  }

  // Exercise/Derivative type (label covers exercises + expirations)
  if (typeLower.includes('exercise') || typeLower.includes('conversion') || typeLower.includes('expir') || typeLower.includes('derivative')) {
    return {
      label: 'Exercised Options',
      icon: '⚡',
      bgColor: '#F0FDFA',
      textColor: '#115E59',
      color: '#0D9488', // Teal
      valueColor: '#0D9488',
    };
  }

  // Purchase type (explicit, no longer default)
  if (typeLower.includes('purchase') || typeLower.includes('bought') || typeLower === 'p') {
    return {
      label: 'Bought',
      icon: '📈',
      bgColor: '#F0FDF4',
      textColor: '#166534',
      color: '#16A34A', // Green
      valueColor: '#16A34A',
    };
  }

  // Default to Other (neutral) instead of Purchase
  return {
    label: 'Other',
    icon: '📋',
    bgColor: '#F8FAFC',
    textColor: '#475569',
    color: '#64748B', // Slate
    valueColor: '#64748B',
  };
}

function getAggregatedTransactionConfig(type: 'gift' | 'sale' | 'purchase' | 'transfer' | 'award' | 'exercise' | 'other') {
  const config = getTransactionTypeConfig(type);
  return {
    label: config.label,
    icon: config.icon,
    bgColor: config.bgColor,
    textColor: config.textColor,
    valueColor: config.valueColor,
  };
}

/**
 * Determine signal level and get appropriate styling
 */
function getSignalConfig(signalStrength: string, summaryText: string, isSale: boolean, percentChange: string) {
  const signalLower = signalStrength.toLowerCase();
  const summaryLower = summaryText?.toLowerCase() || '';

  // Check for trust/family transfers FIRST - these are neutral, not buy/sell signals
  const isTransfer = signalLower.includes('transfer') || signalLower.includes('trust') ||
    summaryLower.includes('trust transfer') || summaryLower.includes('family trust') ||
    summaryLower.includes('revocable trust') || summaryLower.includes('change in beneficial ownership');

  if (isTransfer) {
    return {
      level: 'NEUTRAL',
      verdict: 'Trust/Family Transfer',
      description: 'Change in ownership form — not a market transaction or investment signal.',
      bgColor: '#EBF8FF',
      borderColor: '#3B82F6',
      textColor: '#1E40AF',
      icon: '🔄',
    };
  }

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
 * @deprecated Use markdownToHtml from design-system instead
 */
function _formatText(text: string): string {
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
    /([\d,]+(?:\.\d+)?)\s+(shares?)/gi,
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

  const rawData = summaryData as Record<string, unknown> | undefined;

  // Use centralized normalizer for field-name resolution
  const normalizedData = normalizeForm4Data(rawData as Record<string, unknown> | null, summaryText);

  // Extract structured data from summaryText as fallback
  const extractedData = summaryText ? extractForm4Data(summaryText) : null;
  const hasExtractedData = extractedData && (
    extractedData.filerName ||
    extractedData.transactions.length > 0 ||
    extractedData.totalValue
  );

  // Use normalized data with extractor fallback — normalizer handles all aliases
  const rawFilerName = normalizedData?.filerName || extractedData?.filerName || 'Insider';
  const filerName = normalizePersonName(rawFilerName);
  const rawFilerRole = normalizedData?.filerRole || extractedData?.relationship || '';
  const filerRole = truncateWithEllipsis(rawFilerRole, 30);

  // Transactions: use normalized data (already char-indexed-safe), fall back to extractor
  const normalizedTransactions: TransactionData[] = (normalizedData?.transactions || []).map(t => ({
    code: t.code,
    type: t.type,
    shares: String(t.shares),
    pricePerShare: String(t.pricePerShare),
    sharesOwnedFollowing: t.sharesOwnedFollowing !== undefined ? String(t.sharesOwnedFollowing) : undefined,
    acquisitionDisposition: t.acquisitionDisposition,
    date: t.date,
  }));
  const extractedTransactions = hasExtractedData ? extractedData.transactions.map(t => ({
    type: t.type,
    shares: t.shares,
    pricePerShare: t.pricePerShare,
    totalValue: t.totalValue,
    acquisitionDisposition: t.acquisitionDisposition,
    code: t.code,
  })) : [];

  // Use normalized transactions if available, fall back to extractor
  const validTransactions = normalizedTransactions.filter(t => t.type || t.code || t.shares);
  const transactions = validTransactions.length > 0 ? validTransactions : extractedTransactions;
  const firstTx = transactions[0] || {};

  // Determine data quality for email metadata
  const dataQuality: 'full' | 'partial' | 'extractor-only' | 'degraded' =
    validTransactions.length > 0 && normalizedData?.filerName ? 'full' :
    validTransactions.length > 0 || normalizedData?.filerName ? 'partial' :
    hasExtractedData ? 'extractor-only' : 'degraded';

  const percentChange = (normalizedData?.percentageChange || extractedData?.percentageChange || '') as string;
  const newStake = (normalizedData?.newStake || extractedData?.newStake || '') as string;
  const previousStake = (normalizedData?.previousStake || extractedData?.previousStake || '') as string;
  const signalStrength = (normalizedData?.signalStrength || extractedData?.signalStrength || '') as string;

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

  // Build preheader text for inbox preview
  const preheaderText = `${signal.level} SIGNAL: ${signal.verdict} — ${(summaryText || '').substring(0, 100)}`;

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: EmailColors.structure.background,
      color: EmailColors.text.body,
    }}>
      {/* Preheader: invisible text shown in inbox preview after subject */}
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

      {/* Header */}
      <EmailHeader
        ticker={displayTicker}
        companyName={companyName}
        filingType={filingType}
        filingDate={filingDate}
        filerName={filerName}
        filerRole={filerRole}
        dataQuality={dataQuality}
      />

      {/* Staleness warning */}
      {filingDate && (
        <div style={{ padding: '0 15px' }}>
          <StalenessBanner filingDate={new Date(filingDate)} />
        </div>
      )}

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
                                            {/* For $0 transactions: show shares as the hero number, not misleading "$0" */}
                                            {aggTx.totalValue === 0 && (aggTx.type === 'gift' || aggTx.type === 'transfer')
                                              ? `${aggTx.sharesDisplay} shares`
                                              : aggTx.totalValue === 0 && (aggTx.type === 'award' || aggTx.type === 'exercise' || aggTx.type === 'other')
                                              ? `${aggTx.sharesDisplay} shares`
                                              : (aggTx.valueDisplay || '$0')}
                                          </div>
                                          {/* Secondary info: shares count (only when value is the hero) or price info */}
                                          <div style={{
                                            fontSize: '12px',
                                            color: config.textColor,
                                            opacity: 0.8,
                                            marginTop: '4px',
                                          }}>
                                            {aggTx.totalValue === 0
                                              ? (aggTx.type === 'award' ? 'Equity compensation' : aggTx.type === 'gift' || aggTx.type === 'transfer' ? 'No monetary value' : `${aggTx.sharesDisplay} shares`)
                                              : `${aggTx.sharesDisplay} shares${aggTx.avgPrice > 0 ? ` @ ${aggTx.priceDisplay}` : ''}`}
                                          </div>
                                          {/* SEC transaction code description for single transactions */}
                                          {aggTx.codeDescription && (
                                            <div style={{
                                              fontSize: '11px',
                                              color: config.textColor,
                                              opacity: 0.7,
                                              marginTop: '4px',
                                            }}>
                                              {aggTx.codeDescription}
                                            </div>
                                          )}
                                          {/* Show (estimated) tag when using extractor-derived data */}
                                          {dataQuality === 'extractor-only' && (
                                            <div style={{
                                              fontSize: '10px',
                                              color: EmailColors.text.muted,
                                              fontStyle: 'italic',
                                              marginTop: '4px',
                                            }}>
                                              (estimated)
                                            </div>
                                          )}
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
                                        ? `${previousStake} ${getStakeChangeArrow(percentChange)} ${newStake}`
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
                  STAKE IMPACT - Shows ownership change when transactions exist
                  Only displays when we have stake data AND transactions above
                  ═══════════════════════════════════════════════════════════ */}
              {/* Adaptive stake display:
                  - Full bar: when both previousStake and newStake exist
                  - Current holdings: when only newStake exists (from fallback extraction)
                  - Hidden: when neither exists */}
              {(
                (previousStake && newStake) || // Have before/after comparison
                (newStake && percentChange) || // Have new stake with change
                (previousStake && percentChange) || // Have previous stake with change
                newStake // Have current holdings from fallback extraction
              ) && (() => {
                // Parse percentage for color logic (handles "-10.00%", "50.00%", "+5.0%")
                const pctNum = parseFloat((percentChange || '0').replace(/[%+]/g, ''));
                const pctColor = pctNum < 0 ? '#DC2626' : pctNum > 0 ? '#16A34A' : EmailColors.text.meta;
                const pctDisplay = percentChange
                  ? (pctNum > 0 && !percentChange.startsWith('+') ? `+${percentChange}` : percentChange)
                  : '';

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
                          {previousStake && newStake ? 'Ownership Impact' : 'Current Holdings'}
                        </div>
                        <div>
                          {previousStake && newStake ? (
                            <>
                              {/* Previous ownership (before transaction) */}
                              <div style={{
                                fontSize: '14px',
                                color: EmailColors.text.muted,
                                marginBottom: '6px',
                              }}>
                                {previousStake}
                              </div>
                              {/* Direction arrow - matches sentiment direction */}
                              <div style={{
                                fontSize: '20px',
                                lineHeight: '1',
                                margin: '4px 0',
                                color: pctColor,
                              }}>
                                {pctNum > 0 ? '↑' : '↓'}
                              </div>
                              {/* New ownership (after transaction) */}
                              <div style={{
                                fontSize: '16px',
                                fontWeight: 700,
                                color: EmailColors.text.headline,
                                marginTop: '6px',
                              }}>
                                {newStake}
                                {pctDisplay && (
                                  <span style={{
                                    marginLeft: '8px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: pctColor,
                                  }}>
                                    ({pctDisplay})
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            /* Single stake value with optional percent change */
                            <div style={{
                              fontSize: '16px',
                              fontWeight: 700,
                              color: EmailColors.text.headline,
                            }}>
                              {newStake || previousStake}
                              {pctDisplay && (
                                <span style={{
                                  marginLeft: '8px',
                                  fontSize: '14px',
                                  fontWeight: 600,
                                  color: pctColor,
                                }}>
                                  ({pctDisplay})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                );
              })()}

              {/* ═══════════════════════════════════════════════════════════
                  THE STORY - One-liner summary
                  ═══════════════════════════════════════════════════════════ */}
              {headline && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '16px' }}>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          fontSize: '15px',
                          lineHeight: '1.6',
                          color: EmailColors.text.body,
                          padding: '16px',
                          backgroundColor: 'transparent',
                        }}
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(headline) }}
                      />
                    </tr>
                  </tbody>
                </table>
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
