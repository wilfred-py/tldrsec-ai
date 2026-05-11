import React from 'react';
import { render } from '@testing-library/react';
import { XSentimentSection, shouldRenderXSentiment } from '../sections/XSentimentSection';
import type { XSentimentSectionProps } from '../sections/XSentimentSection';

/**
 * Phase 3 — XSentimentSection renderer test coverage.
 *
 * Covers Issue 6A (markers in claim text + synthesis), 3A (factClaims-empty
 * guard), 4A (no monitoring inside the component), 5A/16A (wrapper exists),
 * and T09-T20 from the plan's test artifact.
 *
 * Rendering rules under test:
 *   - `[N]` markers in `discussionSynthesis` and `factClaims` become `<a>` to
 *     `citationUrls[N-1]`.
 *   - Markers pointing past `citationUrls` are dropped silently.
 *   - Anchors are baseline (font-size 11px, vertical-align baseline) — not `<sup>`.
 *   - Anchors carry an `aria-label` describing the source.
 *   - One citation → "Source:" singular footer label.
 *   - Trailing markdown-link form `(javascript:...)` is rendered as plain text;
 *     href ALWAYS comes from validated `citationUrls`.
 */

const SAFE_URL = 'https://x.com/Bloomberg/status/1234';
const SAFE_URL_2 = 'https://x.com/CNBC/status/5678';
const SAFE_URL_3 = 'https://x.com/Reuters/status/9012';

const baseProps: XSentimentSectionProps = {
  direction: 'bullish',
  shift: 'stable',
  confidence: 'medium',
  discussionSynthesis: 'Sentiment skewed positive overall.',
  factClaims: ['Apple beat earnings'],
  citationUrls: [SAFE_URL],
  windowHours: 24,
};

