import { after } from 'next/server';
import { headers } from 'next/headers';
import { getServerPostHog, captureServerEvent } from '@/lib/analytics/posthog-server';
import { resolveDistinctId } from '@/lib/analytics/distinct-id';
import { EVENTS } from '@/lib/analytics/events';
import SignUpClient from './signup-client';

// Force dynamic — we capture per-request telemetry and read headers/cookies.
export const dynamic = 'force-dynamic';

type PageProps = {
  // Next.js 15: dynamic params and searchParams arrive as Promises in server components.
  params: Promise<{ 'sign-up'?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function SignUpPage({ params, searchParams }: PageProps) {
  const [resolvedParams, resolvedSearch] = await Promise.all([params, searchParams]);
  const subRouteSegments = resolvedParams['sign-up'];
  // [[...sign-up]] is optional catch-all. Root /sign-up → undefined.
  // /sign-up/verify-email and /sign-up/sso-callback → [segment].
  const isRootArrival = !subRouteSegments || subRouteSegments.length === 0;

  // Fire signup_page_arrived on initial /sign-up hit only. Verify-email and
  // sso-callback sub-routes are continuation flows, not arrivals — counting
  // them would inflate the funnel top.
  if (isRootArrival && getServerPostHog()) {
    const distinctId = await resolveDistinctId();
    const h = await headers();
    captureServerEvent(distinctId, EVENTS.SIGNUP_PAGE_ARRIVED, {
      sub: asString(resolvedSearch.sub),
      utm_source: asString(resolvedSearch.utm_source),
      utm_medium: asString(resolvedSearch.utm_medium),
      utm_campaign: asString(resolvedSearch.utm_campaign),
      utm_content: asString(resolvedSearch.utm_content),
      utm_term: asString(resolvedSearch.utm_term),
      plan: asString(resolvedSearch.plan),
      ref: asString(resolvedSearch.ref),
      referer: h.get('referer') ?? undefined,
      user_agent: h.get('user-agent') ?? undefined,
    });
    // Keep the function alive long enough for posthog-node's HTTP flush to
    // complete after the HTML has been streamed to the client.
    after(async () => {
      const posthog = getServerPostHog();
      if (posthog) await posthog.flush();
    });
  }

  return <SignUpClient />;
}
