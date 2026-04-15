import * as React from 'react';
import { EmailColors, EmailStyles, BadgeColors, getChangeStyle, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { FilingTemplateData } from '../../../../lib/email/types';

interface FormS1MinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * S-1 (IPO Registration) email template - Smart Brevity format
 *
 * Layout:
 * - Preheader for inbox preview
 * - Signal pill badge (IPO FILING)
 * - Lead sentence (business description or headline)
 * - Why it matters
 * - Data snapshot: offering size, price range, shares, exchange
 * - Financial highlights as prose/bullets
 * - Use of proceeds + underwriters as narrative
 * - Risk factors as "Watch for:" bullets
 */
export function FormS1MinimalistTemplate({ filing }: FormS1MinimalistTemplateProps) {
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

  // Extract structured data if available
  const rawData = summaryData as Record<string, unknown> | undefined;

  const offeringSize = rawData?.offeringSize as string | undefined;
  const priceRange = rawData?.priceRange as string | undefined;
  const sharesOffered = rawData?.sharesOffered as string | undefined;
  const businessDescription = rawData?.businessDescription as string | undefined;
  const exchangeListing = rawData?.exchangeListing as string | undefined;
  const expectedTradingDate = rawData?.expectedTradingDate as string | undefined;

  const useOfProceeds = rawData?.useOfProceeds as string[] | undefined;
  const financialHighlights = rawData?.financialHighlights as Array<{
    label: string;
    value: string | number;
    change?: string | number;
  }> | undefined;
  const riskFactors = rawData?.riskFactors as string[] | undefined;
  const underwriters = rawData?.underwriters as string[] | undefined;

  // Build preheader text
  const preheaderText = `IPO FILING: ${companyName} (${displayTicker}) -- ${businessDescription || (summaryText || '').substring(0, 80)}`;

  // Prefer AI-provided headline, fall back to businessDescription or sentence extraction
  const aiHeadline = typeof rawData?.headline === 'string' ? rawData.headline : '';
  const leadText = aiHeadline || businessDescription || summaryText?.split(/(?<=[.!?])\s+/)[0] || '';

  // Remaining summary after the headline
  const remainingSummary = summaryText && leadText && summaryText.length > leadText.length && !businessDescription
    ? summaryText.slice(leadText.length).trim()
    : summaryText && businessDescription
      ? summaryText
      : '';

  // Build data snapshot rows
  const dataRows: { label: string; value: string; color?: string }[] = [];
  if (offeringSize) {
    dataRows.push({ label: 'Offering Size', value: offeringSize, color: '#059669' });
  }
  if (priceRange) {
    dataRows.push({ label: 'Price Range', value: priceRange });
  }
  if (sharesOffered) {
    dataRows.push({ label: 'Shares Offered', value: sharesOffered });
  }
  if (exchangeListing) {
    dataRows.push({ label: 'Exchange', value: exchangeListing });
  }
  if (expectedTradingDate) {
    dataRows.push({ label: 'Expected Trading', value: expectedTradingDate });
  }

  // Build watch-for items from risk factors
  const watchFor: string[] = [];
  if (riskFactors && riskFactors.length > 0) {
    watchFor.push(...riskFactors.slice(0, 3));
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
        filingType={filingType || 'S-1'}
        filingDate={filingDate}
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
                  backgroundColor: BadgeColors.moderate.bg,
                  color: BadgeColors.moderate.text,
                }}>
                  IPO FILING
                </span>
              </div>

              {/* Lead sentence */}
              <h1 style={EmailStyles.leadSentence}>
                {leadText || `${companyName} filed an S-1 registration statement`}
              </h1>

              {/* Why it matters */}
              <p style={EmailStyles.whyItMatters}>
                <strong style={{ color: '#000000' }}>Why it matters: </strong>
                An S-1 signals a company is preparing to go public. The offering size, valuation, and use of proceeds reveal management priorities and growth expectations.
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

              {/* Financial Highlights */}
              {financialHighlights && financialHighlights.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '4px' }}>
                    <tbody>
                      {financialHighlights.map((item, idx) => {
                        const changeStyle = getChangeStyle(item.change);
                        const arrow = getChangeArrow(item.change);
                        const valueStr = item.change
                          ? `${item.value} (${arrow}${item.change})`
                          : String(item.value);
                        return (
                          <tr key={idx}>
                            <td style={{
                              ...EmailStyles.dataLabel,
                              borderBottom: idx < financialHighlights.length - 1 ? '1px solid #F0F0F0' : 'none',
                            }}>{item.label}</td>
                            <td style={{
                              ...EmailStyles.dataValue,
                              color: item.change ? changeStyle.color : '#111827',
                              borderBottom: idx < financialHighlights.length - 1 ? '1px solid #F0F0F0' : 'none',
                            }}>{valueStr}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Use of Proceeds + Underwriters as narrative */}
              {((useOfProceeds && useOfProceeds.length > 0) || (underwriters && underwriters.length > 0)) && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  {useOfProceeds && useOfProceeds.length > 0 && (
                    <>
                      <div style={{ ...EmailStyles.watchForHeader, marginBottom: '6px' }}>Use of proceeds:</div>
                      {useOfProceeds.slice(0, 4).map((item, idx) => (
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
                  {underwriters && underwriters.length > 0 && (
                    <p style={{
                      ...EmailStyles.prose,
                      marginTop: '12px',
                    }}>
                      <strong style={{ color: '#000000' }}>Underwriters: </strong>
                      {underwriters.join(', ')}
                    </p>
                  )}
                </>
              )}

              {/* Story -- remaining narrative via markdown */}
              {remainingSummary && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div
                    style={EmailStyles.prose}
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(remainingSummary) }}
                  />
                </>
              )}

              {/* Watch for (risk factors) */}
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
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType || 'S-1'}
      />
    </div>
  );
}

export default FormS1MinimalistTemplate;
