import * as React from 'react';
import { EmailColors, BadgeColors } from '../../design-system';
import { splitTextOnMarkers } from '../../../../../lib/ai/parsers/x-sentiment-validator';

const MONO_FONT = '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Courier New", monospace';

/**
 * Render text containing inline `[N]` citation markers as React nodes:
 *   - Plain text segments → string (React handles HTML escaping).
 *   - Marker segments → `<a>` anchor(s) hyperlinked to `citationUrls[N-1]`.
 *
 * G3 IAA legal-posture invariant (per wiki/product/x-sentiment-enrichment.md:111
 * and tasks/sentiment-citations.md Issue 2A): this function NEVER modifies
 * synthesis or claim text content. It only wraps detected `[N]` markers with
 * anchor tags. Text segments are passed through verbatim. Future maintainers:
 * do NOT add regex replacements to the text content here — that would re-open
 * the F3 strip semantics that the IAA review approved this feature under.
 *
 * Security: the `href` always comes from the F3-validated `citationUrls` array
 * (host-allowlisted to x.com / twitter.com). Markdown-link forms like
 * `[1](javascript:...)` cannot reach href because the parser regex matches
 * only `[N]` and `[N, M, ...]` — trailing `(...)` is parsed as plain text.
 * See test T14 in `__tests__/XSentimentSection-citations.test.tsx`.
 */
/**
 * Render a text segment with inline `**bold**` markers honored. Splits on the
 * non-greedy `**(.+?)**` pattern; even-indexed pieces are plain, odd-indexed
 * are wrapped in <strong>. Used by `renderTextWithCitations` so the
 * discussionSynthesis can use Bloomberg-style lead bolding (e.g.
 * "**Bulls** anchor to..."). No other markdown is processed — just bold.
 */
function renderTextWithBold(text: string, keyPrefix: string): React.ReactNode[] {
  if (!text.includes('**')) {
    return [<React.Fragment key={`${keyPrefix}-0`}>{text}</React.Fragment>];
  }
  const parts = text.split(/\*\*(.+?)\*\*/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const piece = parts[i];
    if (i % 2 === 1) {
      out.push(<strong key={`${keyPrefix}-${i}`}>{piece}</strong>);
    } else if (piece) {
      out.push(<React.Fragment key={`${keyPrefix}-${i}`}>{piece}</React.Fragment>);
    }
  }
  return out;
}

function renderTextWithCitations(
  text: string,
  citationUrls: readonly string[],
): React.ReactNode[] {
  const segments = splitTextOnMarkers(text);
  const out: React.ReactNode[] = [];
  for (let segIdx = 0; segIdx < segments.length; segIdx += 1) {
    const seg = segments[segIdx];
    if (seg.type === 'text') {
      // Pass through `**bold**` markdown so the discussionSynthesis can use
      // Bloomberg-style lead bolding ("**Bulls** anchor to...").
      out.push(<React.Fragment key={`t-${segIdx}`}>{renderTextWithBold(seg.value, `t-${segIdx}`)}</React.Fragment>);
      continue;
    }
    // Resolve each index to a URL; drop indices with no URL at the position.
    const resolved = seg.indices
      .map((idx) => ({ idx, url: idx >= 1 ? citationUrls[idx - 1] : undefined }))
      .filter((r) => typeof r.url === 'string' && r.url.length > 0);
    if (resolved.length === 0) continue; // drop marker silently
    out.push(
      <React.Fragment key={`c-${segIdx}`}>
        {'['}
        {resolved.map((r, i) => (
          <React.Fragment key={r.idx}>
            {i > 0 ? ', ' : ''}
            <a
              href={r.url}
              aria-label={`Source ${r.idx}, opens X post`}
              style={{
                fontSize: '11px',
                verticalAlign: 'baseline',
                color: EmailColors.text.meta,
                textDecoration: 'underline',
              }}
            >
              {r.idx}
            </a>
          </React.Fragment>
        ))}
        {']'}
      </React.Fragment>,
    );
  }
  return out;
}

/**
 * Returns true when the text contains a `[N]` citation marker that survives
 * the parser. Used by `shouldRenderXSentiment` to suppress sections whose
 * synthesis references citations that don't exist.
 */
function hasCitationMarker(text: string | undefined | null): boolean {
  if (!text) return false;
  return splitTextOnMarkers(text).some((s) => s.type === 'cite');
}

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
 *
 * Rejection rules (any of these → suppress section):
 *   1. No payload, missing/whitespace synthesis, or invalid direction/confidence enum.
 *   2. direction === 'no_signal' (validator's degraded fallback).
 *   3. factClaims is empty regardless of confidence (Issue 3A — empty bullet
 *      block is visually broken; F3 stripped everything to opinion only).
 *   4. Synthesis contains `[N]` markers but citationUrls is empty (Issue D5
 *      state C — markers with no targets are dead links).
 */
export function shouldRenderXSentiment(xs: Partial<XSentimentSectionProps> | null | undefined): xs is XSentimentSectionProps {
  if (!xs) return false;
  if (!xs.discussionSynthesis || !xs.discussionSynthesis.trim()) return false;
  if (!xs.direction || !VALID_DIRECTIONS.has(xs.direction)) return false;
  if (xs.direction === 'no_signal') return false;
  if (!xs.confidence || !VALID_CONFIDENCES.has(xs.confidence)) return false;
  // Issue 3A: factClaims-empty regardless of confidence — empty bullet block
  // looks like a render bug; if F3 gutted facts, suppress the whole section.
  if (!xs.factClaims || xs.factClaims.length === 0) return false;
  // Issue D5 state C: synthesis has citation markers but there are no citations
  // to point at — every marker would be dropped at render time, so suppress.
  if (hasCitationMarker(xs.discussionSynthesis) && (!xs.citationUrls || xs.citationUrls.length === 0)) {
    return false;
  }
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
  //
  // Cardinality matches `MAX_CITATIONS` (10) in x-sentiment-validator. We
  // intentionally do not slice further: with inline `[N]` markers, capping
  // to fewer than the validator allows would silently drop anchors for
  // markers pointing at indices 6-10 (visible "missing anchor" in synthesis).
  const citations = (citationUrls ?? [])
    .filter((u) => typeof u === 'string' && isSafeXCitation(u));

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

      {/* Discussion synthesis paragraph — inline `[N]` markers anchor-wrapped */}
      <tr>
        <td style={{ padding: '8px 15px 0' }}>
          <p style={{
            fontSize: '14px',
            fontWeight: 400,
            color: EmailColors.text.body,
            lineHeight: '1.55',
            margin: 0,
          }}>
            {renderTextWithCitations(discussionSynthesis, citations)}
          </p>
        </td>
      </tr>

      {/* Fact claims as bullets — inline `[N]` markers anchor-wrapped */}
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
                      {renderTextWithCitations(claim, citations)}
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
                {citations.length === 1 ? 'Source:' : 'Sources:'}
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
