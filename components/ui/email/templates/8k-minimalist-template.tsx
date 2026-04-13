import * as React from 'react';
import { EmailColors, EmailStyles, BadgeColors, markdownToHtml, getSentimentColor, getSentimentEmoji } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { FilingTemplateData } from '../../../../lib/email/types';
import { extract8KData } from '../../../../lib/email/8k-data-extractor';
import { getItemDescription } from '../../../../lib/constants/sec-item-descriptions';
import { StalenessBanner } from './sections/StalenessBanner';

export { getItemDescription };

interface Form8KMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * 8-K Item Numbers and their materiality
 * Material items typically contain significant corporate events
 * Routine items are administrative or exhibit-only filings
 */
const MATERIAL_ITEMS = new Set([
  '1.01', // Entry into Material Agreement
  '1.02', // Termination of Material Agreement
  '1.03', // Bankruptcy or Receivership
  '2.01', // Completion of Acquisition or Disposition
  '2.02', // Results of Operations and Financial Condition (Earnings)
  '2.03', // Creation of Direct Financial Obligation
  '2.04', // Triggering Events
  '2.05', // Costs Associated with Exit or Disposal
  '2.06', // Material Impairments
  '3.01', // Notice of Delisting
  '3.02', // Unregistered Sales of Equity Securities
  '3.03', // Material Modification to Rights of Security Holders
  '4.01', // Changes in Registrant's Certifying Accountant
  '4.02', // Non-Reliance on Previously Issued Financial Statements
  '5.01', // Changes in Control of Registrant
  '5.02', // Departure/Election of Directors or Officers
  '5.03', // Amendments to Articles of Incorporation or Bylaws
  '5.04', // Temporary Suspension of Trading
  '5.05', // Amendment to Code of Ethics
  '5.06', // Change in Shell Company Status
  '5.07', // Submission of Matters to Vote of Security Holders
  '5.08', // Shareholder Nominations
  '6.01', // ABS Informational and Computational Material
  '6.02', // Change of Servicer or Trustee
  '6.03', // Change in Credit Enhancement
  '6.04', // Failure to Make Required Distribution
  '6.05', // Securities Act Updating Disclosure
  // 8.01 (Other Events) and 9.01 (Financial Statements/Exhibits) excluded -
  // too common and often routine. Materiality determined by content/dollar amounts.
]);

/**
 * Determine if an 8-K filing is material based on item numbers,
 * keywords, or large dollar amounts (>= $500M).
 */
export function isMaterialFiling(itemNumbers: string[], summaryText: string): boolean {
  // Check item numbers for material items
  for (const item of itemNumbers) {
    if (MATERIAL_ITEMS.has(item)) {
      return true;
    }
  }

  // Check summary text for material keywords
  const textLower = summaryText?.toLowerCase() || '';
  const materialKeywords = [
    'acquisition', 'merger', 'earnings', 'revenue', 'profit', 'loss',
    'ceo', 'cfo', 'officer', 'director', 'departure', 'appointed',
    'dividend', 'buyback', 'repurchase',
    'restructuring', 'layoff', 'workforce', 'guidance', 'outlook',
    'settlement', 'litigation', 'lawsuit', 'bankruptcy', 'impairment',
    'restatement', 'cybersecurity incident',
  ];

  for (const keyword of materialKeywords) {
    if (textLower.includes(keyword)) {
      return true;
    }
  }

  // Check for large dollar amounts (>= $500M threshold)
  if (summaryText && hasLargeDollarAmount(summaryText)) {
    return true;
  }

  // Default to routine if only exhibits or FD disclosure
  return false;
}

/**
 * Detect dollar amounts >= $500M in text.
 * Handles formats: $1.2B, $500M, $750m, $1,200,000,000, $X billion, $X million (>= 500)
 */
function hasLargeDollarAmount(text: string): boolean {
  // Match $XB or $X.YB (any billion amount is material)
  if (/\$[\d,.]+\s*[Bb]/i.test(text)) return true;

  // Match "$X billion" (any billion amount is material)
  if (/\$[\d,.]+\s+billion/i.test(text)) return true;

  // Match $XM or $X.YM and check if >= 500
  const mMatch = text.match(/\$(\d[\d,.]*)\s*[Mm]/g);
  if (mMatch) {
    for (const match of mMatch) {
      const numStr = match.replace(/\$/, '').replace(/[Mm]/, '').replace(/,/g, '').trim();
      const num = parseFloat(numStr);
      if (num >= 500) return true;
    }
  }

  // Match "$X million" and check if >= 500
  const millionMatch = text.match(/\$([\d,.]+)\s+million/gi);
  if (millionMatch) {
    for (const match of millionMatch) {
      const numStr = match.replace(/\$/, '').replace(/\s+million/i, '').replace(/,/g, '').trim();
      const num = parseFloat(numStr);
      if (num >= 500) return true;
    }
  }

  // Match $X,XXX,XXX,XXX (>= 500,000,000)
  const fullAmountMatch = text.match(/\$([\d,]+(?:\.\d+)?)/g);
  if (fullAmountMatch) {
    for (const match of fullAmountMatch) {
      const numStr = match.replace(/\$/, '').replace(/,/g, '');
      const num = parseFloat(numStr);
      if (num >= 500_000_000) return true;
    }
  }

  return false;
}