describe('XSentimentSection — inline marker rendering', () => {
  // ─── T09-T13: synthesis marker → anchor wrap ──────────────────────────────

  it('T09: synthesis with [1] renders an anchor to citationUrls[0]', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis="Beat consensus [1]"
            citationUrls={[SAFE_URL]}
          />
        </tbody>
      </table>,
    );
    const anchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute('href', SAFE_URL);
    expect(anchors[0]).toHaveTextContent('1');
  });

  it('T10: synthesis with [1, 2] renders 2 anchors', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis="Beat consensus [1, 2]"
            citationUrls={[SAFE_URL, SAFE_URL_2]}
          />
        </tbody>
      </table>,
    );
    const anchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toHaveAttribute('href', SAFE_URL);
    expect(anchors[1]).toHaveAttribute('href', SAFE_URL_2);
  });

  it('T11: adjacent markers [1][2] render 2 separate anchors', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis="Beat[1][2]"
            citationUrls={[SAFE_URL, SAFE_URL_2]}
          />
        </tbody>
      </table>,
    );
    const anchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(anchors).toHaveLength(2);
  });

  it('T12: mid-word marker foo[1]bar parses correctly', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis="foo[1]bar"
            citationUrls={[SAFE_URL]}
          />
        </tbody>
      </table>,
    );
    const anchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(anchors).toHaveLength(1);
    // The text content surrounding the marker is preserved verbatim.
    expect(container.textContent).toContain('foo');
    expect(container.textContent).toContain('bar');
  });

  it('T13: hallucinated [7] when only 3 sources → marker dropped silently', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis="real[1] hallucinated[7] another[3]"
            citationUrls={[SAFE_URL, SAFE_URL_2, SAFE_URL_3]}
          />
        </tbody>
      </table>,
    );
    const anchors = container.querySelectorAll('a[aria-label^="Source"]');
    // Only 1 and 3 resolve; 7 is silently dropped (no anchor, no literal "[7]" text).
    expect(anchors).toHaveLength(2);
    expect(container.textContent).not.toContain('[7]');
  });

  // ─── T14: XSS surface (security-critical) ─────────────────────────────────

  it('T14: synthesis "foo [1](javascript:alert(1)) bar" — href is x.com only, rest is text', () => {
    const xssPayload = 'foo [1](javascript:alert(1)) bar';
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis={xssPayload}
            citationUrls={[SAFE_URL]}
          />
        </tbody>
      </table>,
    );
    const anchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(anchors).toHaveLength(1);
    // Critical: href is the validated x.com URL, NOT javascript: URI.
    expect(anchors[0]).toHaveAttribute('href', SAFE_URL);
    expect(anchors[0].getAttribute('href')).not.toMatch(/javascript:/i);
    // The trailing markdown-link form is rendered as plain text, not as part
    // of the anchor's href. The text content includes the literal characters.
    expect(container.textContent).toContain('(javascript:alert(1))');
    // No anchor whose href contains "javascript:" anywhere in the DOM.
    const allAnchors = container.querySelectorAll('a');
    for (const a of Array.from(allAnchors)) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
  });

  // ─── T15: legacy payload (no markers anywhere) ─────────────────────────────

  it('T15: legacy payload renders bullets + synthesis as plain text without inline anchors', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis="No markers in this synthesis paragraph."
            factClaims={['No markers in this claim either']}
            citationUrls={[SAFE_URL]}
          />
        </tbody>
      </table>,
    );
    // No inline citation anchors (only the Sources-footer anchor).
    const inlineAnchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(inlineAnchors).toHaveLength(0);
    // Synthesis text is rendered verbatim.
    expect(container.textContent).toContain('No markers in this synthesis paragraph.');
    expect(container.textContent).toContain('No markers in this claim either');
  });

  // ─── T16-T18: anchor styling & a11y ────────────────────────────────────────

  it('T16: every citation anchor has an informative aria-label', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis="Beat consensus [1, 2]"
            citationUrls={[SAFE_URL, SAFE_URL_2]}
          />
        </tbody>
      </table>,
    );
    const anchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toHaveAttribute('aria-label', 'Source 1, opens X post');
    expect(anchors[1]).toHaveAttribute('aria-label', 'Source 2, opens X post');
  });

  it('T17: citation anchors are baseline anchors (NOT <sup>), font-size 11px', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            discussionSynthesis="Beat[1]"
            citationUrls={[SAFE_URL]}
          />
        </tbody>
      </table>,
    );
    const anchor = container.querySelector('a[aria-label^="Source"]') as HTMLAnchorElement;
    expect(anchor).toBeTruthy();
    expect(anchor.tagName.toLowerCase()).toBe('a');
    // Outlook-safe: baseline anchor, not <sup>.
    expect(anchor.style.verticalAlign).toBe('baseline');
    expect(anchor.style.fontSize).toBe('11px');
    // No <sup> wrapping the marker.
    expect(container.querySelector('sup')).toBeNull();
  });

  // ─── T19: Source / Sources singular toggle ─────────────────────────────────

  it('T19: 1 surviving citation → footer label is "Source:" singular', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            citationUrls={[SAFE_URL]}
          />
        </tbody>
      </table>,
    );
    expect(container.textContent).toContain('Source:');
    expect(container.textContent).not.toContain('Sources:');
  });

  it('T19b: 2+ surviving citations → footer label is "Sources:" plural', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            citationUrls={[SAFE_URL, SAFE_URL_2]}
          />
        </tbody>
      </table>,
    );
    expect(container.textContent).toContain('Sources:');
  });

  // ─── factClaims bullets carry markers too (Issue 6A) ───────────────────────

  it('factClaim bullets render inline marker anchors', () => {
    const { container } = render(
      <table>
        <tbody>
          <XSentimentSection
            {...baseProps}
            factClaims={['Revenue beat consensus[1] and guidance raised[2]']}
            citationUrls={[SAFE_URL, SAFE_URL_2]}
          />
        </tbody>
      </table>,
    );
    const anchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    expect(anchors[0]).toHaveAttribute('href', SAFE_URL);
    expect(anchors[1]).toHaveAttribute('href', SAFE_URL_2);
  });
});

// ─── shouldRenderXSentiment guard (Issues 3A + D5 state C) ──────────────────

describe('shouldRenderXSentiment — extended guards', () => {
  it('Issue 3A: rejects when factClaims is empty regardless of confidence', () => {
    expect(
      shouldRenderXSentiment({
        ...baseProps,
        confidence: 'medium',
        factClaims: [],
      }),
    ).toBe(false);
    expect(
      shouldRenderXSentiment({
        ...baseProps,
        confidence: 'high',
        factClaims: [],
      }),
    ).toBe(false);
  });

  it('T20 / D5 state C: rejects when synthesis has [N] markers but citationUrls is empty', () => {
    expect(
      shouldRenderXSentiment({
        ...baseProps,
        discussionSynthesis: 'Markers without targets [1]',
        factClaims: ['some claim'],
        citationUrls: [],
      }),
    ).toBe(false);
  });

  it('accepts a payload with markers that all have targets', () => {
    expect(
      shouldRenderXSentiment({
        ...baseProps,
        discussionSynthesis: 'real anchor [1]',
        factClaims: ['claim'],
        citationUrls: [SAFE_URL],
      }),
    ).toBe(true);
  });

  it('accepts a payload with no markers at all (legacy compat)', () => {
    expect(
      shouldRenderXSentiment({
        ...baseProps,
        discussionSynthesis: 'No markers here.',
        factClaims: ['some claim'],
        citationUrls: [],
      }),
    ).toBe(true);
  });
});
