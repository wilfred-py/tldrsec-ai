/**
 * Billing Management Page
 * Addresses UX issue: missing billing and subscription management interface
 */

'use client';

import { useEffect, useState } from 'react';
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
  Shield,
  Clock,
  FileText
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useUser } from '@clerk/nextjs';

interface PlanFeatures {
  name: string;
  price: string;
  monthlyFilings: number;
  optimizationLevel: string;
  features: string[];
  recommended?: boolean;
}

const AVAILABLE_PLANS: Record<string, PlanFeatures> = {
  basic: {
    name: 'Basic',
    price: '$9/month',
    monthlyFilings: 50,
    optimizationLevel: 'Balanced (85% token reduction)',
    features: [
      'Basic filing summaries',
      'Standard AI analysis', 
      'Email notifications',
      'Balanced token optimization',
      'Community support'
    ]
  },
  professional: {
    name: 'Professional',
    price: '$29/month', 
    monthlyFilings: 200,
    optimizationLevel: 'Conservative (67% token reduction)',
    features: [
      'Enhanced filing summaries',
      'Advanced AI analysis',
      'Priority email notifications', 
      'Conservative token optimization',
      'Detailed business context',
      'Comprehensive risk analysis',
      'Priority support'
    ],
    recommended: true
  },
  max: {
    name: 'Max',
    price: '$139/month',
    monthlyFilings: 1000,
    optimizationLevel: 'Minimal (55% token reduction)',
    features: [
      'Max filing summaries',
      'Maximum context preservation',
      'Real-time notifications',
      'Minimal token optimization',
      'Complete financial statements',
      'Full business narratives',
      'Dedicated support',
      'Custom integrations'
    ]
  }
};

interface UserSubscription {
  planType: 'BASIC' | 'PROFESSIONAL' | 'MAX';
  isActive: boolean;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export default function BillingPage() {
  const { user } = useUser();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-4 bg-gray-200 rounded w-96"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-96 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currentPlan = subscription?.planType.toLowerCase() as keyof typeof AVAILABLE_PLANS;

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">
                  {AVAILABLE_PLANS[currentPlan]?.name || 'Unknown Plan'}
                </h3>
                <p className="text-gray-600">
                  {AVAILABLE_PLANS[currentPlan]?.price || 'Price unavailable'}
                </p>
              </div>
              <Badge variant={subscription.isActive ? 'default' : 'destructive'}>
                {subscription.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Billing Period</p>
                <p className="font-medium">
                  Renews {formatDistanceToNow(new Date(subscription.currentPeriodEnd), { addSuffix: true })}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Monthly Filings</p>
                <p className="font-medium">
                  {AVAILABLE_PLANS[currentPlan]?.monthlyFilings || 'Unknown'} filings
                </p>
              </div>
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
          {Object.entries(AVAILABLE_PLANS).map(([planKey, plan]) => (
            <Card 
              key={planKey} 
              className={`relative ${plan.recommended ? 'border-purple-200 shadow-lg' : ''}`}
            >
              {plan.recommended && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-purple-500 hover:bg-purple-600">
                    Recommended
                  </Badge>
                </div>
              )}
              
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {currentPlan === planKey && (
                    <Badge variant="outline">Current</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span>{plan.monthlyFilings} filings/month</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-gray-500" />
                    <span>{plan.optimizationLevel}</span>
                  </div>
                </div>

                <Separator />

                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button 
                  className="w-full"
                  variant={currentPlan === planKey ? 'outline' : 'default'}
                  disabled={currentPlan === planKey || updating}
                  onClick={() => handlePlanChange(planKey)}
                >
                  {currentPlan === planKey ? 'Current Plan' : 'Upgrade'}
                  {currentPlan !== planKey && <ArrowRight className="h-4 w-4 ml-2" />}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Security Notice */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-blue-800 mb-2">
            <Shield className="h-4 w-4" />
            <span className="font-medium">Secure Billing</span>
          </div>
          <p className="text-sm text-blue-700">
            All payments are processed securely through Stripe. We never store your payment information on our servers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}