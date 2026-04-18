import { PostHog } from 'posthog-node';
import type { EventName, EventProps } from './events';

/**
 * Server-side PostHog client for capturing events from API routes, webhooks,
 * and cron jobs. Events captured here are guaranteed to fire even when the
 * user isn't on a page (e.g., Stripe webhooks).
 *
 * Usage:
 *   const posthog = getServerPostHog();
 *   if (posthog) {
 *     posthog.capture({ distinctId, event: EVENTS.CHECKOUT_COMPLETED, properties: {...} });
 *     waitUntil(posthog.shutdown()); // flush before fn terminates
 *   }
 */

let cached: PostHog | null = null;

export function getServerPostHog(): PostHog | null {
  if (cached) return cached;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  cached = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    // Flush immediately in serverless — we rely on waitUntil(shutdown()) for delivery
    flushAt: 1,
    flushInterval: 0,
  });

  return cached;
}

/**
 * Typed server-side capture. Mirrors the client trackEvent signature.
 */
export function captureServerEvent<E extends EventName>(
  distinctId: string,
  event: E,
  properties: EventProps[E],
): void {
  const posthog = getServerPostHog();
  if (!posthog) return;
  posthog.capture({
    distinctId,
    event,
    properties: properties as Record<string, unknown>,
  });
}

/**
 * Shutdown the client. In Vercel serverless, pass this to waitUntil() so
 * events flush before the function terminates without blocking the response.
 */
export async function shutdownServerPostHog(): Promise<void> {
  if (!cached) return;
  await cached.shutdown();
  cached = null;
}
