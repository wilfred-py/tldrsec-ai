/**
 * SubscriberIdentifier component tests (Review Notes 12A).
 *
 * Two responsibilities under test:
 *   1. UUID validation regex — only well-formed UUIDs trigger identify
 *      and persistence. Garbage input fails closed (no PostHog event,
 *      no cookie write, no localStorage write).
 *   2. One-shot identify gate — once a subscriber id has been identified
 *      this session, re-renders with the same id do not re-call
 *      posthog.identify (avoids network noise across SPA navigation).
 *
 * Mounting in app/layout.tsx means the component runs on EVERY page,
 * including pages that have no campaign attribution. Garbage inputs
 * polluting PostHog with phantom persons would erode the funnel signal.
 */

import React from 'react';
import { render, act } from '@testing-library/react';

const identifyMock = jest.fn();
jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    identify: (...args: unknown[]) => identifyMock(...args),
  },
}));

let mockSearchParams: URLSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

import { SubscriberIdentifier } from '@/components/analytics/subscriber-identifier';

const VALID_UUID_LOWER = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_UPPER = '550E8400-E29B-41D4-A716-446655440000';

function setSearchParams(params: Record<string, string>) {
  mockSearchParams = new URLSearchParams(params);
}

beforeEach(() => {
  identifyMock.mockClear();
  setSearchParams({});
  // Clean up persistence side-effects from prior tests
  try { localStorage.clear(); } catch {}
  document.cookie = 'tldrsec_sub_id=; path=/; max-age=0';
});

describe('SubscriberIdentifier — UUID regex (positive cases)', () => {
  it('lowercase UUID v4 → identifies as sub_<uuid>', () => {
    setSearchParams({ sub: VALID_UUID_LOWER });
    act(() => {
      render(<SubscriberIdentifier />);
    });
    expect(identifyMock).toHaveBeenCalledWith(
      `sub_${VALID_UUID_LOWER}`,
      expect.objectContaining({ source: 'campaign' }),
    );
    expect(localStorage.getItem('tldrsec_sub_id')).toBe(VALID_UUID_LOWER);
  });

  it('uppercase UUID → still identifies (case-insensitive regex)', () => {
    setSearchParams({ sub: VALID_UUID_UPPER });
    act(() => {
      render(<SubscriberIdentifier />);
    });
    expect(identifyMock).toHaveBeenCalledWith(
      `sub_${VALID_UUID_UPPER}`,
      expect.any(Object),
    );
  });

  it('lifts utm_* params into person properties', () => {
    setSearchParams({
      sub: VALID_UUID_LOWER,
      utm_campaign: 'launch-2026-05',
      utm_content: 'e1',
      utm_source: 'email',
      utm_medium: 'newsletter',
    });
    act(() => {
      render(<SubscriberIdentifier />);
    });
    expect(identifyMock).toHaveBeenCalledWith(
      `sub_${VALID_UUID_LOWER}`,
      {
        source: 'campaign',
        utm_campaign: 'launch-2026-05',
        utm_content: 'e1',
        utm_source: 'email',
        utm_medium: 'newsletter',
      },
    );
  });

  it('persists subscriberId to cookie + localStorage on first render', () => {
    setSearchParams({ sub: VALID_UUID_LOWER });
    act(() => {
      render(<SubscriberIdentifier />);
    });
    expect(localStorage.getItem('tldrsec_sub_id')).toBe(VALID_UUID_LOWER);
    expect(document.cookie).toContain(`tldrsec_sub_id=${VALID_UUID_LOWER}`);
  });
});

describe('SubscriberIdentifier — UUID regex (negative cases, must fail closed)', () => {
  const invalidInputs: Array<[string, string]> = [
    ['empty string', ''],
    ['plain word', 'not-a-uuid'],
    ['truncated UUID', '550e8400-e29b-41d4-a716'],
    ['extra segment', '550e8400-e29b-41d4-a716-446655440000-extra'],
    ['prototype-pollution', '__proto__'],
    ['SQL-injection-style', "' OR 1=1"],
    ['XSS-style', '<script>alert(1)</script>'],
    ['non-hex character', '550e8400-e29b-41d4-a716-44665544000g'],
    ['wrong segment lengths', '550e8400-e29b-41d4-a71-6446655440000'],
    ['leading whitespace', ' 550e8400-e29b-41d4-a716-446655440000'],
    ['trailing whitespace', '550e8400-e29b-41d4-a716-446655440000 '],
    ['just digits', '12345678901234567890123456789012'],
  ];

  for (const [label, input] of invalidInputs) {
    it(`rejects ${label}: "${input.slice(0, 40)}"`, () => {
      setSearchParams({ sub: input });
      act(() => {
        render(<SubscriberIdentifier />);
      });
      expect(identifyMock).not.toHaveBeenCalled();
      expect(localStorage.getItem('tldrsec_sub_id')).toBeNull();
      expect(document.cookie).not.toContain('tldrsec_sub_id=');
    });
  }

  it('no `sub` param → no identify, no persistence', () => {
    setSearchParams({ utm_campaign: 'organic' });
    act(() => {
      render(<SubscriberIdentifier />);
    });
    expect(identifyMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('tldrsec_sub_id')).toBeNull();
  });
});

describe('SubscriberIdentifier — one-shot identify gate', () => {
  it('does not re-identify on re-render with same sub', () => {
    setSearchParams({ sub: VALID_UUID_LOWER });
    let utils: ReturnType<typeof render>;
    act(() => {
      utils = render(<SubscriberIdentifier />);
    });
    expect(identifyMock).toHaveBeenCalledTimes(1);

    // Re-render with the same sub — should NOT fire identify again.
    act(() => {
      utils!.rerender(<SubscriberIdentifier />);
    });
    expect(identifyMock).toHaveBeenCalledTimes(1);
  });
});
