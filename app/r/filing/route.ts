/**
 * Email CTA click-redirect (W4.1).
 *
 * Captures a PostHog `email_cta_clicked` event server-side with the UTM variant
 * (ai / fallback / note / neutral), then 302s to the SEC filing URL. PostHog
 * can't see sec.gov pageviews, so we interpose this redirect on our own domain.
 *
 * Query params:
 *   url — destination SEC URL (hostname must end in sec.gov)
 *   v   — variant ('ai' | 'fallback' | 'note' | 'neutral')
 *   f   — optional filing_id / accession number (cohort analysis)
 *   ft  — optional form_type (per-form-type funnels)
 *
 * Open-redirect defense: destination must be sec.gov or a subdomain. Unknown
 * hosts fall back to the EDGAR search page.
 */
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  captureServerEvent,
  getServerPostHog,
} from '../../../lib/analytics/posthog-server';
import { EVENTS } from '../../../lib/analytics/events';

const EDGAR_SEARCH_FALLBACK = 'https://www.sec.gov/edgar/searchedgar/companysearch.html';
const WHY_IT_MATTERS_CAMPAIGN = 'why_it_matters';
const VALID_VARIANTS = new Set(['ai', 'fallback', 'note', 'neutral']);

type Variant = 'ai' | 'fallback' | 'note' | 'neutral';

function isSecUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    return parsed.hostname === 'sec.gov' || parsed.hostname.endsWith('.sec.gov');
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get('url');
  const variantParam = searchParams.get('v');
  const filingId = searchParams.get('f') ?? undefined;
  const formType = searchParams.get('ft') ?? undefined;

  const destination = urlParam && isSecUrl(urlParam) ? urlParam : EDGAR_SEARCH_FALLBACK;
  const variant: Variant | null = variantParam && VALID_VARIANTS.has(variantParam)
    ? (variantParam as Variant)
    : null;

  // Capture the click event. Use filing_id as distinctId for cohort attribution
  // when present; otherwise a fresh anon id so the click is still recorded.
  if (variant && getServerPostHog()) {
    const distinctId = filingId ?? `anon-email-${randomUUID()}`;
    captureServerEvent(distinctId, EVENTS.EMAIL_CTA_CLICKED, {
      variant,
      destination,
      filing_id: filingId,
      form_type: formType,
      campaign: WHY_IT_MATTERS_CAMPAIGN,
    });
    // Do NOT call shutdown() here — it nulls the shared PostHog singleton and
    // can race concurrent requests (enrichment-flag evals, other clicks). The
    // posthog-node client flushes on its internal interval; the 302 returns
    // immediately regardless.
  }

  return NextResponse.redirect(destination, 302);
}
