'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Loader2, CheckCircle2, ArrowDown } from 'lucide-react';
import { AnimatedPrice } from '@/components/landing/sections-v2/animated-price';

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
  hoveredCard: string | null;
  selectedCard: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onSelect: () => void;
  onCheckout: (planKey: string) => void;
  getCtaText: (plan: PricingPlan) => string;
  getPrice: (plan: PricingPlan) => number;
  getMonthlyEquivalent: (plan: PricingPlan) => number | null;
  getSavings: (plan: PricingPlan) => number | null;
  // Optional props for /subscribe route
  onDowngrade?: (planKey: string) => void;
  isDowngrading?: boolean;
}

export function PricingCard({
  plan,
  billingInterval,
  isCurrentPlan,
  isTrialEndingSoon,
  loading,
  checkoutLoading,
  hoveredCard,
  selectedCard,
  onMouseEnter,
  onMouseLeave,
  onSelect,
  onCheckout,
  getCtaText,
  getPrice,
  getMonthlyEquivalent,
  getSavings,
  onDowngrade,
  isDowngrading,
}: PricingCardProps) {
  const savings = getSavings(plan);
  const monthlyEquiv = getMonthlyEquivalent(plan);

  const isSelected = selectedCard === plan.key;
  const isCardHovered = hoveredCard === plan.key;

  const dynamicStyles: React.CSSProperties = {
    borderColor: isSelected ? 'var(--brand-primary)' : isCardHovered ? 'var(--brand-primary-hover)' : 'var(--brand-border)',
    transition: 'border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease',
    cursor: 'pointer',
    ...(isSelected ? {
      boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.15)',
      transform: 'scale(1.02)',
      zIndex: 10,
    } : {}),
  };

  return (
    <div
      className="brand-card relative flex flex-col border-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      style={dynamicStyles}
      role="article"
      aria-label={`${plan.name} pricing plan`}
      tabIndex={0}
      aria-selected={isSelected}
      data-highlighted={isSelected}
      data-hovered={isCardHovered || undefined}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onMouseEnter}
      onBlur={onMouseLeave}
    >
      {/* Plan Header with Badges */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            className="text-2xl font-bold"
            style={{ color: 'var(--brand-secondary)' }}
          >
            {plan.name}
          </h3>
        </div>

        <div className="flex flex-col gap-1 items-end">
          {/* Popular badge */}
          {plan.popular && (
            <Badge className="bg-[var(--brand-primary)] text-white text-xs px-2 py-0.5">
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
        <AnimatedPrice
          value={getPrice(plan)}
          suffix={billingInterval === 'annual' ? '/year' : '/month'}
          savings={billingInterval === 'annual' ? savings : null}
        />
        {monthlyEquiv && (
          <p className="text-xs text-[var(--brand-text-muted)] mt-1">
            ${monthlyEquiv}/mo billed annually
          </p>
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
        ) : onDowngrade ? (
          // Downgrade button (used by /subscribe for lower-tier plans)
          <Button
            variant="outline"
            onClick={() => onDowngrade(plan.key)}
            disabled={isDowngrading}
            className="w-full"
          >
            {isDowngrading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                Processing...
              </>
            ) : (
              <>
                <ArrowDown className="w-4 h-4 mr-2" aria-hidden="true" />
                Downgrade to {plan.name}
              </>
            )}
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
            onClick={(e) => { e.stopPropagation(); onCheckout(plan.key); }}
            disabled={checkoutLoading}
            className={`w-full ${(isSelected || isCardHovered) && !checkoutLoading ? 'brand-button-gradient' : 'brand-button-secondary'}`}
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
              <Check className="w-4 h-4 text-[var(--brand-success)] flex-shrink-0 mt-0.5" />
              <span className="text-sm" style={{ color: 'var(--brand-text)' }}>
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

      {/* "Everything in Pro" footer for MAX tier */}
      {plan.key === 'MAX' && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-[var(--brand-text-muted)]">
            <span className="text-[var(--brand-primary)]">+</span>
            <span>Everything in Pro</span>
          </div>
        </div>
      )}
    </div>
  );
}
