'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Check, Sparkles, Crown, Zap } from 'lucide-react';
import { SUBSCRIPTION_PLANS, calculateSavingsPercentage } from '@/lib/stripe/plans';
import Link from 'next/link';

type BillingInterval = 'monthly' | 'annual';
type PlanKey = 'FREE' | 'PRO' | 'MAX';

interface PricingCardProps {
  planKey: PlanKey;
  plan: (typeof SUBSCRIPTION_PLANS)[PlanKey];
  billingInterval: BillingInterval;
  isPopular?: boolean;
}

const planIcons: Record<PlanKey, React.ReactNode> = {
  FREE: <Zap className="w-5 h-5" />,
  PRO: <Sparkles className="w-5 h-5" />,
  MAX: <Crown className="w-5 h-5" />,
};

const planGradients: Record<PlanKey, string> = {
  FREE: 'from-slate-50 to-slate-100',
  PRO: 'from-blue-50 to-indigo-100',
  MAX: 'from-amber-50 to-orange-100',
};

const planBorders: Record<PlanKey, string> = {
  FREE: 'border-slate-200',
  PRO: 'border-blue-300 ring-2 ring-blue-100',
  MAX: 'border-amber-300',
};

function PricingCard({
  planKey,
  plan,
  billingInterval,
  isPopular,
}: PricingCardProps) {
  const monthlyPrice = plan.monthlyPrice;
  const annualPrice = plan.annualPrice;
  const displayPrice =
    billingInterval === 'annual' ? Math.round(annualPrice / 12) : monthlyPrice;
  const savings =
    billingInterval === 'annual' ? calculateSavingsPercentage(planKey) : 0;

  const ctaText =
    planKey === 'FREE'
      ? 'Start Trial'
      : planKey === 'PRO'
        ? 'Start Pro Trial'
        : 'Start Max';

  const ctaHref =
    planKey === 'FREE'
      ? '/sign-up'
      : `/sign-up?plan=${planKey.toLowerCase()}&interval=${billingInterval}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="relative"
    >
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium px-4 py-1.5 rounded-full shadow-lg">
            Most Popular
          </span>
        </div>
      )}

      <div
        className={`bg-gradient-to-b ${planGradients[planKey]} rounded-2xl border-2 ${planBorders[planKey]} p-8 h-full flex flex-col transition-all duration-300 hover:shadow-xl`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              planKey === 'FREE'
                ? 'bg-slate-200 text-slate-600'
                : planKey === 'PRO'
                  ? 'bg-blue-200 text-blue-700'
                  : 'bg-amber-200 text-amber-700'
            }`}
          >
            {planIcons[planKey]}
          </div>
          <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
        </div>

        {/* Price */}
        <div className="mb-6">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-slate-900">
              ${displayPrice}
            </span>
            <span className="text-slate-500">/month</span>
          </div>
          {billingInterval === 'annual' && planKey !== 'FREE' && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-slate-500">
                Billed annually (${annualPrice}/year)
              </span>
              {savings > 0 && (
                <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                  Save {savings}%
                </span>
              )}
            </div>
          )}
          {billingInterval === 'monthly' && planKey !== 'FREE' && (
            <p className="text-sm text-slate-500 mt-1">Billed monthly</p>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-3 mb-8 flex-grow">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check
                className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  planKey === 'FREE'
                    ? 'text-slate-500'
                    : planKey === 'PRO'
                      ? 'text-blue-600'
                      : 'text-amber-600'
                }`}
              />
              <span className="text-slate-700">{feature}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Link href={ctaHref} className="mt-auto">
          <Button
            className={`w-full h-12 text-base font-semibold ${
              planKey === 'PRO'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25'
                : planKey === 'MAX'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25'
                  : ''
            }`}
            variant={planKey === 'FREE' ? 'outline' : 'default'}
            size="lg"
          >
            {ctaText}
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}

export function NewPricingSection() {
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>('monthly');

  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Start with a trial, upgrade when you need more. No hidden fees, cancel
            anytime.
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center justify-center gap-4 mb-12"
        >
          <span
            className={`text-sm font-medium transition-colors ${
              billingInterval === 'monthly'
                ? 'text-slate-900'
                : 'text-slate-500'
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
            className={`text-sm font-medium transition-colors ${
              billingInterval === 'annual' ? 'text-slate-900' : 'text-slate-500'
            }`}
          >
            Annual
            <span className="ml-2 text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
              2 months free
            </span>
          </span>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid gap-8 lg:grid-cols-3 max-w-5xl mx-auto">
          <PricingCard
            planKey="FREE"
            plan={SUBSCRIPTION_PLANS.FREE}
            billingInterval={billingInterval}
          />
          <PricingCard
            planKey="PRO"
            plan={SUBSCRIPTION_PLANS.PRO}
            billingInterval={billingInterval}
            isPopular
          />
          <PricingCard
            planKey="MAX"
            plan={SUBSCRIPTION_PLANS.MAX}
            billingInterval={billingInterval}
          />
        </div>

        {/* FAQ or Trust Signals */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-16 text-center"
        >
          <p className="text-sm text-slate-500">
            All plans include 7-day trial. No credit card required.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
