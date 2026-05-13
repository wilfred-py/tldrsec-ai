import * as React from 'react';
import { EmailColors, EmailStyles, markdownToHtml, formatDatesInText, getWhyItMattersLabel, type WhyItMattersBucket } from '../design-system';
import { EmailLeadHeader } from './sections/EmailLeadHeader';
import { FormPlusMaterialityBadgeRow } from './sections/FormPlusMaterialityBadgeRow';
import { EmailFooter } from './sections/EmailFooter';
import { HangingBulletItem } from './sections/BulletList';
import { FilingTemplateData } from '../../../../lib/email/types';
import { extractForm4Data } from '../../../../lib/email/form4-data-extractor';
import { StalenessBanner } from './sections/StalenessBanner';
import { XSentimentBlock } from './sections/XSentimentBlock';
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
  sharesOwnedFollowing?: string | number;
  securityType?: string;
  ownershipForm?: string;
  ownershipNature?: string;
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
  return '↓';
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
 * Check if ALL transactions in a filing are equity compensation awards/grants.
 * Award-only filings should not display percentage change badges or
 * before/after ownership flows — they are compensation events, not market signals.
 */
export function isAwardOnlyFiling(transactions: TransactionData[]): boolean {
  if (transactions.length === 0) return false;
  return transactions.every(tx => isAwardTransaction(tx));
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
  // Security types from underlying transactions
  securityTypes: string[];
}

