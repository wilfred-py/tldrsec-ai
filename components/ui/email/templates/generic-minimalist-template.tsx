import * as React from 'react';
import { EmailColors, EmailStyles, BadgeColors, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';
import { FilingTemplateData } from '../../../../lib/email/types';

interface GenericMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * Generic email template for all filing types - Smart Brevity format
 *
 * Layout:
 * - Preheader for inbox preview
 * - Signal pill badge (filing type)
 * - Lead sentence (first sentence or document description)
 * - Why it matters
 * - Key points as data-style rows
 * - Story via markdownToHtml
 */
export function GenericMinimalistTemplate({ filing }: GenericMinimalistTemplateProps) {
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

  // Extract structured data if available (from AI summaryJSON)
  const rawData = summaryData as Record<string, unknown> | undefined;
  const keyPoints = rawData?.keyPoints as string[] | undefined;
  const documentDescription = rawData?.documentDescription as string | undefined;

  // Build preheader text
  const preheaderText = `${filingType || 'SEC FILING'}: ${companyName} (${displayTicker}) -- ${(documentDescription || summaryText || '').substring(0, 80)}`;

  // Prefer AI-provided headline, fall back to documentDescription or sentence extraction
  const aiHeadline = typeof rawData?.headline === 'string' ? rawData.headline : '';
  const leadText = documentDescription || summaryText?.split(/(?<=[.!?])\s+/)[0] || '';
  const headline = aiHeadline || (leadText.length >= 30 ? leadText : (summaryText || leadText));

  // Remaining summary after headline
  const remainingSummary = summaryText && headline && summaryText.length > headline.length
    ? (documentDescription ? summaryText : summaryText.slice(headline.length).trim())
    : '';

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
        filingType={filingType}
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
                  {filingType || 'SEC FILING'}
                </span>
              </div>

              {/* Lead sentence */}
              <h1 style={EmailStyles.leadSentence}>
                {headline || `${companyName} filed a ${filingType || 'document'} with the SEC`}
              </h1>

              {/* Why it matters */}
              <p style={EmailStyles.whyItMatters}>
                <strong style={{ color: '#000000' }}>Why it matters: </strong>
                {documentDescription
                  ? `This filing provides new disclosure that may affect your investment thesis for ${displayTicker}.`
                  : `SEC filings contain material disclosures. Review the key points below for anything relevant to your ${displayTicker} position.`}
              </p>

              {/* Key points as watch-for style bullets */}
              {keyPoints && keyPoints.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div style={EmailStyles.watchForHeader}>Key points:</div>
                  {keyPoints.slice(0, 6).map((point, idx) => (
                    <div key={idx} style={{
                      padding: '3px 0 3px 16px',
                      fontSize: '14px',
                      color: EmailColors.text.body,
                      lineHeight: '1.5',
                    }}>
                      <span style={{ color: EmailColors.text.meta, marginRight: '8px' }}>•</span>
                      {point}
                    </div>
                  ))}
                </>
              )}

              {/* Story -- full narrative via markdown */}
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
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer with CTA */}
      <EmailFooter
        filingUrl={filingUrl}
        formType={filingType}
      />
    </div>
  );
}

export default GenericMinimalistTemplate;
