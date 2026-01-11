'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Zap, Sparkles, Crown, Loader2 } from 'lucide-react';
import {
  staggerContainer,
  staggerItem,
  viewportOnce,
} from '@/lib/animations/landing-animations';
import {
  SUBSCRIPTION_PLANS,
  calculateSavingsPercentage,
  type BillingInterval,
} from '@/lib/stripe';
import { AnimatedPrice } from './animated-price';

/**
 * Pricing plans configuration
 * Sourced from centralized Stripe config in lib/stripe.ts
 */
const plans = [
  {
    key: 'FREE' as const,
    name: SUBSCRIPTION_PLANS.FREE.name,
    icon: Zap,
    monthlyPrice: SUBSCRIPTION_PLANS.FREE.monthlyPrice,
    annualPrice: SUBSCRIPTION_PLANS.FREE.annualPrice,
    description: 'Get started with SEC filings',
    features: SUBSCRIPTION_PLANS.FREE.features,
    cta: 'Current Plan',
    href: '/onboarding',
    popular: false,
    disabled: true,
  },
  {
    key: 'PRO' as const,
    name: SUBSCRIPTION_PLANS.PRO.name,
    icon: Sparkles,
    monthlyPrice: SUBSCRIPTION_PLANS.PRO.monthlyPrice,
    annualPrice: SUBSCRIPTION_PLANS.PRO.annualPrice,
    description: 'Everything you need for serious investing',
    features: SUBSCRIPTION_PLANS.PRO.features,
    cta: 'Upgrade to Pro',
    href: '/onboarding?plan=pro',
    popular: true,
    disabled: false,
  },
  {
    key: 'MAX' as const,
    name: SUBSCRIPTION_PLANS.MAX.name,
    icon: Crown,
    monthlyPrice: SUBSCRIPTION_PLANS.MAX.monthlyPrice,
    annualPrice: SUBSCRIPTION_PLANS.MAX.annualPrice,
    description: 'For professional traders & analysts',
    features: SUBSCRIPTION_PLANS.MAX.features,
    cta: 'Upgrade to Max',
    href: '/onboarding?plan=max',
    popular: false,
    disabled: false,
  },
];

/**
 * Pricing Section V2 Component
 *
 * Grok-inspired design with:
 * - Clean toggle with "Save with yearly billing" label
 * - Savings percentage badges on annual pricing
 * - "Popular" badge on Pro plan
 * - Feature lists with checkmarks
 * - Clear CTA hierarchy
 */
