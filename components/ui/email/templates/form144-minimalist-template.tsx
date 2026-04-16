import * as React from 'react';
import { EmailColors, EmailStyles, BadgeColors, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
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
 * Form 144 Email Template - Smart Brevity Signal-First Design
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
  const notable = isNotableSale(signalStrength, summaryText || '', estimatedValueNum);

  // Badge colors
  const badgeColors = notable ? BadgeColors.high : BadgeColors.low;
  const signalLabel = notable ? 'NOTABLE SALE' : 'ROUTINE';
  const signalVerdict = notable ? 'Worth Attention' : 'Pre-planned Sale';
  const signalDescription = notable
    ? (has10b51
        ? 'Large planned sale under 10b5-1 -- significant size warrants review.'
        : 'This transaction size may be relevant to your investment thesis.')
    : (has10b51
        ? 'Pre-scheduled 10b5-1 trade -- no discretionary decision by insider.'
        : 'Likely routine diversification, not a signal about company outlook.');

  // Determine if we have meaningful transaction data
  const hasTransactionData = shares || estimatedValue || percentOfHoldings;

  // Prefer AI-provided headline, fall back to sentence extraction
  const aiHeadline = typeof data?.headline === 'string' ? data.headline : '';
  let headline = aiHeadline;
  if (!headline) {
    headline = summaryText?.split(/(?<=[.!?])\s+/)[0] || '';
    if (headline.length < 30 && summaryText && summaryText.length > headline.length) {
      headline = summaryText;
    }
  }

  // Remaining summary after the headline.
  // Only slice when summaryText actually starts with headline (sentence-extraction path);
  // when AI provided an independent headline, show the full summaryText as remaining.
  const remainingSummary = summaryText && headline && summaryText !== headline
    ? (summaryText.startsWith(headline) ? summaryText.slice(headline.length).trim() : summaryText)
    : '';

  // Build preheader text for inbox preview
  const preheaderText = `${signalLabel}: ${signalVerdict} -- ${filerName} filed Form 144 for ${displayTicker}`;

  // Build data snapshot rows
  const dataRows: { label: string; value: string; color?: string }[] = [];
  if (estimatedValue) {
    dataRows.push({
      label: 'Est. Value',
      value: estimatedValue || formatCompactValue(estimatedValueNum),
      color: '#DC2626',
    });
  }
  if (shares) {
    dataRows.push({ label: 'Shares to Sell', value: shares, color: '#DC2626' });
  }
  if (percentOfHoldings) {
    dataRows.push({ label: '% of Holdings', value: percentOfHoldings });
  }
  if (remainingHoldings && parseNumericValue(remainingHoldings) > 0) {
    dataRows.push({ label: 'Remaining', value: remainingHoldings });
  }
  if (sharesOutstanding && parseNumericValue(sharesOutstanding) > 0) {
    dataRows.push({ label: 'Class Outstanding', value: sharesOutstanding });
  }

  // Watch-for items
  const watchFor: string[] = [];
  if (has10b51) {
    watchFor.push('Trade executed under a pre-planned 10b5-1 trading plan');
  }
  if (investorImplication) {
    watchFor.push(investorImplication);
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

      {/* Header */}
      <EmailHeader
        ticker={displayTicker}
        companyName={companyName}
        filingType={filingType || 'Form 144'}
        filingDate={filingDate}
        filerName={filerName}
        filerRole={filerRole}
      />

      {/* Smart Brevity body */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>

              {/* Signal badge -- FIRST element */}
              <div style={{ marginBottom: '12px' }}>
                <span style={{
                  ...EmailStyles.pillBadge,
                  backgroundColor: badgeColors.bg,
                  color: badgeColors.text,
                }}>
                  {notable ? '!' : '\u2713'} {signalLabel}
                </span>
              </div>

              {/* Lead sentence */}
              <h1 style={EmailStyles.leadSentence}>
                {headline || `${filerName} filed a Form 144 for ${displayTicker}`}
              </h1>

              {/* Why it matters */}
              <p style={EmailStyles.whyItMatters}>
                <strong style={{ color: '#000000' }}>Why it matters: </strong>
                {signalDescription}
              </p>

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
                          color: row.color || '#111827',
                          borderBottom: idx < dataRows.length - 1 ? '1px solid #F0F0F0' : 'none',
                        }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Thin divider */}
              {remainingSummary && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                  <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                </table>
              )}

              {/* Story -- remaining narrative */}
              {remainingSummary && (
                <div
                  style={EmailStyles.prose}
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(remainingSummary) }}
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
                    <div key={idx} style={{
                      padding: '3px 0 3px 16px',
                      fontSize: '14px',
                      color: EmailColors.text.body,
                      lineHeight: '1.5',
                    }}>
                      <span style={{ color: EmailColors.text.meta, marginRight: '8px' }}>•</span>
                      {item}
                    </div>
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
                  View the full Form 144 filing for transaction details.
                </p>
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
