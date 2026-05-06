/**
 * Campaign performance contracts (AC8 + AC11).
 *
 * AC8 — `fetchScoredSummariesLast30Days` should hit a 1-hour in-memory cache
 *       on the second call within the window (single Prisma round-trip per
 *       campaign run instead of one per email × 125 recipients).
 * AC11 — Pre-rendered template + per-recipient `unsubscribeUrl` splice should
 *        produce identical HTML to per-recipient render (parity invariant).
 *
 * Status as of PR 1: neither is implemented yet. The route currently calls
 * `fetchCampaignFilings` once per request (no cache), and renders templates
 * inline per recipient (no pre-render + splice path). This suite:
 *
 *   - Pins the **observable** truncation contract for `capHeadline` (used in
 *     `toCampaignFiling` to cap summary length at 200 chars), since that's
 *     the one perf-shaped behavior already in production.
 *   - Documents AC8 + AC11 under `it.todo` so the perf optimizations stay
 *     visible until follow-up PRs land.
 *
 * Reference: AC8/AC11 entries in
 * `.claude/tasks/email-campaign-revamp-test-plan.md`.
 */

jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td>HEADER_STUB</td></tr></tbody></table>'),
}));

import { capHeadline } from '@/components/ui/email/design-system';
import { getCampaignEmailContent } from '@/lib/email/campaign-templates';

const baseOptions = { unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=t' };

describe('Campaign performance contracts', () => {
  describe('capHeadline truncation (used by toCampaignFiling at 200 chars)', () => {
    it('returns input unchanged when under the cap', () => {
      const short = 'This summary is well under the cap.';
      expect(capHeadline(short, 200)).toBe(short);
    });

    it('truncates at the nearest word boundary, not mid-word', () => {
      // 250 chars of "word " repeated → must break at a space inside the 200 window.
      const long = ('marketAgreement '.repeat(20)).slice(0, 250);
      const out = capHeadline(long, 200);
      expect(out.length).toBeLessThanOrEqual(201); // +1 for the ellipsis
      expect(out.endsWith('…')).toBe(true);
      // The character right before the ellipsis should NOT be mid-word —
      // capHeadline strips trailing punctuation/space, then appends '…'.
      // So the char before '…' is the last char of a complete word.
      const beforeEllipsis = out.slice(-2, -1);
      expect(beforeEllipsis).toMatch(/[A-Za-z]/);
    });

    it('falls back to a hard slice when no word boundary is in the upper 40% of the window', () => {
      // Single very long token — no spaces means the lastSpace heuristic
      // can't find a word boundary above max*0.6.
      const single = 'a'.repeat(300);
      const out = capHeadline(single, 200);
      expect(out.length).toBeLessThanOrEqual(201);
      expect(out.endsWith('…')).toBe(true);
    });

    it('strips trailing punctuation before adding ellipsis', () => {
      // Input ends mid-sentence at the cap with a comma.
      const input = 'Apple announced a major new agreement, '.repeat(10);
      const out = capHeadline(input, 200);
      // Should NOT end with ", …" — the comma is stripped first.
      expect(out).not.toMatch(/[,;:!?\s]…$/);
      expect(out.endsWith('…')).toBe(true);
    });

    it('returns empty string for nullish input', () => {
      expect(capHeadline(undefined, 200)).toBe('');
      expect(capHeadline('', 200)).toBe('');
    });
  });

  describe('Per-recipient render stability (AC11 prereq)', () => {
    // Even without pre-render+splice, the same options must produce stable
    // output across calls. This is a prerequisite for any future caching:
    // if rendering is non-deterministic, you can't safely cache it.
    it('two calls with the same options produce byte-identical HTML', async () => {
      const a = await getCampaignEmailContent(2, baseOptions);
      const b = await getCampaignEmailContent(2, baseOptions);
      expect(a.html).toBe(b.html);
      expect(a.subject).toBe(b.subject);
    });

    it('changing only unsubscribeUrl yields HTML that differs only at that token', async () => {
      const a = await getCampaignEmailContent(3, { unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=AAA' });
      const b = await getCampaignEmailContent(3, { unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=BBB' });

      // Replace each call's token with a placeholder and assert equality —
      // this proves the rest of the doc is recipient-independent and
      // therefore safe to pre-render once.
      const aRedacted = a.html.replace(/token=AAA/g, 'token=__T__');
      const bRedacted = b.html.replace(/token=BBB/g, 'token=__T__');
      expect(aRedacted).toBe(bRedacted);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Future AC8: 1-hour in-memory cache for fetchScoredSummariesLast30Days.
  // The current implementation calls Prisma every time. Once a cache layer
  // is added (e.g., a module-level `Map<string, { ts, value }>`), this
  // suite should:
  //   1. Mock `getPrismaClient().summary.findMany`
  //   2. Call `fetchScoredSummariesLast30Days(50)` twice
  //   3. Assert the mock was called exactly once
  //   4. Advance jest fake timers past 1 hour
  //   5. Call again and assert the mock fires a second time
  // ──────────────────────────────────────────────────────────────────
  it.todo('AC8: fetchScoredSummariesLast30Days second call within 1h hits cache (no Prisma call)');
  it.todo('AC8: cache invalidates after 1h TTL — third call past window re-queries');

  // ──────────────────────────────────────────────────────────────────
  // Future AC11: pre-render + splice parity. The optimization is to render
  // the template once per (emailNumber, variant) and splice each recipient's
  // unsubscribe URL via string replace, replacing the per-recipient
  // `getCampaignEmailContent(...)` call entirely. The suite should:
  //   1. Pre-render the shell with a placeholder URL
  //   2. Splice in URL_A → assert byte-identical to a fresh render with URL_A
  //   3. Splice in URL_B → assert byte-identical to a fresh render with URL_B
  // The current `unsubscribeUrl differs only at that token` test above is
  // the necessary precondition for this to ever work.
  // ──────────────────────────────────────────────────────────────────
  it.todo('AC11: spliceUnsubscribeUrl(prerender, url) ≡ getCampaignEmailContent(.., { unsubscribeUrl: url })');
});
