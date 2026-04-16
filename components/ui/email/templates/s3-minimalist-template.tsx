import * as React from 'react';
import { EmailColors, EmailStyles, BadgeColors, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { FilingTemplateData } from '../../../../lib/email/types';

interface FormS3MinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * S-3 (Secondary Offering) email template - Smart Brevity format
 *
 * Layout:
 * - Preheader for inbox preview
 * - Signal pill badge (OFFERING)
 * - Lead sentence (offering type + dilution impact)
 * - Why it matters
 * - Data snapshot: amount, shares, price, shelf details
 * - Selling shareholders as narrative
 * - Use of proceeds as "Watch for:" bullets
 */
export function FormS3MinimalistTemplate({ filing }: FormS3MinimalistTemplateProps) {
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

  const offeringType = rawData?.offeringType as string | undefined;
  const offeringAmount = rawData?.offeringAmount as string | undefined;
  const sharesOffered = rawData?.sharesOffered as string | undefined;
  const dilutionImpact = rawData?.dilutionImpact as string | undefined;
  const pricePerShare = rawData?.pricePerShare as string | undefined;

  const sellingShareholders = rawData?.sellingShareholders as Array<{
    name: string;
    shares: string;
  }> | undefined;

  const shelfRegistration = rawData?.shelfRegistration as {
    totalAuthorized?: string;
    remainingCapacity?: string;
    expirationDate?: string;
  } | undefined;

  const useOfProceeds = rawData?.useOfProceeds as string[] | undefined;

  // Build preheader text
  const preheaderText = `OFFERING: ${companyName} (${displayTicker}) -- ${offeringType || 'Secondary offering'} ${offeringAmount ? `of ${offeringAmount}` : ''}`;

  // Prefer AI-provided headline, fall back to sentence extraction
  const aiHeadline = typeof rawData?.headline === 'string' ? rawData.headline : '';
  const leadText = summaryText?.split(/(?<=[.!?])\s+/)[0] || '';
  const headline = aiHeadline || (leadText.length >= 30 ? leadText : summaryText || '');

  // Remaining summary after headline.
  // Only slice when summaryText actually starts with headline (sentence-extraction path);
  // when AI provided an independent headline, show the full summaryText as remaining.
  const remainingSummary = summaryText && headline && summaryText !== headline
    ? (summaryText.startsWith(headline) ? summaryText.slice(headline.length).trim() : summaryText)
    : '';

  // Build data snapshot rows
  const dataRows: { label: string; value: string; color?: string }[] = [];
  if (offeringAmount) {
    dataRows.push({ label: 'Offering Amount', value: offeringAmount, color: '#059669' });
  }
  if (sharesOffered) {
    dataRows.push({ label: 'Shares Offered', value: sharesOffered });
  }
  if (pricePerShare) {
    dataRows.push({ label: 'Price/Share', value: pricePerShare });
  }
  if (dilutionImpact) {
    dataRows.push({ label: 'Dilution Impact', value: dilutionImpact, color: '#DC2626' });
  }
  // Shelf registration details
  if (shelfRegistration?.totalAuthorized) {
    dataRows.push({ label: 'Shelf Authorized', value: shelfRegistration.totalAuthorized });
  }
  if (shelfRegistration?.remainingCapacity) {
    dataRows.push({ label: 'Remaining Capacity', value: shelfRegistration.remainingCapacity });
  }
  if (shelfRegistration?.expirationDate) {
    dataRows.push({ label: 'Shelf Expiration', value: shelfRegistration.expirationDate });
  }

  // Watch-for items from use of proceeds
  const watchFor: string[] = [];
  if (useOfProceeds && useOfProceeds.length > 0) {
    watchFor.push(...useOfProceeds.slice(0, 4));
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
        filingType={filingType || 'S-3'}
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
                  backgroundColor: BadgeColors.neutral.bg,
                  color: BadgeColors.neutral.text,
                }}>
                  {offeringType || 'OFFERING'}
                </span>
              </div>

              {/* Lead sentence */}
              <h1 style={EmailStyles.leadSentence}>
                {headline || `${companyName} filed an S-3 registration for a secondary offering`}
              </h1>

              {/* Why it matters */}
              <p style={EmailStyles.whyItMatters}>
                <strong style={{ color: '#000000' }}>Why it matters: </strong>
                {dilutionImpact
                  ? `This offering has a dilution impact of ${dilutionImpact}. Secondary offerings can signal capital needs or shareholder exits -- context matters.`
                  : 'Secondary offerings can dilute existing shares or signal that large holders are exiting. Monitor the offering size relative to market cap.'}
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

              {/* Selling shareholders as narrative */}
              {sellingShareholders && sellingShareholders.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div style={{ ...EmailStyles.watchForHeader, marginBottom: '6px' }}>Selling shareholders:</div>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '4px' }}>
                    <tbody>
                      {sellingShareholders.slice(0, 5).map((holder, idx) => (
                        <tr key={idx}>
                          <td style={{
                            ...EmailStyles.dataLabel,
                            borderBottom: idx < Math.min(sellingShareholders.length, 5) - 1 ? '1px solid #F0F0F0' : 'none',
                          }}>{holder.name}</td>
                          <td style={{
                            ...EmailStyles.dataValue,
                            borderBottom: idx < Math.min(sellingShareholders.length, 5) - 1 ? '1px solid #F0F0F0' : 'none',
                          }}>{holder.shares}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

              {/* Watch for (use of proceeds) */}
              {watchFor.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div style={EmailStyles.watchForHeader}>Use of proceeds:</div>
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
        formType={filingType || 'S-3'}
      />
    </div>
  );
}

export default FormS3MinimalistTemplate;
