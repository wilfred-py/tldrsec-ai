"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import { EVENTS } from "@/lib/analytics/events";

export type OnboardingVariant = "step4" | "inline";
export type VariantSource = "posthog" | "session" | "cookie" | "fallback";

const FLAG_KEY = "onboarding-email-notice-variant";
const SESSION_PREFIX = "ob_variant_v1:";
const COOKIE_KEY = "ob_variant";
const FALLBACK_TIMEOUT_MS = 500;
const FALLBACK_VARIANT: OnboardingVariant = "step4";

interface UseOnboardingVariantResult {
  variant: OnboardingVariant | null;
  resolved: boolean;
  source: VariantSource | null;
}

function isVariant(value: string | boolean | null | undefined): value is OnboardingVariant {
  return value === "step4" || value === "inline";
}

function readSession(userId: string): OnboardingVariant | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_PREFIX}${userId}`);
    return isVariant(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeSession(userId: string, variant: OnboardingVariant): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${SESSION_PREFIX}${userId}`, variant);
  } catch {
    // ignore — private mode / quota
  }
}

function readCookie(): OnboardingVariant | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]+)`));
  const raw = match?.[1];
  return isVariant(raw) ? raw : null;
}

function writeCookie(variant: OnboardingVariant): void {
  if (typeof document === "undefined") return;
  // 30-day TTL so a returning user hits the same bucket if session cleared.
  document.cookie = `${COOKIE_KEY}=${variant}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

/**
 * Resolve the onboarding A/B variant. Bucket-stable across reloads.
 *
 * Resolution order (first hit wins):
 *   1. sessionStorage["ob_variant_v1:{userId}"]
 *   2. cookie "ob_variant"
 *   3. PostHog feature flag "onboarding-email-notice-variant"
 *   4. 500ms timeout fallback → Variant B ("inline")
 *
 * Fires `onboarding_variant_assigned` once at resolution with `source`.
 * Returns `resolved=false` during the async wait so callers can render a
 * skeleton (prevents Flash of Wrong Variant).
 */
export function useOnboardingVariant(userId: string | null | undefined): UseOnboardingVariantResult {
  const [variant, setVariant] = useState<OnboardingVariant | null>(null);
  const [source, setSource] = useState<VariantSource | null>(null);
  const { trackEvent } = useAnalytics();
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (resolvedRef.current) return;

    const commit = (v: OnboardingVariant, s: VariantSource) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      writeSession(userId, v);
      writeCookie(v);
      setVariant(v);
      setSource(s);
      trackEvent(EVENTS.ONBOARDING_VARIANT_ASSIGNED, { variant: v, source: s });
    };

    // 1. sessionStorage
    const fromSession = readSession(userId);
    if (fromSession) {
      commit(fromSession, "session");
      return;
    }

    // 2. cookie
    const fromCookie = readCookie();
    if (fromCookie) {
      commit(fromCookie, "cookie");
      return;
    }

    // 3. PostHog — async, with 500ms fallback
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      if (!resolvedRef.current) commit(FALLBACK_VARIANT, "fallback");
    }, FALLBACK_TIMEOUT_MS);

    const tryPostHog = () => {
      if (timedOut || resolvedRef.current) return;
      const flag = posthog.getFeatureFlag(FLAG_KEY);
      if (isVariant(flag)) {
        window.clearTimeout(timer);
        commit(flag, "posthog");
      }
    };

    // If flags are already loaded, read immediately; otherwise wait for the
    // onFeatureFlags callback. Either path falls back to the 500ms timer.
    tryPostHog();
    if (!resolvedRef.current) {
      posthog.onFeatureFlags(() => tryPostHog());
    }

    return () => {
      window.clearTimeout(timer);
    };
  }, [userId, trackEvent]);

  return { variant, resolved: variant !== null, source };
}
