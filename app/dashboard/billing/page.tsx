/**
 * Billing Management Page
 * Addresses UX issue: missing billing and subscription management interface
 *
 * Uses centralized SUBSCRIPTION_PLANS from lib/stripe.ts for pricing consistency
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  CreditCard,
  CheckCircle,
  ArrowRight,
  AlertTriangle,
  Zap,
  Clock,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useUser } from '@clerk/nextjs';
import { SUBSCRIPTION_PLANS, type PlanType } from '@/lib/stripe/plans';

// Transform SUBSCRIPTION_PLANS for billing page UI
interface BillingPlan {
  name: string;
  price: string;
  tickerLimit: number;
  tickerDisplay: string;
  features: readonly string[];
  recommended: boolean;
  planKey: PlanType;
}

function getBillingPlans(): BillingPlan[] {
  return [
    {
      name: SUBSCRIPTION_PLANS.FREE.name,
      price: '$0/month',
      tickerLimit: SUBSCRIPTION_PLANS.FREE.tickerLimit,
      tickerDisplay: `${SUBSCRIPTION_PLANS.FREE.tickerLimit} companies`,
      features: SUBSCRIPTION_PLANS.FREE.features,
      recommended: false,
      planKey: 'FREE',
    },
    {
      name: SUBSCRIPTION_PLANS.PRO.name,
      price: `$${SUBSCRIPTION_PLANS.PRO.monthlyPrice}/month`,
      tickerLimit: SUBSCRIPTION_PLANS.PRO.tickerLimit,
      tickerDisplay: `${SUBSCRIPTION_PLANS.PRO.tickerLimit} companies`,
      features: SUBSCRIPTION_PLANS.PRO.features,
      recommended: true,
      planKey: 'PRO',
    },
    {
      name: SUBSCRIPTION_PLANS.MAX.name,
      price: `$${SUBSCRIPTION_PLANS.MAX.monthlyPrice}/month`,
      tickerLimit: SUBSCRIPTION_PLANS.MAX.tickerLimit,
      tickerDisplay: 'Unlimited companies',
      features: SUBSCRIPTION_PLANS.MAX.features,
      recommended: false,
      planKey: 'MAX',
    },
  ];
}

interface UserSubscription {
  planType: PlanType;
  isActive: boolean;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export default function BillingPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle checkout cancellation - redirect to dashboard
  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      router.replace('/dashboard');
    }
  }, [searchParams, router]);

  // Handle checkout success - show toast and redirect to dashboard
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Payment successful!', {
        description: 'Your subscription has been activated.',
        duration: 5000,
      });
      router.replace('/dashboard?subscription_success=true');
    }
  }, [searchParams, router]);

  useEffect(() => {
    async function fetchSubscription() {
      try {
        const response = await fetch('/api/user/subscription');
        if (!response.ok) {
          throw new Error('Failed to fetch subscription');
        }
        const data = await response.json();
        setSubscription(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      fetchSubscription();
    }
  }, [user]);

  const handlePlanChange = async (newPlan: string) => {
    if (!subscription) return;
    
    setUpdating(true);
    try {
      const response = await fetch('/api/user/subscription', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          planType: newPlan.toUpperCase(),
          isActive: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update subscription');
      }

      const updatedSubscription = await response.json();
      setSubscription(updatedSubscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelToggle = async () => {
    if (!subscription) return;
    
    setUpdating(true);
    try {
      const response = await fetch('/api/user/subscription', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancelAtPeriodEnd: !subscription.cancelAtPeriodEnd
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update cancellation');
      }

      const updatedSubscription = await response.json();
      setSubscription(updatedSubscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const openStripePortal = async () => {
    if (!subscription?.stripeCustomerId) return;
    
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portal access failed');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[var(--landing-border)] rounded w-64"></div>
          <div className="h-4 bg-[var(--landing-border)] rounded w-96"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-96 bg-[var(--landing-border)] rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const billingPlans = getBillingPlans();
  const currentPlanKey = subscription?.planType;
  const currentPlanConfig = currentPlanKey ? SUBSCRIPTION_PLANS[currentPlanKey] : null;
  const currentBillingPlan = billingPlans.find(p => p.planKey === currentPlanKey);

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
        <p className="text-gray-600 mt-2">
          Manage your subscription, billing, and payment methods
        </p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Current Subscription Status */}
      {subscription && (
        <Card className="border-0 shadow-sm bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">
                {currentPlanConfig?.name || 'Unknown Plan'}
              </h3>
              <p className="text-gray-600">
                {currentBillingPlan?.price || 'Price unavailable'}
              </p>
            </div>

            <div className="text-sm">
              <p className="text-gray-500">Billing Period</p>
              <p className="font-medium">
                Renews on {format(new Date(subscription.currentPeriodEnd), 'MMMM d, yyyy')}
              </p>
            </div>

            {subscription.cancelAtPeriodEnd && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-yellow-800">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Cancellation Scheduled</span>
                </div>
                <p className="text-sm text-yellow-700 mt-1">
                  Your subscription will end on {format(new Date(subscription.currentPeriodEnd), 'PPP')}
                </p>
              </div>
            )}

            <Separator />

            <div className="flex gap-2">
              <Button variant="outline" onClick={openStripePortal} disabled={!subscription.stripeCustomerId}>
                <CreditCard className="h-4 w-4 mr-2" />
                Manage Payment Methods
              </Button>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!subscription.cancelAtPeriodEnd}
                  onCheckedChange={handleCancelToggle}
                  disabled={updating}
                />
                <span className="text-sm">
                  {subscription.cancelAtPeriodEnd ? 'Reactivate' : 'Cancel'} at period end
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Plans */}
      <div>
        <h2 className="text-2xl font-semibold mb-6">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {billingPlans.map((plan) => {
            // Only show "Recommended" badge for Pro plan if user is on FREE tier
            const showRecommended = plan.recommended && currentPlanKey === 'FREE';
            return (
            <Card
              key={plan.planKey}
              className={`relative landing-card flex flex-col ${showRecommended ? 'ring-2 ring-[var(--landing-primary)] shadow-lg' : ''}`}
            >
              {showRecommended && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-[var(--landing-primary)] hover:bg-[var(--landing-primary-hover)]">
                    Recommended
                  </Badge>
                </div>
              )}

              <CardHeader>
                <CardTitle>
                  {plan.name}
                </CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 flex flex-col flex-grow">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-gray-500" />
                    <span>{plan.tickerDisplay}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-gray-500" />
                    <span>{SUBSCRIPTION_PLANS[plan.planKey].emailFrequency === 'realtime' ? 'Real-time alerts' : 'Weekly digest'}</span>
                  </div>
                </div>

                <Separator />

                <ul className="space-y-2 flex-grow">
                  {plan.features.map((feature, index) => {
                    // Convert markdown-style bold (**text**) to proper semantic HTML
                    const parts = feature.split(/\*\*([^*]+)\*\*/g);
                    return (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                        <span>
                          {parts.map((part, partIndex) =>
                            partIndex % 2 === 1 ? (
                              <strong key={partIndex}>{part}</strong>
                            ) : (
                              part
                            )
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {(() => {
                  const isCurrentPlan = currentPlanKey === plan.planKey;
                  const planOrder = { FREE: 0, PRO: 1, MAX: 2 };
                  const currentOrder = currentPlanKey ? planOrder[currentPlanKey] : 0;
                  const targetOrder = planOrder[plan.planKey];
                  const isDowngrade = targetOrder < currentOrder;

                  return (
                    <Button
                      className="w-full border mt-auto"
                      variant={isCurrentPlan ? 'outline' : 'outline'}
                      disabled={isCurrentPlan || updating}
                      onClick={() => handlePlanChange(plan.planKey)}
                    >
                      {isCurrentPlan ? 'Current Plan' : (isDowngrade ? 'Downgrade' : 'Upgrade')}
                      {!isCurrentPlan && <ArrowRight className="h-4 w-4 ml-2" />}
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          );
          })}
        </div>
      </div>
    </div>
  );
}