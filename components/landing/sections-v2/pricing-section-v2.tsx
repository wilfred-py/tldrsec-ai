'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Sparkles, Crown } from 'lucide-react';
import { toast } from 'sonner';
import {
  staggerContainer,
  viewportOnce,
} from '@/lib/animations/landing-animations';
import {
  SUBSCRIPTION_PLANS,
  calculateSavingsPercentage,
  type BillingInterval,
} from '@/lib/stripe/plans';
import { useAuth } from '@/contexts/auth-context';
import { useSubscriptionContext } from '@/contexts/subscription-context';
import { PricingCard } from '@/components/landing/pricing-card';
import { BillingToggle } from '@/components/billing/billing-toggle';

/**
 * Pricing plans configuration
 * Sourced from centralized Stripe config in lib/stripe.ts
 */
const plans = [
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
 * Enhanced with personalized experience:
 * - Shows current plan for authenticated users
 * - Trial ending soon badges
 * - Graceful error handling
 * - SWR-cached subscription data
 */
export function PricingSectionV2() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const router = useRouter();

  // Prefetch auth routes on mount for faster navigation
  useEffect(() => {
    router.prefetch('/sign-up');
    router.prefetch('/onboarding');
  }, [router]);

  // Auth context
  const { isSignedIn, isLoaded, isOnboarded } = useAuth();

  // Subscription context (with SWR caching + SSE)
  const { subscription, loading: subscriptionLoading, error } = useSubscriptionContext();

  // Check if this plan is the user's current active plan
  const isCurrentPlan = (planKey: string) => {
    if (!subscription) return false; // API failed or not loaded - graceful degradation
    return subscription.planType === planKey && subscription.isActive;
  };

  // Check if trial is ending soon (last day)
  const isTrialEndingSoon = (planKey: string) => {
    if (!subscription || !subscription.isTrialing) return false;
    return isCurrentPlan(planKey) && subscription.daysRemaining < 1;
  };

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

  // Determine CTA text based on auth state
  const getCtaText = (plan: typeof plans[0]) => {
    if (plan.disabled) return plan.cta;
    if (!isSignedIn) return 'Start Free Trial';
    if (!isOnboarded) return 'Complete Setup';
    return plan.cta; // "Upgrade to Pro" or "Upgrade to Max"
  };

  // Handle checkout/signup flow
  const handleCheckout = async (planKey: string) => {
    setLoadingPlan(planKey);

    try {
      // Unauthenticated: redirect to sign-up with plan params
      if (!isSignedIn) {
        const params = new URLSearchParams({
          plan: planKey.toLowerCase(),
          interval: billingInterval,
        });
        router.push(`/sign-up?${params.toString()}`);
        return;
      }

      // Authenticated but not onboarded: redirect to onboarding
      if (!isOnboarded) {
        const params = new URLSearchParams({
          plan: planKey.toLowerCase(),
          interval: billingInterval,
        });
        router.push(`/onboarding?${params.toString()}`);
        return;
      }

      // Authenticated and onboarded: create Stripe checkout session
      const response = await fetch('/api/user?type=subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: planKey,
          billingInterval,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 409) {
          toast.error('You already have an active subscription', {
            description: 'Visit your billing page to manage or upgrade your plan.',
            action: {
              label: 'Go to Billing',
              onClick: () => router.push('/dashboard/billing'),
            },
          });
        } else {
          toast.error(data.error || 'Failed to create checkout session');
        }
        setLoadingPlan(null);
        return;
      }

      const { checkoutUrl } = await response.json();
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        toast.error('Failed to start checkout. Please try again.');
        setLoadingPlan(null);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('An error occurred. Please try again.');
      setLoadingPlan(null);
    }
  };

  // Combined loading state (Clerk + subscription)
  const showLoading = !isLoaded || (isSignedIn && subscriptionLoading);

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
            Start with a 7-day free trial on any plan. Cancel anytime.
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-col items-center gap-2 mb-12"
        >
          <BillingToggle
            billingInterval={billingInterval}
            onToggle={() => setBillingInterval(billingInterval === 'monthly' ? 'annual' : 'monthly')}
            disabled={loadingPlan !== null}
          />
        </motion.div>

        {/* Pricing Cards Grid */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={viewportOnce}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto"
        >
          {plans.map((plan) => (
            <PricingCard
              key={plan.key}
              plan={plan}
              billingInterval={billingInterval}
              isCurrentPlan={isCurrentPlan(plan.key)}
              isTrialEndingSoon={isTrialEndingSoon(plan.key)}
              loading={showLoading}
              checkoutLoading={loadingPlan === plan.key}
              onCheckout={handleCheckout}
              getCtaText={getCtaText}
              getPrice={getPrice}
              getMonthlyEquivalent={getMonthlyEquivalent}
              getSavings={getSavings}
            />
          ))}
        </motion.div>

        {/* Error banner (graceful degradation) */}
        {error && isSignedIn && (
          <div className="mt-8 max-w-2xl mx-auto p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            ⚠️ Unable to load subscription status. You can still view pricing and upgrade.
          </div>
        )}
      </div>
    </section>
  );
}