/**
 * Get signal configuration (2-level: Material Event vs Routine Disclosure)
 */
function getSignalConfig(isMaterial: boolean) {
  if (isMaterial) {
    return {
      level: 'MATERIAL EVENT',
      verdict: 'Worth Attention',
      description: 'This filing contains significant corporate news that may affect your investment.',
      bgColor: '#FEF3C7',      // Amber 100
      borderColor: '#F59E0B',  // Amber 500
      textColor: '#92400E',    // Amber 800
      icon: '!',
    };
  } else {
    return {
      level: 'ROUTINE DISCLOSURE',
      verdict: 'Administrative Filing',
      description: 'Standard corporate disclosure - likely not material to investment decisions.',
      bgColor: '#F1F5F9',      // Slate 100
      borderColor: '#94A3B8',  // Slate 400
      textColor: '#475569',    // Slate 600
      icon: '\u2713',
    };
  }
}

/**
 * Format text with bold styling for key values.
 * Uses font-weight:600 to match design-system.ts markdownToHtml().
 */
export function formatText(text: string): string {
  if (!text) return '';
  let html = text;
  // Strip leading bullets/dashes that AI may have included in JSON string values
  html = html.replace(/^[\s]*[•\-\*]\s*/, '');
  // ⚠️ SECURITY BOUNDARY: Unconditional escaping prevents entity-based XSS bypass
  // (e.g., &#60;script&#62;). Must remain above all HTML generation below.
  html = html.replace(/&/g, '&amp;');
  html = html.replace(/</g, '&lt;');
  html = html.replace(/>/g, '&gt;');
  html = html.replace(/"/g, '&quot;');
  html = html.replace(/'/g, '&#39;');
  // Bold dollar amounts
  html = html.replace(
    /(\$[\d,]+(?:\.\d+)?[KMB]?)/g,
    `<strong style="color:${EmailColors.text.headline};font-weight:600;">$1</strong>`
  );
  // Bold percentages
  html = html.replace(
    /(-?\d+(?:\.\d+)?%)/g,
    `<strong style="color:${EmailColors.text.headline};font-weight:600;">$1</strong>`
  );
  html = html.replace(/—/g, '&mdash;');
  return html;
}

/**
 * Extract a clean, specific headline from AI-generated summary text.
 * Skips generic prefixes, deduplicates against eventType, and truncates.
 */
export function getCleanHeadline(summaryText: string, eventType: string): string {
  if (!summaryText) return '';

  // Split on sentence boundaries, skipping common abbreviations
  const abbrevPattern = /(?<!\b(?:Corp|Inc|Ltd|Mr|Mrs|Dr|Jr|Sr|vs|etc|approx|est))\.\s+/;
  const firstSentence = summaryText.split(abbrevPattern)[0] || '';

  let headline = firstSentence;

  // If first sentence is too short, use more text
  if (headline.length < 30 && summaryText.length > headline.length) {
    headline = summaryText;
  }

  // Skip generic AI prefixes
  if (/^this\s+(filing|8-k|report|document)\b/i.test(headline)) {
    return '';
  }

  // Strip leading eventType prefix to avoid duplication
  if (eventType && headline.toLowerCase().startsWith(eventType.toLowerCase())) {
    headline = headline.slice(eventType.length);
    // Strip leading separators after prefix removal
    headline = headline.replace(/^[\s]*[:\-–—]+[\s]*/, '');
  }

  // Truncate at 120 chars
  if (headline.length > 120) {
    headline = headline.slice(0, 117) + '...';
  }

  return headline.trim();
}

/**
 * Form 8-K Email Template - Smart Brevity Design
 *
 * Structure: Signal badge (MATERIAL/ROUTINE) -> Lead sentence -> Why it matters
 * -> Data snapshot -> Story narrative -> Watch for bullets
 *
 * 2-level signal system:
 * - MATERIAL EVENT (amber): Significant corporate news (earnings, M&A, executive changes)
 * - ROUTINE DISCLOSURE (gray): Administrative filings, exhibits, minor updates
 */
export function Form8KMinimalistTemplate({ filing }: Form8KMinimalistTemplateProps) {
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
  const extractedData = summaryText ? extract8KData(summaryText) : null;

  // Merge data sources
  const eventType = (data?.eventType || extractedData?.eventType || '') as string;
  const itemNumbers = (data?.itemNumbers || extractedData?.itemNumbers || []) as string[];
  const keyHighlights = (data?.keyHighlights || extractedData?.keyHighlights || []) as string[];
  const financialImpact = (data?.financialImpact || extractedData?.financialImpact || '') as string;
  const sentiment = (data?.sentiment || extractedData?.sentiment || '') as string;

  const displayTicker = symbol || ticker || 'N/A';

  // Determine materiality (2-level system)
  const isMaterial = isMaterialFiling(itemNumbers, summaryText || '');
  const signal = getSignalConfig(isMaterial);

  // Extract and clean the headline for the lead sentence
  const headline = getCleanHeadline(summaryText || '', eventType);

  // Format items for display with human-readable descriptions
  const itemsDisplay = itemNumbers.length > 0
    ? itemNumbers.map(item => {
        const desc = getItemDescription(item);
        return desc ? `Item ${item} - ${desc}` : `Item ${item}`;
      }).join(' | ')
    : '';

  // Build preheader text for inbox preview
  const preheaderText = `${signal.level}: ${signal.verdict} — ${(summaryText || '').substring(0, 100)}`;

  // Pick badge colors from the muted palette
  const signalBadgeColors = isMaterial ? BadgeColors.high : BadgeColors.low;

  // Remaining summary text after the headline sentence for the story section
  const remainingSummary = (headline && summaryText && summaryText.length > headline.length)
    ? summaryText.slice(headline.length).trim()
    : '';

  // Build "Why it matters" prose — consolidate financial impact + signal description
  const whyItMattersText = financialImpact
    ? `${signal.description} ${financialImpact}`
    : signal.description;

  // Build data snapshot rows
  const dataRows: { label: string; value: string }[] = [];
  if (eventType) {
    dataRows.push({ label: 'Event', value: eventType });
  }
  if (filingDate) {
    dataRows.push({ label: 'Filed', value: filingDate });
  }

  // Build watch-for items from key highlights + items reported
  const watchFor: string[] = [];
  if (keyHighlights.length > 0) {
    watchFor.push(...keyHighlights.slice(0, 4));
  }
  if (itemsDisplay) {
    watchFor.push(itemsDisplay);
  }

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

      {/* Header */}
      <EmailHeader
        ticker={displayTicker}
        companyName={companyName}
        filingType={filingType || '8-K'}
        filingDate={filingDate}
        filingCategory={isMaterial ? 'Material' : 'Routine'}
      />

      {/* Staleness warning */}
      {filingDate && (
        <div style={{ padding: '0 15px' }}>
          <StalenessBanner filingDate={new Date(filingDate)} />
        </div>
      )}

      {/* Smart Brevity body */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>

              {/* Signal badge — FIRST element the user sees */}
              <div style={{ marginBottom: '12px' }}>
                <span style={{
                  ...EmailStyles.pillBadge,
                  backgroundColor: signalBadgeColors.bg,
                  color: signalBadgeColors.text,
                }}>
                  {signal.icon} {signal.level}
                </span>

                {/* Sentiment badge — inline, muted colors */}
                {sentiment && !(isMaterial && sentiment.toLowerCase() === 'neutral') && (
                  <span style={{
                    ...EmailStyles.pillBadge,
                    marginLeft: '8px',
                    backgroundColor: getSentimentColor(sentiment).bg,
                    color: getSentimentColor(sentiment).text,
                  }}>
                    {getSentimentEmoji(sentiment)} {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
                  </span>
                )}

                {/* Filing type category badge */}
                <span style={{
                  ...EmailStyles.categoryBadge,
                  marginLeft: '8px',
                }}>
                  8-K {eventType ? `| ${eventType}` : ''}
                </span>
              </div>

              {/* Lead sentence */}
              <h1 style={EmailStyles.leadSentence}>
                {headline || eventType || signal.verdict}
              </h1>

              {/* Why it matters */}
              <p style={EmailStyles.whyItMatters}>
                <strong style={{ color: '#000000' }}>Why it matters: </strong>
                {whyItMattersText}
              </p>

              {/* Thin divider */}
              {dataRows.length > 0 && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                  <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                </table>
              )}

              {/* Data snapshot rows */}
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

              {/* Story — remaining narrative */}
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
                      <span dangerouslySetInnerHTML={{ __html: formatText(item) }} />
                    </div>
                  ))}
                </>
              )}

              {/* No data fallback */}
              {!summaryText && !keyHighlights.length && (
                <p style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: EmailColors.text.meta,
                  textAlign: 'center',
                  padding: '20px 0',
                }}>
                  View the full Form 8-K filing for event details.
                </p>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || '8-K'}
      />
    </div>
  );
}

export default Form8KMinimalistTemplate;
