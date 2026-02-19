/**
 * Billing Management Page
 * Addresses UX issue: missing billing and subscription management interface
 *
 * Uses centralized SUBSCRIPTION_PLANS from lib/stripe.ts for pricing consistency
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  CreditCard,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useUser } from '@clerk/nextjs';
import { SUBSCRIPTION_PLANS, type PlanType } from '@/lib/stripe/plans';

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
  const [updatingCancellation, setUpdatingCancellation] = useState(false);
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

  const handleCancelToggle = async () => {
    if (!subscription) return;

    setUpdatingCancellation(true);
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
      setUpdatingCancellation(false);
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
      <div className="container mx-auto py-8 space-y-6 animate-fadeIn">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const currentPlanKey = subscription?.planType;
  const currentPlanConfig = currentPlanKey ? SUBSCRIPTION_PLANS[currentPlanKey] : null;
  const currentPrice = currentPlanKey === 'FREE'
    ? '$0/month'
    : currentPlanConfig
      ? `$${currentPlanConfig.monthlyPrice}/month`
      : 'Price unavailable';

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 text-gray-600 hover:text-gray-900"
          onClick={() => router.push('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Button>
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
                {currentPrice}
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
                  disabled={updatingCancellation}
                />
                <span className="text-sm">
                  {subscription.cancelAtPeriodEnd ? 'Reactivate' : 'Cancel'} at period end
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}