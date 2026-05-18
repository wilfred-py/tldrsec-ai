import * as React from 'react';
import { EmailColors, SignalColors, markdownToHtml } from '../design-system';
import { EmailHeader } from './sections/EmailHeader';
import { EmailFooter } from './sections/EmailFooter';

interface CampaignDemoTemplateProps {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;
  filerName?: string;
  filerRole?: string;
  signalLevel: 'HIGH' | 'MODERATE' | 'LOW';
  signalVerdict: string;
  signalDescription: string;
  summaryText: string;
  transactions?: Array<{
    label: string;
    value: string;
    isNegative?: boolean;
    isBold?: boolean;
    isMonospace?: boolean;
  }>;
  unsubscribeUrl: string;
  founderNote?: string;
  /**
   * Layout for the founder-note slot.
   * - 'compact' (default): centered italic 13px, single line. Backwards compatible.
   * - 'letter': left-aligned 14px non-italic, multi-paragraph. Splits `founderNote`
   *   on blank lines into paragraphs, and `\n` within a paragraph into `<br/>`s
   *   so a "Founder, tldrSEC\nWilf" signoff renders on two lines.
   */
  founderNoteVariant?: 'compact' | 'letter';
  signupUrl?: string;
}

/**
 * Per-level icons live here (not in design-system.ts) because they're only
 * rendered by this React template — the inline-HTML campaign emails don't
 * surface them. Color tokens come from `SignalColors`.
 */
const signalIcons: Record<keyof typeof SignalColors, string> = {
  HIGH: '\u26A0\uFE0F',
  MODERATE: '\uD83D\uDC40',
  LOW: '\u2713',
};

/**
 * Campaign Email 1: "The Filing That Moved [Ticker]"
 *
 * Uses the same layout as production Form 4 emails:
 * EmailHeader -> Signal verdict hero -> Summary text -> Transaction table -> Founder note -> EmailFooter
 *
 * Pure value, no CTA. Shows a real AI-generated filing summary.
 */
export function CampaignDemoTemplate({
  ticker,
  companyName,
  filingType,
  filingDate,
  filerName,
  filerRole,
  signalLevel,
  signalVerdict,
  signalDescription,
  summaryText,
  transactions,
  unsubscribeUrl,
  founderNote,
  founderNoteVariant = 'compact',
  signupUrl = 'https://tldrsec.app/sign-up',
}: CampaignDemoTemplateProps) {
  const founderParagraphs = founderNote && founderNoteVariant === 'letter'
    ? founderNote.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    : null;
  const signal = SignalColors[signalLevel];
  const signalIcon = signalIcons[signalLevel];

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: EmailColors.structure.background,
      color: EmailColors.text.body,
    }}>
      {/* Shared EmailHeader - same as production emails */}
      <EmailHeader
        ticker={ticker}
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

              {/* Signal Verdict Hero - matches production Form 4 signal-first design */}
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
                        {signalIcon} {signalLevel} SIGNAL
                      </span>

                      {/* Verdict */}
                      <div style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: signal.textColor,
                        lineHeight: '1.2',
                        paddingTop: '12px',
                      }}>
                        {signalVerdict}
                      </div>

                      {/* Description */}
                      <div style={{
                        fontSize: '14px',
                        lineHeight: '1.5',
                        color: signal.textColor,
                        opacity: 0.9,
                        paddingTop: '8px',
                      }}>
                        {signalDescription}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Summary Text - uses markdownToHtml like production */}
              <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '16px' }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        fontSize: '15px',
                        lineHeight: '1.6',
                        color: EmailColors.text.body,
                        padding: '16px',
                      }}
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(summaryText) }}
                    />
                  </tr>
                </tbody>
              </table>

              {/* Transaction Table */}
              {transactions && transactions.length > 0 && (
                <table width="100%" cellPadding="0" cellSpacing="0" style={{
                  marginBottom: '16px',
                  border: `1px solid ${EmailColors.structure.border}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  borderCollapse: 'collapse',
                }}>
                  <thead><tr>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: `2px solid ${EmailColors.structure.border}`, color: '#000', fontSize: '12px', textTransform: 'uppercase' as const, backgroundColor: '#f8fafc' }}>Detail</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, borderBottom: `2px solid ${EmailColors.structure.border}`, color: '#000', fontSize: '12px', textTransform: 'uppercase' as const, backgroundColor: '#f8fafc' }}>Value</th>
                  </tr></thead>
                  <tbody>
                    {transactions.map((tx, idx) => (
                      <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                        <td style={{ padding: '10px 12px', borderBottom: idx < transactions.length - 1 ? `1px solid ${EmailColors.structure.borderLight}` : undefined, fontSize: '14px', color: EmailColors.text.body }}>{tx.label}</td>
                        <td style={{
                          padding: '10px 12px',
                          borderBottom: idx < transactions.length - 1 ? `1px solid ${EmailColors.structure.borderLight}` : undefined,
                          fontSize: '14px',
                          color: tx.isNegative ? '#EF4444' : tx.isBold ? '#000' : EmailColors.text.body,
                          textAlign: 'right',
                          fontWeight: tx.isBold ? 700 : 600,
                          fontFamily: tx.isMonospace ? 'Monaco, Consolas, monospace' : undefined,
                        }}>{tx.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Founder note */}
      <table width="100%" cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={{
              padding: founderParagraphs ? '20px 20px 8px' : '16px 15px 8px',
              borderTop: `1px solid ${EmailColors.structure.border}`,
              textAlign: founderParagraphs ? 'left' as const : 'center' as const,
            }}>
              {founderParagraphs ? (
                founderParagraphs.map((para, i) => {
                  const lines = para.split('\n');
                  return (
                    <p key={i} style={{
                      margin: i === 0 ? '0 0 14px' : '0 0 14px',
                      fontSize: '14px',
                      color: EmailColors.text.body,
                      lineHeight: '1.65',
                    }}>
                      {lines.map((line, j) => (
                        <React.Fragment key={j}>
                          {line}
                          {j < lines.length - 1 && <br />}
                        </React.Fragment>
                      ))}
                    </p>
                  );
                })
              ) : founderNote ? (
                <p style={{ margin: 0, fontSize: '13px', color: EmailColors.text.body, lineHeight: '1.5', fontStyle: 'italic' }}>
                  {founderNote}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: '#6B7280', lineHeight: '1.5' }}>
                  This is a sample of what <strong style={{ color: EmailColors.text.body }}>tldrSEC</strong> delivers to your inbox within minutes of every SEC filing.
                </p>
              )}
            </td>
          </tr>
          {/* CTA - natural next step after seeing the product + founder story */}
          <tr>
            <td style={{ padding: '16px 15px 20px', textAlign: 'center' }}>
              <a href={signupUrl} style={{
                display: 'inline-block',
                padding: '14px 32px',
                backgroundColor: EmailColors.semantic.accent,
                color: '#ffffff',
                textDecoration: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
              }}>
                Start Your 7-Day Free Trial
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Shared EmailFooter - same as production emails */}
      <EmailFooter filingUrl="" unsubscribeUrl={unsubscribeUrl} />
    </div>
  );
}

export default CampaignDemoTemplate;
