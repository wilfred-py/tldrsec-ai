'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Check, Zap, Sparkles, Crown } from 'lucide-react';
import Link from 'next/link';
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
    description: 'Perfect for getting started',
    features: SUBSCRIPTION_PLANS.FREE.features,
    cta: 'Start Free',
    href: '/onboarding',
    popular: false,
  },
  {
    key: 'PRO' as const,
    name: SUBSCRIPTION_PLANS.PRO.name,
    icon: Sparkles,
    monthlyPrice: SUBSCRIPTION_PLANS.PRO.monthlyPrice,
    annualPrice: SUBSCRIPTION_PLANS.PRO.annualPrice,
    description: 'For serious investors',
    features: SUBSCRIPTION_PLANS.PRO.features,
    cta: 'Start Free Trial',
    href: '/onboarding?plan=pro',
    popular: true,
  },
  {
    key: 'MAX' as const,
    name: SUBSCRIPTION_PLANS.MAX.name,
    icon: Crown,
    monthlyPrice: SUBSCRIPTION_PLANS.MAX.monthlyPrice,
    annualPrice: SUBSCRIPTION_PLANS.MAX.annualPrice,
    description: 'For power users',
    features: SUBSCRIPTION_PLANS.MAX.features,
    cta: 'Start Free Trial',
    href: '/onboarding?plan=max',
    popular: false,
  },
];

/**
 * Pricing Section V2 Component
 *
 * Clean white cards with:
 * - Monthly/annual toggle with savings badge
 * - "Most Popular" badge on Pro plan
 * - Feature lists with checkmarks
 * - Clear CTA hierarchy
 */
export function PricingSectionV2() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');

  const getPrice = (plan: typeof plans[0]) => {
    if (billingInterval === 'annual') {
      return Math.round(plan.annualPrice / 12);
    }
    return plan.monthlyPrice;
  };

  const getSavings = (plan: typeof plans[0]) => {
    if (plan.monthlyPrice === 0) return null;
    return calculateSavingsPercentage(plan.key);
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

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span
              className={`text-sm font-medium ${
                billingInterval === 'monthly'
                  ? 'text-[var(--landing-secondary)]'
                  : 'text-[var(--landing-text-muted)]'
              }`}
            >
              Monthly
            </span>
            <Switch
              checked={billingInterval === 'annual'}
              onCheckedChange={(checked) =>
                setBillingInterval(checked ? 'annual' : 'monthly')
              }
            />
            <span
              className={`text-sm font-medium ${
                billingInterval === 'annual'
                  ? 'text-[var(--landing-secondary)]'
                  : 'text-[var(--landing-text-muted)]'
              }`}
            >
              Annual
            </span>
            {billingInterval === 'annual' && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                2 months free
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={viewportOnce}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto"
        >
          {plans.map((plan) => (
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
              {/* Popular Badge - positioned above and outside the card */}
              {plan.popular && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2">
                  <Badge className="landing-badge whitespace-nowrap">
                    Most Popular
                  </Badge>
                </div>
              )}

              {/* Plan Header */}
              <div className="text-center mb-6 pt-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'var(--landing-primary-light)' }}
                >
                  <plan.icon className="w-6 h-6 text-[var(--landing-primary)]" />
                </div>
                <h3
                  className="text-xl font-bold mb-1"
                  style={{ color: 'var(--landing-secondary)' }}
                >
                  {plan.name}
                </h3>
                <p className="landing-caption">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="text-center mb-6">
                <span
                  className="text-4xl font-bold"
                  style={{ color: 'var(--landing-secondary)' }}
                >
                  ${getPrice(plan)}
                </span>
                <span className="text-[var(--landing-text-muted)]">/month</span>
                {billingInterval === 'annual' && getSavings(plan) && (
                  <p className="text-sm text-green-600 mt-1">
                    Save {getSavings(plan)}%
                  </p>
                )}
              </div>

              {/* Features - grows to fill available space */}
              <ul className="space-y-3 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-[var(--landing-success)] flex-shrink-0" />
                    <span className="text-sm" style={{ color: 'var(--landing-text)' }}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA - always at bottom */}
              <div className="mt-8">
                <Link
                  href={`${plan.href}${billingInterval === 'annual' ? '&interval=annual' : ''}`}
                  className="block"
                >
                  <Button
                    className={`w-full ${
                      plan.popular
                        ? 'landing-button-primary'
                        : 'landing-button-secondary'
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
