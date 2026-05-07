/**
 * Tests for useOnboardingVariant — the A/B bucket-resolution hook.
 *
 * Resolution order: sessionStorage → cookie → PostHog → 500ms fallback.
 * These tests cover each branch and bucket-stability across reloads.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { useOnboardingVariant } from '@/lib/hooks/use-onboarding-variant';

// ---- mocks ----------------------------------------------------------------

const trackEvent = jest.fn();
jest.mock('@/lib/hooks/use-analytics', () => ({
  useAnalytics: () => ({
    trackEvent,
    trackRaw: jest.fn(),
    trackPageView: jest.fn(),
    identifyUser: jest.fn(),
  }),
}));

const getFeatureFlag = jest.fn<string | boolean | undefined, [string]>();
const onFeatureFlags = jest.fn<void, [(flags: string[]) => void]>();
jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    getFeatureFlag: (key: string) => getFeatureFlag(key),
    onFeatureFlags: (cb: (flags: string[]) => void) => onFeatureFlags(cb),
  },
}));

// ---- test harness ---------------------------------------------------------

interface Captured {
  variant: string | null;
  resolved: boolean;
  source: string | null;
}

function Probe({ userId, capture }: { userId: string | null; capture: (c: Captured) => void }) {
  const result = useOnboardingVariant(userId);
  capture({ variant: result.variant, resolved: result.resolved, source: result.source });
  return null;
}

function renderHook(userId: string | null) {
  const captures: Captured[] = [];
  const utils = render(
    <Probe userId={userId} capture={(c) => captures.push(c)} />
  );
  return {
    captures,
    last: () => captures[captures.length - 1],
    rerender: (newUserId: string | null) =>
      utils.rerender(<Probe userId={newUserId} capture={(c) => captures.push(c)} />),
    unmount: utils.unmount,
  };
}

function clearStorages() {
  window.sessionStorage.clear();
  // Clear cookies for the jsdom domain.
  document.cookie.split(';').forEach((c) => {
    const eq = c.indexOf('=');
    const name = (eq > -1 ? c.substring(0, eq) : c).trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  trackEvent.mockReset();
  getFeatureFlag.mockReset();
  onFeatureFlags.mockReset();
  clearStorages();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---- tests ----------------------------------------------------------------

describe('useOnboardingVariant — resolution chain', () => {
  it('resolves from sessionStorage first when present', () => {
    window.sessionStorage.setItem('ob_variant_v1:user-1', 'step4');
    const { last } = renderHook('user-1');
    expect(last()).toEqual({ variant: 'step4', resolved: true, source: 'session' });
    // Must not consult PostHog if session hit.
    expect(getFeatureFlag).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('onboarding_variant_assigned', {
      variant: 'step4',
      source: 'session',
    });
  });

  it('falls back to cookie when sessionStorage is empty', () => {
    document.cookie = 'ob_variant=inline; path=/';
    const { last } = renderHook('user-2');
    expect(last()).toEqual({ variant: 'inline', resolved: true, source: 'cookie' });
    expect(getFeatureFlag).not.toHaveBeenCalled();
  });

  it('reads PostHog when neither session nor cookie is set', () => {
    getFeatureFlag.mockReturnValue('step4');
    const { last } = renderHook('user-3');
    expect(getFeatureFlag).toHaveBeenCalledWith('onboarding-email-notice-variant');
    expect(last()).toEqual({ variant: 'step4', resolved: true, source: 'posthog' });
    expect(trackEvent).toHaveBeenCalledWith('onboarding_variant_assigned', {
      variant: 'step4',
      source: 'posthog',
    });
  });

  it('waits for onFeatureFlags callback when initial getFeatureFlag returns undefined', () => {
    getFeatureFlag.mockReturnValueOnce(undefined);
    let storedCb: ((flags: string[]) => void) | null = null;
    onFeatureFlags.mockImplementation((cb) => {
      storedCb = cb;
    });

    const { last } = renderHook('user-4');
    // Not yet resolved — first read returned undefined.
    expect(last().resolved).toBe(false);

    // Simulate PostHog flushing flags after a delay.
    getFeatureFlag.mockReturnValue('inline');
    act(() => {
      storedCb?.([]);
    });
    expect(last()).toEqual({ variant: 'inline', resolved: true, source: 'posthog' });
  });

  it('falls back to "step4" after 500ms when PostHog never resolves', async () => {
    // FALLBACK_VARIANT was flipped from "inline" to "step4" in v0.0.25.9
    // (the polished 4-step flow is now the default for every new user).
    getFeatureFlag.mockReturnValue(undefined);
    onFeatureFlags.mockImplementation(() => undefined);

    const { last } = renderHook('user-5');
    expect(last().resolved).toBe(false);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(last()).toEqual({ variant: 'step4', resolved: true, source: 'fallback' });
    });
    expect(trackEvent).toHaveBeenCalledWith('onboarding_variant_assigned', {
      variant: 'step4',
      source: 'fallback',
    });
  });

  it('ignores non-variant string returned by PostHog (e.g. "control") and falls back', async () => {
    // PostHog can return arbitrary string values for multivariate flags.
    getFeatureFlag.mockReturnValue('control');
    onFeatureFlags.mockImplementation(() => undefined);

    const { last } = renderHook('user-6');
    expect(last().resolved).toBe(false);

    act(() => jest.advanceTimersByTime(500));
    await waitFor(() => {
      expect(last().source).toBe('fallback');
      expect(last().variant).toBe('step4');
    });
  });

  it('does nothing while userId is null (anonymous pre-auth render)', () => {
    const { last } = renderHook(null);
    expect(last()).toEqual({ variant: null, resolved: false, source: null });
    expect(getFeatureFlag).not.toHaveBeenCalled();
  });
});

describe('useOnboardingVariant — bucket stability', () => {
  it('persists the resolved variant to sessionStorage and cookie', () => {
    getFeatureFlag.mockReturnValue('step4');
    renderHook('user-7');
    expect(window.sessionStorage.getItem('ob_variant_v1:user-7')).toBe('step4');
    expect(document.cookie).toContain('ob_variant=step4');
  });

  it('returns the same variant on a subsequent mount (session hit, no PostHog re-roll)', () => {
    getFeatureFlag.mockReturnValue('step4');

    // First mount — PostHog assigns.
    const first = renderHook('user-8');
    expect(first.last().variant).toBe('step4');
    first.unmount();

    // Reset PostHog so a re-roll would clearly differ.
    getFeatureFlag.mockReset();
    getFeatureFlag.mockReturnValue('inline');

    // Second mount — must come from sessionStorage, NOT PostHog.
    const second = renderHook('user-8');
    expect(second.last()).toEqual({ variant: 'step4', resolved: true, source: 'session' });
    expect(getFeatureFlag).not.toHaveBeenCalled();
  });

  it('only fires onboarding_variant_assigned once per resolution', () => {
    getFeatureFlag.mockReturnValue('step4');
    const { rerender, last } = renderHook('user-9');
    rerender('user-9');
    rerender('user-9');
    expect(last().variant).toBe('step4');
    const calls = trackEvent.mock.calls.filter(
      ([name]) => name === 'onboarding_variant_assigned'
    );
    expect(calls).toHaveLength(1);
  });
});
