import * as React from 'react';
import { EmailColors, BadgeColors } from '../../design-system';

const MONO_FONT = '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Courier New", monospace';

export interface XSentimentSectionProps {
  direction: 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'no_signal';
  shift?: 'shifting_bullish' | 'shifting_bearish' | 'stable' | 'no_signal';
  confidence: 'high' | 'medium' | 'low';
  discussionSynthesis: string;
  factClaims?: string[];
  citationUrls?: string[];
  windowHours?: number;
}

const DIRECTION_BADGE: Record<XSentimentSectionProps['direction'], { label: string; bg: string; text: string }> = {
  bullish:   { label: 'Bullish',   ...BadgeColors.positive },
  bearish:   { label: 'Bearish',   ...BadgeColors.negative },
  mixed:     { label: 'Mixed',     ...BadgeColors.mixed },
  neutral:   { label: 'Neutral',   ...BadgeColors.neutral },
  no_signal: { label: 'No signal', ...BadgeColors.low },
};

const SHIFT_LABEL: Record<NonNullable<XSentimentSectionProps['shift']>, string> = {
  shifting_bullish: '↑ shifting bullish',
  shifting_bearish: '↓ shifting bearish',
  stable: 'stable',
  no_signal: '',
};

const ALLOWED_CITATION_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);

function isSafeXCitation(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_CITATION_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const VALID_DIRECTIONS = new Set(['bullish', 'bearish', 'mixed', 'neutral', 'no_signal']);
const VALID_CONFIDENCES = new Set(['high', 'medium', 'low']);

/**
 * Whether this sentiment payload is worth rendering. We skip when there's no
 * narrative AND no actionable signal — empty sections add noise. Also acts as
 * a defense-in-depth runtime check on enum fields, since the upstream payload
 * arrives via an unchecked type cast from `summaryData.xSentiment`.
 */
export function shouldRenderXSentiment(xs: Partial<XSentimentSectionProps> | null | undefined): xs is XSentimentSectionProps {
  if (!xs) return false;
  if (!xs.discussionSynthesis || !xs.discussionSynthesis.trim()) return false;
  if (!xs.direction || !VALID_DIRECTIONS.has(xs.direction)) return false;
  if (xs.direction === 'no_signal') return false;
  if (!xs.confidence || !VALID_CONFIDENCES.has(xs.confidence)) return false;
  // F3 demotes confidence→low when citations<2 OR factClaims empty. Don't
  // surface a directional chip backed by zero verified claims.
  if (xs.confidence === 'low' && (!xs.factClaims || xs.factClaims.length === 0)) return false;
  return true;
}

/**
 * X (Twitter) sentiment block — black-bar header + direction/confidence chips +
 * synthesis paragraph + fact claims + citation links. All claims/URLs come from
 * the F3-validated payload (imperatives/non-x.com URLs already stripped).
 */
export function XSentimentSection({
  direction,
  shift,
  confidence,
  discussionSynthesis,
  factClaims,
  citationUrls,
  windowHours,
}: XSentimentSectionProps) {
  const dirBadge = DIRECTION_BADGE[direction];
  const shiftText = shift ? SHIFT_LABEL[shift] : '';
  const window = windowHours ? `Last ${windowHours}h` : '';
  const claims = (factClaims ?? []).filter((c) => typeof c === 'string' && c.trim().length > 0).slice(0, 3);
  // Defense-in-depth: F3 already enforces x.com/twitter.com host allowlist,
  // but re-check here so a bypassed/cached payload can never inject a
  // javascript: or data: href into a customer email.
  const citations = (citationUrls ?? [])
    .filter((u) => typeof u === 'string' && isSafeXCitation(u))
    .slice(0, 5);

  return (
    <>
      {/* Spacer above black bar */}
      <tr><td style={{ height: '20px', lineHeight: '20px', fontSize: 0 }}>&nbsp;</td></tr>
      {/* Black bar header */}
      <tr>
        <td style={{ backgroundColor: '#000000', padding: '11px 15px' }}>
          <table width="100%" cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase' as const,
                }}>
                  X Sentiment
                </td>
                {window && (
                  <td style={{
                    textAlign: 'right' as const,
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#9CA3AF',
                    letterSpacing: '0.6px',
                    textTransform: 'uppercase' as const,
                    fontFamily: MONO_FONT,
                  }}>
                    {window}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </td>
      </tr>

      {/* Direction + confidence + shift chips */}
      <tr>
        <td style={{ padding: '12px 15px 0' }}>
          <span style={{
            display: 'inline-block' as const,
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: dirBadge.bg,
            color: dirBadge.text,
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase' as const,
            marginRight: '6px',
          }}>
            {dirBadge.label}
          </span>
          <span style={{
            display: 'inline-block' as const,
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: BadgeColors.neutral.bg,
            color: BadgeColors.neutral.text,
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.5px',
            textTransform: 'uppercase' as const,
            marginRight: '6px',
          }}>
            {confidence} conf.
          </span>
          {shiftText && (
            <span style={{
              fontSize: '11px',
              color: EmailColors.text.meta,
              fontFamily: MONO_FONT,
            }}>
              {shiftText}
            </span>
          )}
        </td>
      </tr>

      {/* Discussion synthesis paragraph */}
      <tr>
        <td style={{ padding: '8px 15px 0' }}>
          <p style={{
            fontSize: '14px',
            fontWeight: 400,
            color: EmailColors.text.body,
            lineHeight: '1.55',
            margin: 0,
          }}>
            {discussionSynthesis}
          </p>
        </td>
      </tr>

      {/* Fact claims as bullets */}
      {claims.length > 0 && (
        <tr>
          <td style={{ padding: '10px 15px 0' }}>
            <table width="100%" cellPadding="0" cellSpacing="0">
              <tbody>
                {claims.map((claim, idx) => (
                  <tr key={idx}>
                    <td valign="top" width="16" style={{
                      width: '16px',
                      padding: '4px 0',
                      color: EmailColors.text.meta,
                      fontSize: '13px',
                      lineHeight: '1.5',
                    }}>•</td>
                    <td valign="top" style={{
                      padding: '4px 0 4px 8px',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      color: EmailColors.text.body,
                    }}>
                      {claim}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}

      {/* Citation links — F3 only allows x.com URLs through */}
      {citations.length > 0 && (
        <tr>
          <td style={{ padding: '10px 15px 0' }}>
            <p style={{
              fontSize: '11px',
              color: EmailColors.text.muted,
              fontFamily: MONO_FONT,
              margin: 0,
              lineHeight: '1.6',
              wordBreak: 'break-all' as const,
            }}>
              <span style={{ textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginRight: '6px' }}>
                Sources:
              </span>
              {citations.map((url, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span style={{ color: EmailColors.text.muted }}> · </span>}
                  <a href={url} style={{ color: EmailColors.text.meta, textDecoration: 'underline' }}>
                    {url.replace(/^https?:\/\//, '').slice(0, 48)}
                  </a>
                </React.Fragment>
              ))}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

export default XSentimentSection;
