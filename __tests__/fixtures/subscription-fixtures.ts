import type { SubscriptionData } from '@/lib/validation/subscription-schema';

// ---------------------------------------------------------------------------
// Stripe API response mock factories (Issue 12)
// ---------------------------------------------------------------------------

export function makeStripeCustomer(overrides?: Partial<{ id: string; email: string; deleted: boolean }>): any {
  return {
    id: overrides?.id ?? 'cus_test_mock',
    email: overrides?.email ?? 'test@example.com',
    object: 'customer',
    deleted: false,
    ...overrides,
  };
}

export function makeStripeSubscription(overrides?: Partial<{
  id: string; status: string; customer: string; priceId: string; created: number;
}>): any {
  return {
    id: overrides?.id ?? 'sub_test_mock',
    status: overrides?.status ?? 'active',
    customer: overrides?.customer ?? 'cus_test_mock',
    created: overrides?.created ?? Math.floor(Date.now() / 1000),
    start_date: Math.floor(Date.now() / 1000),
    cancel_at_period_end: false,
    items: {
      data: [{
        price: { id: overrides?.priceId ?? 'price_pro_monthly_test' },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      }],
    },
    ...overrides,
  };
}

export function makeCheckoutSession(overrides?: Partial<{
  id: string; metadata: Record<string, string>; customer: string;
  customer_details: { email: string }; customer_email: string;
  subscription: string; mode: string; url: string;
}>): any {
  return {
    id: overrides?.id ?? 'cs_test_mock',
    mode: overrides?.mode ?? 'subscription',
    metadata: overrides?.metadata ?? { planType: 'PRO', source: 'homepage' },
    customer: overrides?.customer ?? 'cus_test_mock',
    customer_details: overrides?.customer_details ?? { email: 'test@example.com' },
    customer_email: overrides?.customer_email ?? 'test@example.com',
    subscription: overrides?.subscription ?? 'sub_test_mock',
    url: overrides?.url ?? 'https://checkout.stripe.com/test',
    ...overrides,
  };
}

/**
 * Shared subscription test fixtures
 * Covers every subscription state from the verification matrix
 */

// Base subscription data factory
function makeSubscription(overrides: Partial<SubscriptionData>): SubscriptionData {
  return {
    planType: 'FREE',
    isActive: true,
    isTrialing: false,
    daysRemaining: 0,
    trialEndsAt: null,
    isGrandfathered: false,
    currentPeriodStart: '2026-01-01T00:00:00Z',
    currentPeriodEnd: '2026-02-01T00:00:00Z',
    cancelAtPeriodEnd: false,
    stripeCustomerId: 'cus_test123',
    stripeSubscriptionId: 'sub_test123',
    limits: {
      monthlyFilings: 50,
      usedFilings: 10,
      remainingFilings: 40,
    },
    ...overrides,
  };
}

export const subscriptionFixtures = {
  freeTrialActive: makeSubscription({
    planType: 'FREE',
    isTrialing: true,
    daysRemaining: 5,
    trialEndsAt: '2026-02-23T00:00:00Z',
  }),

  freeTrialEndingSoon: makeSubscription({
    planType: 'FREE',
    isTrialing: true,
    daysRemaining: 0,
    trialEndsAt: '2026-02-18T23:59:59Z',
  }),

  freeGrandfathered: makeSubscription({
    planType: 'FREE',
    isGrandfathered: true,
  }),

  proActive: makeSubscription({
    planType: 'PRO',
    stripeSubscriptionId: 'sub_pro_test',
    limits: {
      monthlyFilings: 200,
      usedFilings: 25,
      remainingFilings: 175,
    },
  }),

  maxActive: makeSubscription({
    planType: 'MAX',
    stripeSubscriptionId: 'sub_max_test',
    limits: {
      monthlyFilings: 1000,
      usedFilings: 50,
      remainingFilings: 950,
    },
  }),

  noSubscription: null as SubscriptionData | null,
};

// Mock user for authenticated states
export const mockAuthUser = {
  id: 'user_test_auth',
  fullName: 'Test Investor',
  username: 'testinvestor',
  primaryEmailAddress: {
    emailAddress: 'test@example.com',
    id: 'email_test',
    verification: { status: 'verified' },
  },
  publicMetadata: { onboardingCompleted: true },
};

export const mockAuthUserNotOnboarded = {
  ...mockAuthUser,
  id: 'user_test_not_onboarded',
  publicMetadata: {},
};

/**
 * Auth state presets matching the AuthContext interface
 */
export const authStates = {
  unauthenticated: {
    isSignedIn: false,
    isLoaded: true,
    isOnboarded: false,
    user: null,
  },

  authenticatedNotOnboarded: {
    isSignedIn: true,
    isLoaded: true,
    isOnboarded: false,
    user: mockAuthUserNotOnboarded,
  },

  authenticatedOnboarded: {
    isSignedIn: true,
    isLoaded: true,
    isOnboarded: true,
    user: mockAuthUser,
  },

  loading: {
    isSignedIn: false,
    isLoaded: false,
    isOnboarded: false,
    user: null,
  },
};

/**
 * Subscription context presets matching SubscriptionContextValue
 */
export function makeSubscriptionContext(
  subscription: SubscriptionData | null,
  overrides?: { loading?: boolean; error?: string | null }
) {
  return {
    subscription,
    loading: overrides?.loading ?? false,
    error: overrides?.error ?? null,
    refetch: jest.fn(),
  };
}
