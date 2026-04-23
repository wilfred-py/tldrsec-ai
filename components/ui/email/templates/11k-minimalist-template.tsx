import * as React from 'react';
import { EmailColors, EmailStyles, getChangeStyle, getChangeArrow, markdownToHtml } from '../design-system';
import { EmailLeadHeader } from './sections/EmailLeadHeader';
import { FormPlusMaterialityBadgeRow } from './sections/FormPlusMaterialityBadgeRow';
import { EmailFooter } from './sections/EmailFooter';
import { FilingTemplateData } from '../../../../lib/email/types';

interface Form11KMinimalistTemplateProps {
  filing: FilingTemplateData;
}

/**
 * 11-K (Employee Stock Plan) email template - Smart Brevity format
 *
 * Layout:
 * - Preheader for inbox preview
 * - Signal pill badge (EMPLOYEE PLAN)
 * - Lead sentence (plan name + fiscal year)
 * - Why it matters
 * - Data snapshot: assets, participants, contributions, distributions
 * - Investment options as narrative
 * - Watch for: notable changes
 */
export function Form11KMinimalistTemplate({ filing }: Form11KMinimalistTemplateProps) {
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

  const planName = rawData?.planName as string | undefined;
  const planFiscalYear = rawData?.planFiscalYear as string | undefined;
  const planAssets = rawData?.planAssets as string | undefined;
  const netAssetsChange = rawData?.netAssetsChange as string | undefined;
  const participantCount = rawData?.participantCount as string | undefined;
  const contributionsReceived = rawData?.contributionsReceived as string | undefined;
  const employerContributions = rawData?.employerContributions as string | undefined;
  const benefitsDistributed = rawData?.benefitsDistributed as string | undefined;
  const companyStockHoldings = rawData?.companyStockHoldings as string | undefined;
  const planType = rawData?.planType as string | undefined;

  const investmentOptions = rawData?.investmentOptions as Array<{
    name: string;
    allocation?: string;
    return?: string;
  }> | undefined;

  // Build preheader text
  const preheaderText = `EMPLOYEE PLAN: ${companyName} (${displayTicker}) -- ${planName || '11-K filing'} ${planAssets ? `with ${planAssets} in assets` : ''}`;

  // Prefer AI-provided headline, fall back to structured synthesis
  const aiHeadline = typeof rawData?.headline === 'string' ? rawData.headline : '';
  const leadText = aiHeadline || (planName
    ? `${companyName} reported on ${planName}${planFiscalYear ? ` for fiscal year ${planFiscalYear}` : ''}.`
    : summaryText?.split(/(?<=[.!?])\s+/)[0] || '');

  // Remaining summary
  const remainingSummary = summaryText && leadText && summaryText !== leadText
    ? (summaryText.startsWith(leadText) ? summaryText.slice(leadText.length).trim() : summaryText)
    : '';

  // Build data snapshot rows
  const dataRows: { label: string; value: string; color?: string }[] = [];
  if (planAssets) {
    dataRows.push({ label: 'Plan Assets', value: planAssets, color: '#059669' });
  }
  if (netAssetsChange) {
    const changeStyle = getChangeStyle(netAssetsChange);
    const arrow = getChangeArrow(netAssetsChange);
    dataRows.push({ label: 'Net Change', value: `${arrow}${netAssetsChange}`, color: changeStyle.color });
  }
  if (participantCount) {
    dataRows.push({ label: 'Participants', value: participantCount });
  }
  if (companyStockHoldings) {
    dataRows.push({ label: 'Company Stock', value: companyStockHoldings });
  }
  if (contributionsReceived) {
    dataRows.push({ label: 'Employee Contributions', value: `+${contributionsReceived}`, color: '#059669' });
  }
  if (employerContributions) {
    dataRows.push({ label: 'Employer Match', value: `+${employerContributions}`, color: '#059669' });
  }
  if (benefitsDistributed) {
    dataRows.push({ label: 'Benefits Paid Out', value: `-${benefitsDistributed}`, color: '#DC2626' });
  }

  // Watch-for items from investment options
  const watchFor: string[] = [];
  if (investmentOptions && investmentOptions.length > 0) {
    for (const opt of investmentOptions.slice(0, 4)) {
      const parts = [opt.name];
      if (opt.allocation) parts.push(opt.allocation);
      if (opt.return) {
        const arrow = getChangeArrow(opt.return);
        parts.push(`${arrow}${opt.return}`);
      }
      watchFor.push(parts.join(' -- '));
    }
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

      {/* Lead-with-headline header */}
      <EmailLeadHeader
        ticker={displayTicker}
        companyName={companyName}
        filingDate={filingDate}
        headline={leadText || `${companyName} filed an 11-K employee benefit plan report`}
      />

      {/* Form badge + signal badge row */}
      <FormPlusMaterialityBadgeRow
        filingType={filingType || '11-K'}
        signal={{ label: planType || 'EMPLOYEE PLAN', colorKey: 'neutral' }}
      />

      {/* Smart Brevity body */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{ padding: '0 15px 20px' }}>

              {/* Why it matters */}
              <p style={EmailStyles.whyItMatters}>
                <strong style={{ color: '#000000' }}>Why it matters: </strong>
                Employee benefit plan filings reveal workforce investment health, employer match generosity, and how much employees are concentrated in company stock -- a proxy for internal confidence.
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

              {/* Watch for (investment options) */}
              {watchFor.length > 0 && (
                <>
                  <table width="100%" cellPadding="0" cellSpacing="0" style={{ margin: '20px 0' }}>
                    <tbody><tr><td style={EmailStyles.thinDivider}></td></tr></tbody>
                  </table>
                  <div style={EmailStyles.watchForHeader}>Top investment options:</div>
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
        formType={filingType || '11-K'}
      />
    </div>
  );
}

export default Form11KMinimalistTemplate;
