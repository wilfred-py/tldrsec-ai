/**
 * Region classification for the 2026-05 waitlist launch.
 *
 * The launch sends in two regionally-staggered batches — EU at 07:30 UTC Wed
 * and US at 11:00 UTC Wed — because the audience analysis (124 subscribers,
 * Boomer-skew) shows ~65% US-business-hours signup activity and a Boomer
 * audience that reads email first thing in the morning.
 *
 * Classification is deterministic from email domain only (no IP, since the
 * stored subscriber_ip column is broken — every value is a Cloudflare edge IP,
 * see waitlist-route.ts:98). The signal is weaker than real geo-IP but is
 * the strongest reliable input we have on this list.
 *
 * Heuristic: a subscriber is EU if either
 *   (a) their email ends in an EU/UK ccTLD (.co.uk, .de, .fr, etc.), or
 *   (b) their email domain is one of the well-known EU regional ISPs that
 *       carry a Microsoft/Google-style ambiguous TLD (live.co.uk, btinternet,
 *       googlemail, etc.).
 * Everything else — including all gmail.com / yahoo.com / hotmail.com — is US.
 *
 * Why default-to-US for ambiguous gmail: the audience analysis confirms a ~75%
 * US prior, and a 7 AM ET send beats a 9 AM CET send even for the small share
 * of EU users hidden inside gmail.com (older Boomer-segment audiences see
 * early-bird email as proof of diligence, not intrusion).
 *
 * Mis-classification budget: ~4 EU users hidden in gmail (out of ~8 EU
 * total). They'll read at lunchtime in their TZ — acceptable.
 */

export type Region = 'us' | 'eu';

// Two-segment ccTLDs (must check before single-segment TLDs).
const EU_CCTLD_2SEG = new Set([
  'co.uk',
]);

// Single-segment EU/UK TLDs.
const EU_CCTLD_1SEG = new Set([
  'uk', 'de', 'fr', 'it', 'es', 'nl', 'se', 'no', 'fi',
  'dk', 'pl', 'ch', 'at', 'be', 'ie', 'pt', 'cz', 'gr',
]);

// Well-known EU-regional consumer email domains whose TLD doesn't carry the
// signal (e.g., live.co.uk is technically caught by the ccTLD check; this list
// catches everything else, especially googlemail.com which is the UK alias for
// Gmail).
const EU_DOMAINS = new Set([
  'btinternet.com',
  'hotmail.co.uk',
  'yahoo.co.uk',
  'live.co.uk',
  'googlemail.com',
  'live.fr',
  'live.de',
  'web.de',
  'gmx.de',
  'wanadoo.fr',
  'orange.fr',
  'free.fr',
]);

/**
 * Classify a subscriber email as EU or US based on its domain.
 *
 * Defaults to 'us' for any ambiguous or malformed input — the campaign's
 * "default to US" stance is a deliberate consequence of the audience analysis,
 * not a fallback bug.
 */
export function classifyRegion(email: string): Region {
  if (!email || typeof email !== 'string') return 'us';
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return 'us';
  const domain = email.slice(at + 1).toLowerCase();

  if (EU_DOMAINS.has(domain)) return 'eu';

  const parts = domain.split('.');
  if (parts.length >= 2) {
    const last2 = parts.slice(-2).join('.');
    if (EU_CCTLD_2SEG.has(last2)) return 'eu';
  }
  const last1 = parts[parts.length - 1];
  if (EU_CCTLD_1SEG.has(last1)) return 'eu';

  return 'us';
}

/**
 * Cohort slot used as the `cohort_id` column in `campaign_sends` for
 * region-keyed sends. Preserves the table's UNIQUE
 * (campaign_id, cohort_id, email_id, variant) constraint so re-running a
 * region-keyed send is a 23505 → 409.
 */
export function regionCohortSlot(region: Region): string {
  return `region-${region}`;
}