export function aggregateTransactionsByType(transactions: TransactionData[]): AggregatedTransaction[] {
  const groups: Record<string, { shares: number; value: number; count: number; prices: number[]; codes: string[]; securityTypes: string[] }> = {
    gift: { shares: 0, value: 0, count: 0, prices: [], codes: [], securityTypes: [] },
    sale: { shares: 0, value: 0, count: 0, prices: [], codes: [], securityTypes: [] },
    purchase: { shares: 0, value: 0, count: 0, prices: [], codes: [], securityTypes: [] },
    transfer: { shares: 0, value: 0, count: 0, prices: [], codes: [], securityTypes: [] },
    award: { shares: 0, value: 0, count: 0, prices: [], codes: [], securityTypes: [] },
    exercise: { shares: 0, value: 0, count: 0, prices: [], codes: [], securityTypes: [] },
    other: { shares: 0, value: 0, count: 0, prices: [], codes: [], securityTypes: [] },
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
    const price = parseNumericValue(tx.pricePerShare || (tx as Record<string, unknown>).price as string | number | undefined);

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
    if (tx.securityType) groups[groupKey].securityTypes.push(tx.securityType);
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
        securityTypes: data.securityTypes,
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

function _getAwardSubtitle(aggTx: AggregatedTransaction): string {
  const types = aggTx.securityTypes || [];
  const joined = types.join(' ').toLowerCase();
  if (joined.includes('stock option') || joined.includes('right to buy')) {
    return aggTx.avgPrice > 0 ? `Stock options @ ${aggTx.priceDisplay}` : 'Stock options';
  }
  if (joined.includes('restricted stock') || joined.includes('rsu')) return 'Restricted Stock Units';
  if (joined.includes('performance') || joined.includes('psu')) return 'Performance Stock Units';
  return 'Equity compensation';
}

function getOwnershipBreakdown(transactions: TransactionData[]): { form: string; nature: string; shares: string }[] | null {
  const groups = new Map<string, string>();
  for (const tx of transactions) {
    const form = tx.ownershipForm || 'D';
    const nature = tx.ownershipNature || '';
    const key = `${form}:${nature}`;
    const sof = tx.sharesOwnedFollowing;
    if (sof) groups.set(key, String(sof));
  }
  if (groups.size <= 1) return null; // All same form, use simple display
  const result: { form: string; nature: string; shares: string }[] = [];
  for (const [key, shares] of groups.entries()) {
    const [form, nature] = key.split(':');
    result.push({
      form: form === 'I' ? 'Indirect' : 'Direct',
      nature,
      shares: parseFloat(shares.replace(/,/g, '')).toLocaleString(),
    });
  }
  return result.slice(0, 3); // Cap at 3 entities
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
export function getSignalConfig(
  signalStrength: string,
  summaryText: string,
  isSale: boolean,
  percentChange: string,
  isAwardOnly: boolean = false,
  has10b51Plan: boolean = false,
) {
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

  // Check for award/grant-only filings — compensation, not market activity
  if (isAwardOnly) {
    return {
      level: 'NEUTRAL',
      verdict: 'Stock Award',
      description: 'Equity compensation grant — not a market transaction or investment signal.',
      bgColor: '#F5F3FF',
      borderColor: '#8B5CF6',
      textColor: '#6D28D9',
      icon: '🎯',
    };
  }

  // 10b5-1 plan detection comes from the schema boolean (source of truth),
  // not free-text scan of signalStrength / summary.
  const has10b51 = has10b51Plan;

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
  // ⚠️ SECURITY BOUNDARY: Unconditional escaping prevents entity-based XSS bypass
  html = html.replace(/&/g, '&amp;');
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
    securityType: t.securityType,
    ownershipForm: t.ownershipForm,
    ownershipNature: t.ownershipNature,
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

  // Determine data quality for email metadata.
  // Fail-loud guard: if the derived newStake disagrees with the narrative by >5%,
  // force 'degraded' regardless of transaction completeness. The mismatch is
  // already logged inside normalizeForm4Data. See .claude/tasks/form4-holdings-mismatch.md.
  const dataQuality: 'full' | 'partial' | 'extractor-only' | 'degraded' =
    normalizedData?.hasNarrativeMismatch ? 'degraded' :
    validTransactions.length > 0 && normalizedData?.filerName ? 'full' :
    validTransactions.length > 0 || normalizedData?.filerName ? 'partial' :
    hasExtractedData ? 'extractor-only' : 'degraded';

  // Detect award-only filings — suppress misleading % and before/after flow
  const isAwardOnly = isAwardOnlyFiling(transactions);

  const percentChange = isAwardOnly
    ? ''  // Suppress misleading % for award-only filings
    : (normalizedData?.percentageChange || extractedData?.percentageChange || '') as string;
  const newStake = (normalizedData?.newStake || extractedData?.newStake || '') as string;
  const previousStake = isAwardOnly
    ? ''  // Show "Current Holdings" header instead of "Ownership Impact"
    : (normalizedData?.previousStake || extractedData?.previousStake || '') as string;
  const signalStrength = (normalizedData?.signalStrength || extractedData?.signalStrength || '') as string;

  // For signal config, check if primary transaction is a sale (not gift)
  const primaryIsSale = transactions.length > 0 ? isSaleTransaction(firstTx) : percentChange?.startsWith('-');

  // Aggregate transactions by type for cleaner multi-transaction display
  const aggregatedTransactions = aggregateTransactionsByType(transactions);

  const displayTicker = symbol || ticker || 'N/A';
  const hasTransactionData = transactions.length > 0 || percentChange;

  // Get signal configuration
  const has10b51Plan = normalizedData?.has10b51Plan ?? false;
  const signal = getSignalConfig(signalStrength, summaryText || '', primaryIsSale, percentChange, isAwardOnly, has10b51Plan);

  // "Why it matters" label bucket and UTM variant for click-through attribution.
  // Form 4 uses hardcoded signal copy (no AI whyItMatters consumed), so
  // material → `fallback`, routine (incl. 10b5-1) → `note`, descriptive (trust/award) → `neutral`.
  const whyItMattersBucket: WhyItMattersBucket =
    signal.level === 'HIGH' || signal.level === 'MODERATE' ? 'material'
      : signal.level === 'LOW' ? 'routine'
      : 'descriptive';
  const utmVariant: 'fallback' | 'note' | 'neutral' =
    whyItMattersBucket === 'routine' ? 'note'
      : whyItMattersBucket === 'descriptive' ? 'neutral'
      : 'fallback';

  // Prefer AI-provided headline, fall back to sentence extraction
  const aiHeadline = typeof rawData?.headline === 'string' ? rawData.headline : '';
  let headline = aiHeadline;
  if (!headline) {
    headline = summaryText?.split(/(?<=[.!?])\s+/)[0] || '';
    if (headline.length < 30 && summaryText && summaryText.length > headline.length) {
      headline = summaryText;
    }
  }

  // Remaining summary text after the headline sentence.
  // Only slice when summaryText actually starts with headline (sentence-extraction path);
  // when AI provided an independent headline, show the full summaryText as remaining.
  const remainingSummary = summaryText && headline && summaryText !== headline
    ? (summaryText.startsWith(headline) ? summaryText.slice(headline.length).trim() : summaryText)
    : '';

  // Reformat YYYY-MM-DD dates in body copy to "DD MMM YYYY"
  const headlineDisplay = formatDatesInText(headline);
  const remainingSummaryDisplay = formatDatesInText(remainingSummary);

  // Build preheader text for inbox preview (dates reformatted for consistency with body)
  const preheaderText = `${signal.level} SIGNAL: ${signal.verdict} — ${formatDatesInText(summaryText || '').substring(0, 100)}`;

  // Pick the badge color based on signal level
  const signalColorKey: 'high' | 'low' | 'award' | 'trust' | 'moderate' =
    signal.level === 'HIGH' ? 'high'
    : signal.level === 'LOW' ? 'low'
    : signal.level === 'NEUTRAL' && isAwardOnly ? 'award'
    : signal.level === 'NEUTRAL' ? 'trust'
    : 'moderate';

  // Build data snapshot rows from transaction data
  const dataRows: { label: string; value: React.ReactNode }[] = [];
  for (const aggTx of aggregatedTransactions.slice(0, 3)) {
    const config = getAggregatedTransactionConfig(aggTx.type);
    const valueStr = aggTx.totalValue === 0
      ? `${aggTx.sharesDisplay} shares`
      : `${aggTx.valueDisplay} (${aggTx.sharesDisplay} shares${aggTx.avgPrice > 0 ? ` @ ${aggTx.priceDisplay}` : ''})`;
    dataRows.push({ label: `${config.icon} ${config.label}`, value: valueStr });
  }

  // Add holdings row with directional arrow (always points right: pre → post)
  if (previousStake && newStake) {
    const pctNum = parseFloat((percentChange || '0').replace(/[%+]/g, ''));
    // Darker green (#15803D = WCAG AA 4.5:1+) replaces #16A34A (3.05:1, fails AA on body text)
    const pctColor = pctNum < 0 ? '#DC2626' : pctNum > 0 ? '#15803D' : EmailColors.text.meta;
    const pctDisplay = percentChange && !percentChange.includes('NaN')
      ? (pctNum > 0 && !percentChange.startsWith('+') ? `+${percentChange}` : percentChange)
      : '';
    dataRows.push({
      label: 'Holdings',
      value: (
        <span style={{ color: '#111827' }}>
          <span style={{ color: '#6B7280' }}>{previousStake}</span>
          {/* NBSPs instead of span padding — Outlook Word renderer drops padding on inline spans */}
          <span>{'  →  '}</span>
          <span>{newStake}</span>
          {pctDisplay && Number.isFinite(pctNum) && pctNum !== 0 && (
            <>
              {' '}
              <span style={{ color: pctColor }}>({pctDisplay})</span>
            </>
          )}
        </span>
      ),
    });
  } else if (newStake) {
    dataRows.push({
      label: 'Holdings',
      value: newStake,
    });
  }

  // Ownership breakdown for mixed direct/indirect
  const breakdown = getOwnershipBreakdown(transactions);

  // Build watch-for items. If empty, the `watchFor.length > 0` guard below
  // suppresses the section entirely — no stale "Watch for:" header.
  const watchFor: string[] = [];
  if (normalizedData?.vestingDetails) {
    watchFor.push(`Vesting schedule: ${normalizedData.vestingDetails}`);
  }

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: EmailColors.structure.background,
      color: EmailColors.text.body,
    }}>
      {/* Preheader */}
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

      {filingDate && (
        <div style={{ padding: '0 15px' }}>
          <StalenessBanner filingDate={new Date(filingDate)} />
        </div>
      )}

      <EmailLeadHeader
        ticker={displayTicker}
        companyName={companyName}
        filingDate={filingDate}
        headline={headlineDisplay || `${filerName} filed a Form 4 for ${displayTicker}`}
        filerName={filerName}
        filerRole={filerRole}
      />

      {/* Form badge + signal badge row */}
      <FormPlusMaterialityBadgeRow
        filingType={filingType || '4'}
        signal={{
          label: `${signal.icon} ${signal.level} — ${signal.verdict}`,
          colorKey: signalColorKey,
        }}
      />

      {/* Smart Brevity body */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>

              {/* Why it matters / Note / What happened — label + styling depends on signal bucket */}
              {(() => {
                const label = getWhyItMattersLabel(whyItMattersBucket);
                return (
                  <p style={label.paragraphStyle}>
                    <strong style={label.labelStyle}>{label.text}</strong>
                    {signal.description}
                  </p>
                );
              })()}

              {/* Thin divider */}
              {dataRows.length > 0 && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                  <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                </table>
              )}

              {/* Data snapshot */}
              {dataRows.length > 0 && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '4px' }}>
                  <tbody>
                    {dataRows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{
                          ...EmailStyles.dataLabel,
                          borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                        }}>{row.label}</td>
                        <td style={{
                          ...EmailStyles.dataValue,
                          color: '#111827',
                          borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                        }}>{row.value}</td>
                      </tr>
                    ))}
                    {/* Ownership breakdown rows */}
                    {breakdown && breakdown.map((b, i) => (
                      <tr key={`bd-${i}`}>
                        <td style={{
                          ...EmailStyles.dataLabel,
                          borderBottom: i < breakdown.length - 1 ? '1px solid #F0F0F0' : 'none',
                        }}>{b.form}{b.nature ? ` (${b.nature})` : ''}</td>
                        <td style={{
                          ...EmailStyles.dataValue,
                          borderBottom: i < breakdown.length - 1 ? '1px solid #F0F0F0' : 'none',
                        }}>{b.shares} shares</td>
                      </tr>
                    ))}
                    {dataQuality === 'extractor-only' && (
                      <tr>
                        <td colSpan={2} style={{
                          fontSize: '10px',
                          color: EmailColors.text.muted,
                          fontStyle: 'italic',
                          padding: '4px 0 0',
                        }}>
                          Values are estimated from filing text
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Thin divider */}
              {remainingSummary && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                  <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                </table>
              )}

              {/* Story — remaining narrative */}
              {remainingSummary && (
                <div
                  style={EmailStyles.prose}
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(remainingSummaryDisplay) }}
                />
              )}

              {/* Watch for */}
              {watchFor.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div style={EmailStyles.watchForHeader}>Watch for:</div>
                  {watchFor.map((item, idx) => (
                    <HangingBulletItem key={idx} text={item} />
                  ))}
                </>
              )}

              {/* No data fallback */}
              {!hasTransactionData && !summaryText && (
                <p style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: EmailColors.text.meta,
                  textAlign: 'center',
                  padding: '20px 0',
                }}>
                  View the full Form 4 filing for transaction details.
                </p>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* X (Twitter) sentiment — F3-validated payload from xAI x_search */}
      <XSentimentBlock rawData={summaryData} formType="Form 4" />

      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || 'Form 4'}
        utmVariant={utmVariant}
      />
    </div>
  );
}

export default Form4MinimalistTemplate;
