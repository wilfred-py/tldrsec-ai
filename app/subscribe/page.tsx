'use client';

import { Suspense, useEffect, useState, useCallback, Component, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Check, Loader2, Sparkles, Crown, AlertTriangle, ArrowDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SUBSCRIPTION_PLANS,
  calculateSavingsPercentage,
  type PlanType,
  type BillingInterval,
} from '@/lib/stripe/plans';
import { AnimatedPrice, StaticPrice } from '@/components/landing/sections-v2/animated-price';
import { BillingToggle } from '@/components/billing/billing-toggle';
import type { UserSubscription } from '@/lib/types/subscription';

const PLAN_ICONS: Record<PlanType, typeof Sparkles | null> = {
  FREE: null,
  PRO: Sparkles,
  MAX: Crown,
};

const PLAN_ORDER: PlanType[] = ['PRO', 'MAX'];
const PLAN_RANK: Record<PlanType, number> = { FREE: 0, PRO: 1, MAX: 2 };

function SubscribePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [checkingOut, setCheckingOut] = useState<PlanType | null>(null);
  const [downgradingTo, setDowngradingTo] = useState<PlanType | null>(null);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState<PlanType | null>(null);

  // Read pre-selected plan from query param (e.g., /subscribe?plan=pro from campaign flow)
  const preSelectedPlan = (searchParams.get('plan')?.toUpperCase() as PlanType) || null;

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
  const handleCheckout = async (planType: PlanType) => {
    if (planType === 'FREE' || isCurrentPlan(planType)) return;

    // If user has an active paid plan and target is higher tier, use PUT upgrade
    const effectivePlan = getEffectivePlan();
    if (subscription?.isActive && PLAN_RANK[effectivePlan] > 0 && PLAN_RANK[planType] > PLAN_RANK[effectivePlan]) {
      return handleUpgrade(planType);
    }

    setCheckingOut(planType);
    try {
      const response = await fetch('/api/user?type=subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          billingInterval,
          cancelUrl: '/subscribe?canceled=true', // Custom cancel URL to return to this page
        }),
      });

      const data = (await response.json()) as { error?: string; action?: string; checkoutUrl?: string };

      if (!response.ok) {
        // Handle 409 with action: 'use_put' - stale client state, use PUT instead
        if (response.status === 409 && data.action === 'use_put') {
          return handleUpgrade(planType);
        }
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
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: 'var(--brand-bg)' }}>
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

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PLAN_ORDER.map((planKey, index) => {
            const plan = SUBSCRIPTION_PLANS[planKey];
            const Icon = PLAN_ICONS[planKey];
            const savings = planKey !== 'FREE' ? calculateSavingsPercentage(planKey) : null;
            const monthlyEquiv = getMonthlyEquivalent(planKey);

            return (
              <motion.div
                key={planKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                whileHover={{ y: -4, boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)' }}
                className={`brand-card relative flex flex-col ${
                  planKey === 'PRO' || planKey === preSelectedPlan ? 'ring-2 ring-[var(--brand-primary)] shadow-lg' : ''
                }`}
              >
                {/* Popular Badge */}
                {planKey === 'PRO' && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--brand-primary)] text-white">
                    Popular
                  </Badge>
                )}

                {/* Plan Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-[var(--brand-text-muted)] uppercase tracking-wide mb-1">
                      {plan.name}
                    </p>
                    <h3 className="text-2xl font-bold" style={{ color: 'var(--brand-secondary)' }}>
                      {plan.name}
                    </h3>
                  </div>
                  {Icon && <Icon className="h-6 w-6 text-[var(--brand-primary)]" />}
                </div>

                {/* Price - Using AnimatedPrice component */}
                <div className="mb-6 h-[88px]">
                  {plan.monthlyPrice === 0 ? (
                    <StaticPrice label="$0" />
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
                              className="text-xs text-[var(--brand-text-muted)]"
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
                  {(() => {
                    const buttonType = getButtonType(planKey);
                    switch (buttonType) {
                      case 'current':
                        return (
                          <Button
                            disabled
                            className="w-full bg-gray-100 text-gray-500 cursor-not-allowed"
                          >
                            Current Plan
                          </Button>
                        );
                      case 'downgrade':
                        return (
                          <Button
                            variant="outline"
                            onClick={() => setShowDowngradeConfirm(planKey)}
                            disabled={downgradingTo === planKey}
                            className="w-full"
                          >
                            {downgradingTo === planKey ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <ArrowDown className="w-4 h-4 mr-2" />
                                Downgrade to {plan.name}
                              </>
                            )}
                          </Button>
                        );
                      case 'upgrade':
                      default:
                        return (
                          <Button
                            onClick={() => handleCheckout(planKey)}
                            disabled={checkingOut === planKey}
                            className="w-full brand-button-secondary"
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
                        );
                    }
                  })()}
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-grow">
                  {plan.features.map((feature, idx) => {
                    const parts = feature.split(/(\*\*[^*]+\*\*)/);
                    return (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-[var(--brand-success)] flex-shrink-0 mt-0.5" />
                        <span className="text-sm" style={{ color: 'var(--brand-text)' }}>
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

                {/* Everything in Pro footer (MAX only) */}
                {planKey === 'MAX' && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-[var(--brand-text-muted)]">
                      <span className="text-[var(--brand-primary)]">+</span>
                      <span>Everything in Pro</span>
                    </div>
                  </div>
                )}
              </motion.div>
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
