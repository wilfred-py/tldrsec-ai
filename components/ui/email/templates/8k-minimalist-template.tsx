import * as React from 'react';
import { EmailColors, markdownToHtml, getSentimentColor, getSentimentEmoji } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { SectionCard } from './sections/SectionCard';
import { FilingTemplateData } from '../../../../lib/email/types';
import { extract8KData } from '../../../../lib/email/8k-data-extractor';

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
  '8.01', // Other Events (often material)
]);

/**
 * Determine if an 8-K filing is material based on item numbers
 */
function isMaterialFiling(itemNumbers: string[], summaryText: string): boolean {
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
    'dividend', 'buyback', 'repurchase', 'material', 'significant',
    'restructuring', 'layoff', 'workforce', 'guidance', 'outlook',
    'agreement', 'contract', 'settlement', 'litigation', 'lawsuit'
  ];

  for (const keyword of materialKeywords) {
    if (textLower.includes(keyword)) {
      return true;
    }
  }

  // Default to routine if only exhibits or FD disclosure
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
 * Format text with bold styling for key values
 */
function formatText(text: string): string {
  if (!text) return '';
  let html = text;
  html = html.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;');
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
  html = html.replace(/—/g, '&mdash;');
  return html;
}

/**
 * Form 8-K Email Template - Signal-First Design
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

  // Extract first sentence as the headline
  let headline = summaryText?.split(/(?<=[.!?])\s+/)[0] || '';
  if (headline.length < 30 && summaryText && summaryText.length > headline.length) {
    headline = summaryText;
  }

  // Format items for display
  const itemsDisplay = itemNumbers.length > 0
    ? itemNumbers.map(item => `Item ${item}`).join(', ')
    : '';

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
        filingType={filingType || '8-K'}
        filingDate={filingDate}
      />

      {/* Main content */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>

              {/* ═══════════════════════════════════════════════════════════
                  THE VERDICT - 2-Level Signal (Material Event vs Routine)
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
                              {/* Sentiment badge inline with materiality */}
                              {/* Don't show neutral sentiment with material events - conflicting information */}
                              {sentiment && !(isMaterial && sentiment.toLowerCase() === 'neutral') && (
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 12px',
                                  marginLeft: '8px',
                                  backgroundColor: getSentimentColor(sentiment).bg,
                                  color: getSentimentColor(sentiment).text,
                                  borderRadius: '20px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                }}>
                                  {getSentimentEmoji(sentiment)} {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
                                </span>
                              )}
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
                                {eventType || signal.verdict}
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
                  FILING DETAILS - Item numbers and event type
                  ═══════════════════════════════════════════════════════════ */}
              {(itemsDisplay || financialImpact) && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '16px' }}>
                  <tbody>
                    <tr>
                      <td>
                        <table width="100%" cellPadding="0" cellSpacing="0">
                          <tbody>
                            <tr>
                              {/* Items Reported Card */}
                              {itemsDisplay && (
                                <td style={{
                                  width: financialImpact ? '48%' : '100%',
                                  padding: '16px',
                                  backgroundColor: EmailColors.structure.backgroundAlt,
                                  borderRadius: '8px',
                                  verticalAlign: 'top',
                                }}>
                                  <div style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: EmailColors.text.meta,
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: '0.5px',
                                    marginBottom: '4px',
                                  }}>
                                    Items Reported
                                  </div>
                                  <div style={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: EmailColors.text.headline,
                                    lineHeight: '1.4',
                                  }}>
                                    {itemsDisplay}
                                  </div>
                                </td>
                              )}

                              {/* Gap spacer */}
                              {itemsDisplay && financialImpact && (
                                <td style={{ width: '4%' }}></td>
                              )}

                              {/* Financial Impact Card */}
                              {financialImpact && (
                                <td style={{
                                  width: itemsDisplay ? '48%' : '100%',
                                  padding: '16px',
                                  backgroundColor: EmailColors.structure.backgroundAlt,
                                  borderRadius: '8px',
                                  verticalAlign: 'top',
                                }}>
                                  <div style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: EmailColors.text.meta,
                                    textTransform: 'uppercase' as const,
                                    letterSpacing: '0.5px',
                                    marginBottom: '4px',
                                  }}>
                                    Financial Impact
                                  </div>
                                  <div style={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: EmailColors.text.headline,
                                    lineHeight: '1.4',
                                  }}>
                                    {financialImpact}
                                  </div>
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
                  KEY HIGHLIGHTS - Bullet points from AI
                  ═══════════════════════════════════════════════════════════ */}
              {keyHighlights.length > 0 && (
                <SectionCard>
                  <tr>
                    <td>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: EmailColors.text.meta,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.5px',
                        marginBottom: '12px',
                        borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                        paddingBottom: '8px',
                      }}>
                        Key Highlights
                      </div>
                      <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                          {keyHighlights.slice(0, 5).map((highlight, index) => (
                            <tr key={index}>
                              <td style={{
                                padding: '4px 0',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                color: EmailColors.text.body,
                              }}>
                                <span style={{ marginRight: '8px', color: EmailColors.text.meta }}>•</span>
                                <span dangerouslySetInnerHTML={{ __html: formatText(highlight) }} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  THE STORY - Summary with key values highlighted
                  ═══════════════════════════════════════════════════════════ */}
              {headline && !keyHighlights.length && (
                <SectionCard>
                  <tr>
                    <td>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: EmailColors.text.meta,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.5px',
                        marginBottom: '12px',
                        borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                        paddingBottom: '8px',
                      }}>
                        Summary
                      </div>
                      <div
                        style={{
                          fontSize: '15px',
                          lineHeight: '1.6',
                          color: EmailColors.text.body,
                        }}
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(headline) }}
                      />
                    </td>
                  </tr>
                </SectionCard>
              )}

              {/* No data fallback */}
              {!summaryText && !keyHighlights.length && (
                <SectionCard>
                  <tr>
                    <td style={{
                      fontSize: '14px',
                      lineHeight: '1.6',
                      color: EmailColors.text.meta,
                      textAlign: 'center',
                      padding: '20px',
                    }}>
                      View the full Form 8-K filing for event details.
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
        formType={filingType || '8-K'}
      />
    </div>
  );
}

export default Form8KMinimalistTemplate;
