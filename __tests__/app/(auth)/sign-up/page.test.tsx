import React from 'react';
import { render } from '@testing-library/react';
import SignUpClient from '@/app/(auth)/sign-up/[[...sign-up]]/signup-client';

jest.mock('@clerk/nextjs', () => ({
  SignUp: () => <div data-testid="clerk-sign-up">Clerk SignUp Component</div>,
}));

// The Clerk widget instrumentation calls trackEvent; stub the hook so tests
// stay focused on the cookie-attribution behaviour they originally covered.
jest.mock('@/lib/hooks/use-analytics', () => ({
  useAnalytics: () => ({
    trackEvent: jest.fn(),
    trackRaw: jest.fn(),
    trackPageView: jest.fn(),
    identifyUser: jest.fn(),
  }),
}));

const mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

describe('SignUpClient', () => {
  beforeEach(() => {
    // Clear all cookies between tests
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      document.cookie = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    });
    mockSearchParams.delete('plan');
    mockSearchParams.delete('ref');
  });

  it('captures ?plan=pro into a signup_plan cookie', () => {
    mockSearchParams.set('plan', 'pro');

    render(<SignUpClient />);

    expect(document.cookie).toContain('signup_plan=pro');
  });

  it('captures ?ref=campaign into a signup_ref cookie', () => {
    mockSearchParams.set('ref', 'campaign');

    render(<SignUpClient />);

    expect(document.cookie).toContain('signup_ref=campaign');
  });

  it('does not set cookies when plan and ref are absent', () => {
    render(<SignUpClient />);

    expect(document.cookie).not.toContain('signup_plan=');
    expect(document.cookie).not.toContain('signup_ref=');
  });

  it('rejects plan values containing cookie-attribute injection', () => {
    mockSearchParams.set('plan', 'pro;Domain=evil.com');

    render(<SignUpClient />);

    expect(document.cookie).not.toContain('signup_plan=');
    expect(document.cookie).not.toContain('Domain=evil');
  });

  it('rejects oversized ref values', () => {
    mockSearchParams.set('ref', 'a'.repeat(200));

    render(<SignUpClient />);

    expect(document.cookie).not.toContain('signup_ref=');
  });

  it('rejects plan values with non-allowlisted characters', () => {
    mockSearchParams.set('plan', 'PRO_TIER');

    render(<SignUpClient />);

    expect(document.cookie).not.toContain('signup_plan=');
  });
});
