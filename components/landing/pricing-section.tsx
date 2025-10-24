'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useAuthContext } from '@/lib/context/auth-context';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type BillingPeriod = 'MONTHLY' | 'YEARLY';
type PlanType = 'BASIC' | 'PROFESSIONAL' | 'PREMIUM';

interface PricingPlan {
  name: string;
  planType: PlanType;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  cta: string;
  ctaAuth: string;
  highlighted: boolean;
}

const pricingPlans: PricingPlan[] = [
  {
    name: "Basic",
    planType: "BASIC",
    monthlyPrice: 9,
    yearlyPrice: 90,
    description: "Perfect for individual investors tracking a few companies.",
    features: [
      "Up to 50 filings per month",
      "Email summaries of SEC filings",
      "10-K, 10-Q, 8-K, and Form 4 coverage",
      "Balanced token optimization (85% reduction)",
      "Standard processing speed"
    ],
    cta: "Get Started",
    ctaAuth: "Subscribe",
    highlighted: false
  },
  {
    name: "Professional",
    planType: "PROFESSIONAL",
    monthlyPrice: 29,
    yearlyPrice: 290,
    description: "Ideal for active investors who need comprehensive insights.",
    features: [
      "Up to 200 filings per month",
      "Priority email delivery",
      "All SEC filing types covered",
      "Conservative token optimization (67% reduction)",
      "Priority processing speed",
      "Advanced summary format"
    ],
    cta: "Get Started",
    ctaAuth: "Subscribe",
    highlighted: true
  },
  {
    name: "Premium",
    planType: "PREMIUM",
    monthlyPrice: 99,
    yearlyPrice: 990,
    description: "For professional investors and institutions.",
    features: [
      "Up to 1000 filings per month",
      "Instant email delivery",
      "All SEC filing types with full detail",
      "Minimal token optimization (55% reduction)",
      "Highest priority processing",
      "Full-detail summary format",
      "API access (coming soon)"
    ],
    cta: "Get Started",
    ctaAuth: "Subscribe",
    highlighted: false
  }
];

export function PricingSection() {
  const { isAuthenticated, isLoading } = useAuthContext();
  const router = useRouter();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('MONTHLY');
  const [loadingPlan, setLoadingPlan] = useState<PlanType | null>(null);

  const handleSubscribe = async (plan: PricingPlan) => {
    if (!isAuthenticated) {
      // Redirect to sign up with plan parameter
      router.push(`/sign-up?plan=${plan.planType}&billing=${billingPeriod}`);
      return;
    }

    try {
      setLoadingPlan(plan.planType);

      // Create checkout session
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: plan.planType,
          billingPeriod,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error(error.message || 'Failed to start checkout. Please try again.');
      setLoadingPlan(null);
    }
  };

  const getDisplayPrice = (plan: PricingPlan) => {
    if (billingPeriod === 'YEARLY') {
      const monthlyEquivalent = plan.yearlyPrice / 12;
      return `$${Math.floor(monthlyEquivalent)}`;
    }
    return `$${plan.monthlyPrice}`;
  };

  const getSavings = (plan: PricingPlan) => {
    if (billingPeriod === 'YEARLY') {
      const yearlySavings = (plan.monthlyPrice * 12) - plan.yearlyPrice;
      const percentSavings = Math.round((yearlySavings / (plan.monthlyPrice * 12)) * 100);
      return percentSavings;
    }
    return 0;
  };

  return (
    <section className="py-24 bg-gradient-to-b from-background to-background/90 relative overflow-hidden">
      {/* Background gradient elements */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-violet-500/5 to-transparent -z-10" />

      <div className="container px-4 mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Simple, Transparent Pricing</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Choose the plan that fits your investment needs.
          </p>

          {/* Billing Period Toggle */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setBillingPeriod('MONTHLY')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                billingPeriod === 'MONTHLY'
                  ? 'bg-violet-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('YEARLY')}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                billingPeriod === 'YEARLY'
                  ? 'bg-violet-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Yearly
              <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30">
                Save 17%
              </Badge>
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {pricingPlans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.2 }}
              className={`p-8 rounded-2xl ${plan.highlighted ? 'bg-gradient-to-b from-violet-500/10 to-indigo-500/10 border-violet-500/20' : 'bg-card border-border'} border hover:shadow-lg transition-all duration-300 ease-in-out relative flex flex-col h-full`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              )}
              
              <div>
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="mb-2">
                  <span className="text-4xl font-bold">{getDisplayPrice(plan)}</span>
                  <span className="text-muted-foreground"> /month</span>
                </div>
                {billingPeriod === 'YEARLY' && (
                  <div className="mb-4">
                    <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400">
                      Save {getSavings(plan)}% • ${plan.yearlyPrice}/year
                    </Badge>
                  </div>
                )}
                {billingPeriod === 'MONTHLY' && <div className="mb-4 h-6"></div>}
                <p className="text-muted-foreground mb-6">{plan.description}</p>
              </div>

              <div className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              {!isLoading && (
                <Button
                  onClick={() => handleSubscribe(plan)}
                  disabled={loadingPlan === plan.planType}
                  className={`w-full mt-auto ${plan.highlighted ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white' : ''}`}
                  variant={plan.highlighted ? "default" : "outline"}
                  size="lg"
                >
                  {loadingPlan === plan.planType
                    ? 'Loading...'
                    : isAuthenticated
                      ? plan.ctaAuth
                      : plan.cta
                  }
                </Button>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
} 