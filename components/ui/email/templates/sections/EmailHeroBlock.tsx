import * as React from 'react';
import {
  EmailColors,
  EmailStyles,
  capHeadline,
  ensureTickerPrefix,
} from '../../design-system';

interface EmailHeroBlockProps {
  ticker: string;
  headline: string;
  whyItMatters?: string;
  headlineMaxChars?: number;
}

/**
 * Hero block for the campaign Email 1 — the locked "Variant C Hybrid" voice
 * from `.claude/tasks/design-shotgun/email-1-hero-2026-04-29/`.
 *
 * Sits directly below `<EmailHeader>` (which provides the logo + filing-type
 * badge + ticker · company strip) and renders:
 *   1. A dry, ticker-prefixed observation headline (Levine-style)
 *   2. An optional "why it matters" gloss with a brand-purple left rail
 *      (Hormozi value-equation framing — only the gloss carries the
 *      conversion work)
 *
 * The headline is run through `ensureTickerPrefix` + `capHeadline(90)` so
 * it inherits the same defensive truncation contract as the production
 * filing emails. `whyItMatters` is plain text — escape at the call site
 * if it carries dynamic content.
 *
 * Used only by `lib/email/campaign-templates.ts:email1`. Production filing
 * emails use `<EmailLeadHeader>` (which renders a more conventional
 * heading-then-body layout).
 */
export function EmailHeroBlock({
  ticker,
  headline,
  whyItMatters,
  headlineMaxChars = 90,
}: EmailHeroBlockProps) {
  const safeHeadline = capHeadline(ensureTickerPrefix(headline, ticker), headlineMaxChars);

  return (
    <table width="100%" cellPadding="0" cellSpacing="0">
      <tbody>
        {safeHeadline && (
          <tr>
            <td style={{ padding: '4px 15px 8px' }}>
              <h1 style={{
                margin: 0,
                fontSize: '22px',
                fontWeight: 600,
                color: EmailColors.text.headline,
                lineHeight: '1.25',
                letterSpacing: '-0.2px',
              }}>
                {safeHeadline}
              </h1>
            </td>
          </tr>
        )}

        {whyItMatters && (
          <tr>
            <td style={{ padding: '8px 15px 18px' }}>
              <div style={{
                borderLeft: `3px solid ${EmailColors.semantic.accent}`,
                padding: '2px 0 2px 12px',
              }}>
                <p style={EmailStyles.whyItMatters}>
                  {whyItMatters}
                </p>
              </div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default EmailHeroBlock;
