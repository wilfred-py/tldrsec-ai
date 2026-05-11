'use client';

/**
 * SubscriberIdentifier — landing-page subscriber attribution.
 *
 * Mounted globally in app/layout.tsx under <PostHogProvider>. On any page
 * load with `?sub=<uuid>` in the URL, identifies the visitor in PostHog
 * as `sub_<uuid>` and persists the id to BOTH localStorage and a cookie
 * so the eventual signup flow can stitch the subscriber timeline to the
 * authenticated user (see lib/hooks/use-analytics.ts identifyUser).
 *
 * Two timing concerns drive the structure:
 *
 *   1. OAuth race: a user can click "Sign up with Google" before this
 *      component's useEffect fires. The synchronous block at the top of
 *      the component writes the cookie + localStorage during render — by
 *      the time the OAuth click handler runs, attribution is already
 *      persisted. The PostHog identify call can safely defer to the
 *      effect (it's not load-bearing for attribution; the cookie is).
 *
 *   2. Re-render storm: searchParams changes on every client-side nav,
 *      including hash-only changes and UTM-only updates. A useRef gates
 *      the identify call so we don't burn a PostHog round-trip on every
 *      navigation within a session. One identify per `sub` value is
 *      enough — PostHog deduplicates identified persons server-side
 *      anyway, but the client-side gate keeps the network quiet.
 *
 * Validation: strict UUID-v4 shape (8-4-4-4-12 hex with optional case).
 * Anything else is silently ignored. Without this guard, a Slack-shared
 * link with `?sub=injected` could pollute PostHog with phantom persons.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUB_COOKIE_NAME = 'tldrsec_sub_id';
const SUB_LOCALSTORAGE_KEY = 'tldrsec_sub_id';
const COOKIE_MAX_AGE_DAYS = 30;

/**
 * Persist the subscriber id to cookie + localStorage. Called synchronously
 * during render so OAuth redirects don't lose attribution.
 *
 * Cookie is `SameSite=Lax` so it survives the Clerk OAuth round-trip on
 * GET-redirect (OAuth uses GET, not POST). Both same-eTLD+1 (tldrsec.app)
 * and the Clerk-hosted accounts subdomain return to tldrsec.app on completion.
 *
 * localStorage is the primary read target inside identifyUser; cookie is
 * the fallback when localStorage is denied (e.g. Safari ITP private mode).
 */
function persistSubscriberId(sub: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${SUB_COOKIE_NAME}=${sub}; path=/; max-age=${COOKIE_MAX_AGE_DAYS * 24 * 3600}; SameSite=Lax`;
  } catch {}
  try {
    localStorage.setItem(SUB_LOCALSTORAGE_KEY, sub);
  } catch {}
}

export function SubscriberIdentifier() {
  const searchParams = useSearchParams();
  const sub = searchParams?.get('sub') ?? null;
  const lastIdentifiedRef = useRef<string | null>(null);

  // ── Synchronous side: cookie + localStorage written during render ──
  // This must happen BEFORE any OAuth click handler can run. Validation is
  // strict UUID shape — invalid values fail closed (no write).
  if (sub && UUID_REGEX.test(sub)) {
    persistSubscriberId(sub);
  }

  // ── Async side: PostHog identify ────────────────────────────────────
  useEffect(() => {
    if (!sub || !UUID_REGEX.test(sub)) return;
    if (lastIdentifiedRef.current === sub) return;  // one-shot per session per subscriber

    const distinctId = `sub_${sub}`;
    posthog.identify(distinctId, {
      source: 'campaign',
      utm_campaign: searchParams?.get('utm_campaign') ?? undefined,
      utm_content: searchParams?.get('utm_content') ?? undefined,
      utm_source: searchParams?.get('utm_source') ?? undefined,
      utm_medium: searchParams?.get('utm_medium') ?? undefined,
    });
    lastIdentifiedRef.current = sub;
  }, [sub, searchParams]);

  return null;
}
