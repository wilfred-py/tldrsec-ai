/**
 * Subscription Plans Component
 * Displays Pro and Max plans with 7-day free trial
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, CreditCard } from 'lucide-react';
import { SUBSCRIPTION_PLANS, type PlanType } from '@/lib/stripe/plans';

interface SubscriptionPlansProps {
  currentPlan?: PlanType | null;
  onSubscribe?: (planType: PlanType, priceId: string) => Promise<void>;
  loading?: boolean;
}

// Only show paid plans (PRO and MAX)
const PAID_PLANS: PlanType[] = ['PRO', 'MAX'];

export function SubscriptionPlans({
  currentPlan,
  onSubscribe,
  loading = false
}: SubscriptionPlansProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);

  const handleSubscribe = async (planType: PlanType, priceId: string) => {
    if (!onSubscribe || loading) return;

    setSelectedPlan(planType);
    try {
      await onSubscribe(planType, priceId);
    } finally {
      setSelectedPlan(null);
    }
  };

  const isPlanLoading = (planType: PlanType) => {
    return loading || selectedPlan === planType;
  };

  const isCurrentPlan = (planType: PlanType) => {
    return currentPlan === planType;
  };

  const getButtonText = (planType: PlanType) => {
    if (isCurrentPlan(planType)) {
      return 'Current Plan';
    }
    return currentPlan && currentPlan !== 'FREE' ? 'Switch Plan' : 'Start Free Trial';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-8 max-w-3xl mx-auto">
      {PAID_PLANS.map((planKey) => {
        const plan = SUBSCRIPTION_PLANS[planKey];
        const isRecommended = planKey === 'PRO';
        const isCurrent = isCurrentPlan(planKey);
        const planLoading = isPlanLoading(planKey);
        const priceId = plan.monthlyPriceId;

        return (
          <Card
            key={planKey}
            className={`relative ${
              isRecommended ? 'border-blue-500 shadow-lg scale-105' : ''
            } ${isCurrent ? 'border-green-500' : ''}`}
          >
            {isRecommended && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-blue-500 hover:bg-blue-600">
                  Most Popular
                </Badge>
              </div>
            )}

            {isCurrent && (
              <div className="absolute -top-3 right-4">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                  Current
                </Badge>
              </div>
            )}

            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription className="text-3xl font-bold">
                ${plan.monthlyPrice}
                <span className="text-base font-normal text-gray-500">/month</span>
              </CardDescription>
              <p className="text-sm text-gray-600 mt-2">
                7-day free trial
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-3">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature.replace(/\*\*/g, '')}</span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full"
                variant={isCurrent ? "outline" : "default"}
                disabled={isCurrent || planLoading || !priceId}
                onClick={() => priceId && handleSubscribe(planKey, priceId)}
              >
                {planLoading && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {!planLoading && !isCurrent && (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                {getButtonText(planKey)}
              </Button>

              {!priceId && (
                <p className="text-xs text-orange-600 text-center">
                  Price not configured
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default SubscriptionPlans;
