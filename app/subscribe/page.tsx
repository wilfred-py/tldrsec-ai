'use client';

import { Suspense, useEffect, useState, useCallback, Component, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Check, Loader2, Zap, Sparkles, Crown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SUBSCRIPTION_PLANS,
  calculateSavingsPercentage,
  type PlanType,
  type BillingInterval,
} from '@/lib/stripe/plans';
import { AnimatedPrice, StaticPrice } from '@/components/landing/sections-v2/animated-price';

interface UserSubscription {
  planType: PlanType;
  isActive: boolean;
}

const PLAN_ICONS = {
  FREE: Zap,
  PRO: Sparkles,
  MAX: Crown,
} as const;

const PLAN_ORDER: PlanType[] = ['FREE', 'PRO', 'MAX'];

function SubscribePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [checkingOut, setCheckingOut] = useState<PlanType | null>(null);

  // Handle checkout cancellation - show toast
  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      toast.info('Checkout canceled', {
        description: 'You can try again when you\'re ready.',
      });
      // Clean up the URL
      router.replace('/subscribe');
    }
  }, [searchParams, router]);

  // Fetch user's current subscription
  useEffect(() => {
    let cancelled = false;

    async function fetchSubscription() {
      try {
        const response = await fetch('/api/user/subscription');
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) {
            setSubscription(data);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch subscription:', error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (isLoaded && user) {
      fetchSubscription();
    } else if (isLoaded && !user) {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user]);

  // Handle ESC key to go back
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      router.back();
    }
  }, [router]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle checkout
  const handleCheckout = async (planType: PlanType) => {
    if (planType === 'FREE' || planType === subscription?.planType) return;

    setCheckingOut(planType);
    try {
      const response = await fetch('/api/user/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          billingInterval,
          cancelUrl: '/subscribe?canceled=true', // Custom cancel URL to return to this page
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          toast.error('You already have an active subscription');
        } else {
          toast.error(data.error || 'Failed to start checkout');
        }
        return;
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setCheckingOut(null);
    }
  };

  const getPrice = (planKey: PlanType) => {
    const plan = SUBSCRIPTION_PLANS[planKey];
    return billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
  };

  const getMonthlyEquivalent = (planKey: PlanType) => {
    const plan = SUBSCRIPTION_PLANS[planKey];
    if (billingInterval === 'annual' && plan.annualPrice > 0) {
      return Math.round(plan.annualPrice / 12);
    }
    return null;
  };

  const isCurrentPlan = (planKey: PlanType) => subscription?.planType === planKey;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="flex gap-4 mt-8">
            <Skeleton className="h-96 w-72" />
            <Skeleton className="h-96 w-72" />
            <Skeleton className="h-96 w-72" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: 'var(--landing-bg)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-8 text-[var(--landing-text-muted)] hover:text-[var(--landing-text)]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="landing-heading mb-4">Choose Your Plan</h1>
          <p className="landing-body max-w-2xl mx-auto">
            Upgrade to get more companies, faster alerts, and priority support.
          </p>
        </div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
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
            <motion.span
              animate={{ x: billingInterval === 'annual' ? 24 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md"
            />
          </button>
        </motion.div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLAN_ORDER.map((planKey, index) => {
            const plan = SUBSCRIPTION_PLANS[planKey];
            const Icon = PLAN_ICONS[planKey];
            const isCurrent = isCurrentPlan(planKey);
            const savings = planKey !== 'FREE' ? calculateSavingsPercentage(planKey) : null;
            const monthlyEquiv = getMonthlyEquivalent(planKey);

            return (
              <motion.div
                key={planKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                whileHover={{ y: -4, boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)' }}
                className={`landing-card relative flex flex-col ${
                  planKey === 'PRO' ? 'ring-2 ring-[var(--landing-primary)] shadow-lg' : ''
                }`}
              >
                {/* Popular Badge */}
                {planKey === 'PRO' && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--landing-primary)] text-white">
                    Popular
                  </Badge>
                )}

                {/* Plan Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-[var(--landing-text-muted)] uppercase tracking-wide mb-1">
                      {planKey === 'FREE' ? 'Basic' : plan.name}
                    </p>
                    <h3 className="text-2xl font-bold" style={{ color: 'var(--landing-secondary)' }}>
                      {plan.name}
                    </h3>
                  </div>
                  <Icon className="h-6 w-6 text-[var(--landing-primary)]" />
                </div>

                {/* Price - Using AnimatedPrice component */}
                <div className="mb-6 h-[88px]">
                  {plan.monthlyPrice === 0 ? (
                    <StaticPrice label="Free" />
                  ) : (
                    <>
                      <AnimatedPrice
                        value={getPrice(planKey)}
                        suffix={billingInterval === 'annual' ? '/year' : '/month'}
                        savings={billingInterval === 'annual' ? savings : null}
                      />
                      {/* Monthly equivalent text */}
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

                {/* CTA Button */}
                <div className="mb-6">
                  {isCurrent ? (
                    <Button
                      disabled
                      className="w-full bg-gray-100 text-gray-500 cursor-not-allowed"
                    >
                      Current Plan
                    </Button>
                  ) : planKey === 'FREE' ? (
                    <Button
                      variant="outline"
                      disabled
                      className="w-full"
                    >
                      Free Tier
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleCheckout(planKey)}
                      disabled={checkingOut === planKey}
                      className={`w-full ${
                        planKey === 'PRO' ? 'landing-button-primary' : 'landing-button-secondary'
                      }`}
                    >
                      {checkingOut === planKey ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        `Upgrade to ${plan.name}`
                      )}
                    </Button>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-grow">
                  {plan.features.map((feature, idx) => {
                    const parts = feature.split(/(\*\*[^*]+\*\*)/);
                    return (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-[var(--landing-success)] flex-shrink-0 mt-0.5" />
                        <span className="text-sm" style={{ color: 'var(--landing-text)' }}>
                          {parts.map((part, i) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
                            }
                            return part;
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* Everything in X footer */}
                {planKey !== 'FREE' && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-[var(--landing-text-muted)]">
                      <span className="text-[var(--landing-primary)]">+</span>
                      <span>Everything in {planKey === 'PRO' ? 'Free' : 'Pro'}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* ESC hint */}
        <p className="text-center mt-8 text-sm text-[var(--landing-text-muted)]">
          Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">ESC</kbd> to go back
        </p>
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function SubscribePageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--landing-bg)' }}>
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="flex gap-4 mt-8">
          <Skeleton className="h-96 w-72" />
          <Skeleton className="h-96 w-72" />
          <Skeleton className="h-96 w-72" />
        </div>
      </div>
    </div>
  );
}

// Error fallback component
function SubscribePageError() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--landing-bg)' }}>
      <div className="text-center space-y-4 max-w-md">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-2xl font-bold">Failed to load subscription plans</h2>
        <p className="text-[var(--landing-text-muted)]">
          We encountered an error loading the subscription page. Please try again.
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="outline" onClick={() => router.back()}>
            Go Back
          </Button>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}

// Error boundary component
class SubscribeErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('Subscribe page error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <SubscribePageError />;
    }

    return this.props.children;
  }
}

export default function SubscribePage() {
  return (
    <SubscribeErrorBoundary>
      <Suspense fallback={<SubscribePageLoading />}>
        <SubscribePageContent />
      </Suspense>
    </SubscribeErrorBoundary>
  );
}
