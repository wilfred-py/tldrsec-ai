'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Loader2, CheckCircle2 } from 'lucide-react';

interface PricingPlan {
  key: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  features: string[];
  cta: string;
  href: string;
  popular?: boolean;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

interface PricingCardProps {
  plan: PricingPlan;
  billingInterval: 'monthly' | 'annual';
  isCurrentPlan: boolean;
  isTrialEndingSoon: boolean;
  loading: boolean;
  checkoutLoading: boolean;
  onCheckout: (planKey: string) => void;
  getCtaText: (plan: PricingPlan) => string;
  getPrice: (plan: PricingPlan) => number;
  getMonthlyEquivalent: (plan: PricingPlan) => number | null;
  getSavings: (plan: PricingPlan) => number | null;
}

export function PricingCard({
  plan,
  billingInterval,
  isCurrentPlan,
  isTrialEndingSoon,
  loading,
  checkoutLoading,
  onCheckout,
  getCtaText,
  getPrice,
  getMonthlyEquivalent,
  getSavings,
}: PricingCardProps) {
  const savings = getSavings(plan);
  const monthlyEquiv = getMonthlyEquivalent(plan);

  return (
    <div
      className={`landing-card relative flex flex-col focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 ${
        plan.popular
          ? 'ring-2 ring-[var(--landing-primary)] shadow-lg'
          : ''
      }`}
      role="article"
      aria-label={`${plan.name} pricing plan`}
    >
      {/* Plan Header with Badges */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-[var(--landing-text-muted)] uppercase tracking-wide mb-1">
            {plan.key === 'FREE' ? 'Trial' : plan.name}
          </p>
          <h3
            className="text-2xl font-bold"
            style={{ color: 'var(--landing-secondary)' }}
          >
            {plan.name}
          </h3>
        </div>

        <div className="flex flex-col gap-1 items-end">
          {/* Popular badge */}
          {plan.popular && (
            <Badge className="bg-[var(--landing-primary)] text-white text-xs px-2 py-0.5">
              Popular
            </Badge>
          )}

          {/* Current plan badge */}
          {!loading && isCurrentPlan && (
            <Badge
              className="bg-green-50 text-green-800 border-green-200 text-xs px-2 py-0.5"
              role="status"
              aria-live="polite"
            >
              {isTrialEndingSoon ? 'Trial Ending Soon' : 'Current Plan'}
            </Badge>
          )}
        </div>
      </div>

      {/* Price Display */}
      <div className="mb-6 h-[88px] flex flex-col justify-center">
        {plan.monthlyPrice === 0 ? (
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-bold"
              style={{ color: 'var(--landing-secondary)' }}
            >
              Free
            </span>
            <span className="text-[var(--landing-text-muted)]">
              for 7 days
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className="text-4xl font-bold"
                style={{ color: 'var(--landing-secondary)' }}
              >
                ${getPrice(plan)}
              </span>
              <span className="text-[var(--landing-text-muted)]">
                /{billingInterval === 'annual' ? 'year' : 'month'}
              </span>
              {billingInterval === 'annual' && savings && (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs px-2 py-0.5">
                  Save {savings}%
                </Badge>
              )}
            </div>
            {monthlyEquiv && (
              <p className="text-xs text-[var(--landing-text-muted)] mt-1">
                ${monthlyEquiv}/mo billed annually
              </p>
            )}
          </>
        )}
      </div>

      {/* CTA Button with Loading States */}
      <div className="mb-6">
        {loading ? (
          // Loading state - show skeleton button
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : isCurrentPlan ? (
          // Current plan - show disabled button with checkmark icon
          <Button
            className="w-full bg-green-50 text-green-700 border-2 border-green-200 cursor-default hover:bg-green-50 font-semibold"
            disabled
          >
            <CheckCircle2 className="w-4 h-4 mr-2" aria-hidden="true" />
            {isTrialEndingSoon ? 'Trial Ending Soon' : 'Current Plan'}
          </Button>
        ) : plan.disabled ? (
          // Disabled plan (e.g., coming soon)
          <Button
            className="w-full bg-gray-100 text-gray-500 border border-gray-200 cursor-default hover:bg-gray-100"
            disabled
          >
            {plan.cta}
          </Button>
        ) : (
          // Active plan - show checkout button
          <Button
            onClick={() => onCheckout(plan.key)}
            disabled={checkoutLoading}
            className={`w-full ${
              plan.popular
                ? 'landing-button-primary'
                : 'landing-button-secondary'
            }`}
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                <span className="sr-only">Processing checkout</span>
                Loading...
              </>
            ) : (
              getCtaText(plan)
            )}
          </Button>
        )}
      </div>

      {/* Features List */}
      <ul className="space-y-3 flex-grow">
        {plan.features.map((feature, index) => {
          // Parse **text** markdown bold syntax
          const parts = feature.split(/(\*\*[^*]+\*\*)/);
          return (
            <li key={index} className="flex items-start gap-3">
              <Check className="w-4 h-4 text-[var(--landing-success)] flex-shrink-0 mt-0.5" />
              <span className="text-sm" style={{ color: 'var(--landing-text)' }}>
                {parts.map((part, i) => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return (
                      <strong key={i} className="font-semibold">
                        {part.slice(2, -2)}
                      </strong>
                    );
                  }
                  return part;
                })}
              </span>
            </li>
          );
        })}
      </ul>

      {/* "Everything in X" footer for higher tiers */}
      {plan.key !== 'FREE' && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-[var(--landing-text-muted)]">
            <span className="text-[var(--landing-primary)]">+</span>
            <span>
              Everything in {plan.key === 'PRO' ? 'Trial' : 'Pro'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
