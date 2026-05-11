'use client';

import { Suspense, useEffect, useState, useCallback, Component, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Loader2, Sparkles, Crown, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  SUBSCRIPTION_PLANS,
  calculateSavingsPercentage,
  type PlanType,
  type BillingInterval,
} from '@/lib/stripe/plans';
import { PricingCard } from '@/components/landing/pricing-card';
import { BillingToggle } from '@/components/billing/billing-toggle';
import type { UserSubscription } from '@/lib/types/subscription';
import { useAnalytics } from '@/lib/hooks/use-analytics';
import { EVENTS, type PlanTier } from '@/lib/analytics/events';

const PLAN_ORDER: PlanType[] = ['PRO', 'MAX'];
const PLAN_RANK: Record<PlanType, number> = { FREE: 0, PRO: 1, MAX: 2 };

const plans = [
  {
    key: 'PRO' as const,
    name: SUBSCRIPTION_PLANS.PRO.name,
    icon: Sparkles,
    monthlyPrice: SUBSCRIPTION_PLANS.PRO.monthlyPrice,
    annualPrice: SUBSCRIPTION_PLANS.PRO.annualPrice,
    description: 'Standard summaries for focused watchlists',
    features: SUBSCRIPTION_PLANS.PRO.features,
    cta: 'Upgrade to Pro',
    href: '/subscribe?plan=pro',
    popular: true,
    disabled: false,
  },
  {
    key: 'MAX' as const,
    name: SUBSCRIPTION_PLANS.MAX.name,
    icon: Crown,
    monthlyPrice: SUBSCRIPTION_PLANS.MAX.monthlyPrice,
    annualPrice: SUBSCRIPTION_PLANS.MAX.annualPrice,
    description: 'Enriched summaries with live web context, for analysts',
    features: SUBSCRIPTION_PLANS.MAX.features,
    cta: 'Upgrade to Max',
    href: '/subscribe?plan=max',
    popular: false,
    disabled: false,
  },
];

function SubscribePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const { trackEvent } = useAnalytics();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [checkingOut, setCheckingOut] = useState<PlanType | null>(null);
  const [downgradingTo, setDowngradingTo] = useState<PlanType | null>(null);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState<PlanType | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Read pre-selected plan from query param (e.g., /subscribe?plan=pro from campaign flow)
  const preSelectedPlan = (searchParams.get('plan')?.toUpperCase() as PlanType) || null;

  const [selectedCard, setSelectedCard] = useState<string>(
    () => preSelectedPlan && PLAN_ORDER.includes(preSelectedPlan) ? preSelectedPlan : 'PRO'
  );

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

  // Auto-trigger checkout when arriving with a pre-selected plan (campaign flow)
  const [autoCheckoutTriggered, setAutoCheckoutTriggered] = useState(false);
  useEffect(() => {
    if (!loading && !autoCheckoutTriggered && preSelectedPlan && PLAN_ORDER.includes(preSelectedPlan)) {
      const effectivePlan = getEffectivePlan();
      // Only auto-trigger if user is on FREE and the pre-selected plan is an upgrade
      if (effectivePlan === 'FREE' && PLAN_RANK[preSelectedPlan] > 0) {
        setAutoCheckoutTriggered(true);
        handleCheckout(preSelectedPlan);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, preSelectedPlan, autoCheckoutTriggered]);

  // Fetch user's current subscription
  useEffect(() => {
    let cancelled = false;

    async function fetchSubscription() {
      try {
        const response = await fetch('/api/user?type=subscription');
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

  // Prefetch dashboard so back navigation is instant
  useEffect(() => {
    router.prefetch('/dashboard');
    router.prefetch('/dashboard/billing');
  }, [router]);

  // Handle ESC key to go back
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      router.push('/dashboard');
    }
  }, [router]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle upgrade via PUT (modifies existing Stripe subscription)
  const handleUpgrade = async (planType: PlanType) => {
    setCheckingOut(planType);
    try {
      const response = await fetch('/api/user?type=subscription', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          billingInterval,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        toast.error(data.error || 'Failed to upgrade');
        return;
      }

      toast.success(`Upgraded to ${SUBSCRIPTION_PLANS[planType].name}`, {
        description: 'Your plan has been upgraded. Prorated charges have been applied.',
      });

      // Refresh subscription data
      const subResponse = await fetch('/api/user?type=subscription');
      if (subResponse.ok) {
        setSubscription(await subResponse.json());
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setCheckingOut(null);
    }
  };

  // Handle checkout (new subscription via Stripe checkout)
  const handleCheckout = async (planType: PlanType | string) => {
    const pt = planType as PlanType;
    if (pt === 'FREE' || isCurrentPlan(pt)) return;

    // If user has an active paid plan and target is higher tier, use PUT upgrade
    const effectivePlan = getEffectivePlan();
    if (subscription?.isActive && PLAN_RANK[effectivePlan] > 0 && PLAN_RANK[pt] > PLAN_RANK[effectivePlan]) {
      return handleUpgrade(pt);
    }

    setCheckingOut(pt);
    try {
      const response = await fetch('/api/user?type=subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: pt,
          billingInterval,
          cancelUrl: '/subscribe?canceled=true', // Custom cancel URL to return to this page
        }),
      });

      const data = (await response.json()) as { error?: string; action?: string; checkoutUrl?: string };

      if (!response.ok) {
        // Handle 409 with action: 'use_put' - stale client state, use PUT instead
        if (response.status === 409 && data.action === 'use_put') {
          return handleUpgrade(pt);
        }
        if (response.status === 409) {
          toast.error('You already have an active subscription');
        } else {
          toast.error(data.error || 'Failed to start checkout');
        }
        return;
      }

      if (data.checkoutUrl) {
        // Track checkout intent right before redirecting to Stripe.
        // Server-side `checkout_completed` fires from the Stripe webhook.
        trackEvent(EVENTS.CHECKOUT_INITIATED, {
          plan: pt.toLowerCase() as PlanTier,
          billing_period: billingInterval,
          source: 'subscribe_page',
        });
        window.location.href = data.checkoutUrl;
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setCheckingOut(null);
    }
  };

  const getPrice = (plan: typeof plans[0]) => {
    return billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
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

  const isCurrentPlan = (planKey: PlanType) => {
    if (!subscription) return false;
    // If subscription is inactive, user is effectively on FREE
    const effectivePlan = subscription.isActive ? subscription.planType : 'FREE';
    return effectivePlan === planKey;
  };

  const getEffectivePlan = (): PlanType => {
    if (!subscription || !subscription.isActive) return 'FREE';
    return subscription.planType;
  };

  const getButtonType = (planKey: PlanType): 'current' | 'upgrade' | 'downgrade' => {
    const effectivePlan = getEffectivePlan();
    if (planKey === effectivePlan) return 'current';
    if (PLAN_RANK[planKey] > PLAN_RANK[effectivePlan]) return 'upgrade';
    return 'downgrade';
  };

  const handleDowngrade = async (planType: PlanType) => {
    setDowngradingTo(planType);
    try {
      const body = planType === 'FREE'
        ? { cancelAtPeriodEnd: true }
        : { planType };

      const response = await fetch('/api/user?type=subscription', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to downgrade');
        return;
      }

      toast.success(`Downgrading to ${SUBSCRIPTION_PLANS[planType].name}`, {
        description: planType === 'FREE'
          ? 'Your current plan will remain active until the end of the billing period.'
          : 'Your plan has been changed.',
      });

      // Refresh subscription data
      const subResponse = await fetch('/api/user?type=subscription');
      if (subResponse.ok) {
        setSubscription(await subResponse.json());
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setDowngradingTo(null);
      setShowDowngradeConfirm(null);
    }
  };

  const getCtaText = (plan: typeof plans[0]) => {
    return plan.cta;
  };

  if (loading) {
    return (
      <div className="min-h-screen py-8 px-4 animate-fadeIn" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div className="max-w-5xl mx-auto">
          <Skeleton className="h-9 w-20 rounded-md mb-8" />
          <div className="text-center mb-8 space-y-4">
            <Skeleton className="h-9 w-64 mx-auto" />
            <Skeleton className="h-4 w-96 mx-auto" />
          </div>
          <div className="flex items-center justify-center gap-3 mb-12">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="brand-card space-y-4 animate-slideUp" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="flex items-center justify-between">
                  <div className="space-y-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-7 w-24" /></div>
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-full rounded-md" />
                <div className="space-y-3 pt-2">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded-full flex-shrink-0" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 animate-fadeIn" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard')}
          className="mb-8 text-[var(--brand-text-muted)] hover:text-[var(--brand-text)]"
          aria-label="Go back to dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="brand-heading mb-4">Choose Your Plan</h1>
          <p className="brand-body max-w-2xl mx-auto">
            Upgrade to get more companies, faster alerts, and priority support.
          </p>
        </div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex items-center justify-center mb-12"
        >
          <BillingToggle
            billingInterval={billingInterval}
            onToggle={() => setBillingInterval(billingInterval === 'monthly' ? 'annual' : 'monthly')}
            disabled={checkingOut !== null}
          />
        </motion.div>

        {/* Plan Cards — uses same PricingCard as landing page */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => {
            const planKey = plan.key as PlanType;
            const buttonType = getButtonType(planKey);

            return (
              <PricingCard
                key={plan.key}
                plan={plan}
                billingInterval={billingInterval}
                isCurrentPlan={isCurrentPlan(planKey)}
                isTrialEndingSoon={false}
                loading={false}
                checkoutLoading={checkingOut === planKey}
                hoveredCard={hoveredCard}
                selectedCard={selectedCard}
                onMouseEnter={() => setHoveredCard(plan.key)}
                onMouseLeave={() => setHoveredCard(null)}
                onSelect={() => setSelectedCard(plan.key)}
                onCheckout={handleCheckout}
                getCtaText={getCtaText}
                getPrice={getPrice}
                getMonthlyEquivalent={getMonthlyEquivalent}
                getSavings={getSavings}
                onDowngrade={buttonType === 'downgrade' ? () => setShowDowngradeConfirm(planKey) : undefined}
                isDowngrading={downgradingTo === planKey}
              />

            );
          })}
        </div>

        {/* ESC hint */}
        <p className="text-center mt-8 text-sm text-[var(--brand-text-muted)]">
          Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">ESC</kbd> to go back
        </p>

        {/* Downgrade Confirmation Dialog */}
        <Dialog
          open={showDowngradeConfirm !== null}
          onOpenChange={(open) => { if (!open) setShowDowngradeConfirm(null); }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Downgrade to {showDowngradeConfirm ? SUBSCRIPTION_PLANS[showDowngradeConfirm].name : ''}?
              </DialogTitle>
              <DialogDescription>
                {showDowngradeConfirm === 'FREE'
                  ? `You'll lose access to ${SUBSCRIPTION_PLANS[getEffectivePlan()].name} features at the end of your billing period. Your current plan will remain active until then.`
                  : showDowngradeConfirm === 'PRO' && getEffectivePlan() === 'MAX'
                    ? `Your plan will be changed to Pro. You'll lose web-context enrichment on summaries, drop from first priority to standard priority, and be limited to 25 tickers.`
                    : `Your plan will be changed to ${showDowngradeConfirm ? SUBSCRIPTION_PLANS[showDowngradeConfirm].name : ''}. You'll lose access to higher-tier features.`
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDowngradeConfirm(null)}
                disabled={downgradingTo !== null}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => showDowngradeConfirm && handleDowngrade(showDowngradeConfirm)}
                disabled={downgradingTo !== null}
              >
                {downgradingTo ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Downgrade'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function SubscribePageLoading() {
  return (
    <div className="min-h-screen py-8 px-4 animate-fadeIn" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="max-w-5xl mx-auto">
        <Skeleton className="h-9 w-20 rounded-md mb-8" />
        <div className="text-center mb-8 space-y-4">
          <Skeleton className="h-9 w-64 mx-auto" />
          <Skeleton className="h-4 w-96 mx-auto" />
        </div>
        <div className="flex items-center justify-center gap-3 mb-12">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="brand-card space-y-4 animate-slideUp" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="flex items-center justify-between">
                <div className="space-y-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-7 w-24" /></div>
                <Skeleton className="h-6 w-6 rounded" />
              </div>
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-full rounded-md" />
              <div className="space-y-3 pt-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full flex-shrink-0" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Error fallback component
function SubscribePageError() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--brand-bg)' }}>
      <div className="text-center space-y-4 max-w-md">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-2xl font-bold">Failed to load subscription plans</h2>
        <p className="text-[var(--brand-text-muted)]">
          We encountered an error loading the subscription page. Please try again.
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
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