export function PricingSectionV2() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const router = useRouter();

  // User authentication state from Clerk
  const { isSignedIn, isLoaded, user } = useUser();
  const isOnboarded = Boolean(user?.publicMetadata?.onboardingCompleted);

  const getPrice = (plan: typeof plans[0]) => {
    if (billingInterval === 'annual') {
      return plan.annualPrice;
    }
    return plan.monthlyPrice;
  };

  const getMonthlyEquivalent = (plan: typeof plans[0]) => {
    if (billingInterval === 'annual' && plan.annualPrice > 0) {
      return Math.round(plan.annualPrice / 12);
    }
    return null;
  };

  const getSavings = (plan: typeof plans[0]) => {
    if (plan.monthlyPrice === 0) return null;
    return calculateSavingsPercentage(plan.key);
  };

  // Handle checkout - routes based on 3 auth states
  const handleCheckout = async (planKey: string) => {
    if (!isSignedIn) {
      // State 1: Unauthenticated → Sign Up with plan params
      router.push(`/sign-up?plan=${planKey.toLowerCase()}${billingInterval === 'annual' ? '&interval=annual' : ''}`);
      return;
    }

    if (!isOnboarded) {
      // State 2: Authenticated but NOT onboarded → Onboarding with plan params
      router.push(`/onboarding?plan=${planKey.toLowerCase()}${billingInterval === 'annual' ? '&interval=annual' : ''}`);
      return;
    }

    // State 3: Authenticated AND onboarded → Stripe checkout
    setLoadingPlan(planKey);
    try {
      const response = await fetch('/api/user/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: planKey,
          billingInterval,
        }),
      });

      const data = await response.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        console.error('No checkout URL returned:', data);
        setLoadingPlan(null);
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      setLoadingPlan(null);
    }
  };

  // Get CTA text based on user state and plan
  const getCtaText = (plan: typeof plans[0]) => {
    if (plan.disabled) return plan.cta;
    if (!isSignedIn) return 'Get Started';
    if (!isOnboarded) return 'Complete Setup';
    return plan.cta; // "Upgrade to Pro" or "Upgrade to Max"
  };

  return (
    <section className="py-24 bg-[var(--landing-bg-subtle)]" id="pricing">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="landing-heading mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="landing-body max-w-2xl mx-auto mb-8">
            Start free, upgrade when you&apos;re ready. No hidden fees.
          </p>
        </motion.div>

        {/* Billing Toggle - Grok Style */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex items-center justify-center gap-3 mb-12"
        >
          <span className="text-sm text-[var(--landing-text-muted)]">
            Save with yearly billing
          </span>
          <button
            onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'annual' : 'monthly')}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
              billingInterval === 'annual'
                ? 'bg-[var(--landing-primary)]'
                : 'bg-gray-300'
            }`}
            aria-label={`Switch to ${billingInterval === 'monthly' ? 'annual' : 'monthly'} billing`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                billingInterval === 'annual' ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </motion.div>

        {/* Pricing Cards */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={viewportOnce}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          {plans.map((plan) => {
            const savings = getSavings(plan);
            const monthlyEquiv = getMonthlyEquivalent(plan);

            return (
              <motion.div
                key={plan.name}
                variants={staggerItem}
                whileHover={{
                  y: -4,
                  boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)',
                }}
                transition={{ duration: 0.2 }}
                className={`landing-card relative flex flex-col ${
                  plan.popular
                    ? 'ring-2 ring-[var(--landing-primary)] shadow-lg'
                    : ''
                }`}
              >
                {/* Plan Header with Popular Badge inline */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-[var(--landing-text-muted)] uppercase tracking-wide mb-1">
                      {plan.key === 'FREE' ? 'Basic' : plan.name}
                    </p>
                    <h3
                      className="text-2xl font-bold"
                      style={{ color: 'var(--landing-secondary)' }}
                    >
                      {plan.name}
                    </h3>
                  </div>
                  {plan.popular && (
                    <Badge className="bg-[var(--landing-primary)] text-white text-xs px-2 py-0.5">
                      Popular
                    </Badge>
                  )}
                </div>

                {/* Price Display - Grok Style with Animation */}
                {/* Fixed height container prevents layout shift */}
                <div className="mb-6 h-[88px]">
                  {plan.monthlyPrice === 0 ? (
                    <div className="h-full" />
                  ) : (
                    <>
                      <AnimatedPrice
                        value={getPrice(plan)}
                        suffix={billingInterval === 'annual' ? '/year' : '/month'}
                        savings={billingInterval === 'annual' ? savings : null}
                      />
                      {/* Fixed height container for monthly equivalent text */}
                      <div className="h-4 mt-1">
                        <AnimatePresence mode="wait">
                          {monthlyEquiv && (
                            <motion.p
                              key="monthly-equiv"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="text-xs text-[var(--landing-text-muted)]"
                            >
                              ${monthlyEquiv}/mo billed annually
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                    </>
                  )}
                </div>

                {/* CTA Button - Positioned after price like Grok */}
                <div className="mb-6">
                  {!isLoaded ? (
                    // Loading state - show skeleton button
                    <Skeleton className="h-10 w-full rounded-lg" />
                  ) : plan.disabled ? (
                    <Button
                      className="w-full bg-gray-100 text-gray-500 border border-gray-200 cursor-default hover:bg-gray-100"
                      disabled
                    >
                      {plan.cta}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleCheckout(plan.key)}
                      disabled={loadingPlan === plan.key}
                      className={`w-full ${
                        plan.popular
                          ? 'landing-button-primary'
                          : 'landing-button-secondary'
                      }`}
                    >
                      {loadingPlan === plan.key ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        getCtaText(plan)
                      )}
                    </Button>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-grow">
                  {plan.features.map((feature, idx) => {
                    // Parse **text** markdown bold syntax
                    const parts = feature.split(/(\*\*[^*]+\*\*)/);
                    return (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-[var(--landing-success)] flex-shrink-0 mt-0.5" />
                        <span className="text-sm" style={{ color: 'var(--landing-text)' }}>
                          {parts.map((part, i) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return (
                                <strong key={i} className="font-semibold">
                                  {part.slice(2, -2)}
                                </strong>
                              );
                            }
                            return part;
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* "Everything in X" footer for higher tiers */}
                {plan.key !== 'FREE' && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-[var(--landing-text-muted)]">
                      <span className="text-[var(--landing-primary)]">+</span>
                      <span>
                        Everything in {plan.key === 'PRO' ? 'Free' : 'Pro'}
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
