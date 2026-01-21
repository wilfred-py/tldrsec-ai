'use client';

import { Button } from '@/components/ui/button';
import { Crown, Zap, Loader2 } from 'lucide-react';
import { SUBSCRIPTION_PLANS } from '@/lib/stripe';

interface UpgradeCTASectionProps {
  currentPlan: 'FREE' | 'PRO' | 'MAX';
  tickerCount: number;
  tickerLimit: number;
  onUpgradeClick?: (planType: 'PRO' | 'MAX', billingCycle: 'monthly' | 'annual') => void;
  isCheckoutLoading?: boolean;
}

export function UpgradeCTASection({
  currentPlan,
  tickerCount,
  tickerLimit,
  onUpgradeClick,
  isCheckoutLoading = false,
}: UpgradeCTASectionProps) {
  // Max users don't need upgrade CTAs
  if (currentPlan === 'MAX') return null;

  const isNearLimit = tickerLimit > 0 && tickerCount >= tickerLimit * 0.8;
  const isAtLimit = tickerLimit > 0 && tickerCount >= tickerLimit;

  const proPlan = SUBSCRIPTION_PLANS.PRO;
  const maxPlan = SUBSCRIPTION_PLANS.MAX;

  if (currentPlan === 'FREE') {
    return (
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white mt-6 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-lg flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5" />
              Upgrade to Pro
            </h3>
            <p className="text-blue-100 text-sm">
              {isAtLimit
                ? `You've reached your ${tickerLimit} company limit. Upgrade to track up to ${proPlan.tickerLimit} companies.`
                : isNearLimit
                  ? `You're using ${tickerCount} of ${tickerLimit} companies. Get more with Pro.`
                  : `Get real-time alerts, all filing types (8-K, Form 4), and track up to ${proPlan.tickerLimit} companies.`}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="secondary"
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold shadow-sm"
              onClick={() => onUpgradeClick?.('PRO', 'monthly')}
              disabled={isCheckoutLoading}
            >
              {isCheckoutLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              ${proPlan.monthlyPrice}/mo
            </Button>
            <Button
              variant="secondary"
              className="bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold shadow-sm border-2 border-blue-300"
              onClick={() => onUpgradeClick?.('PRO', 'annual')}
              disabled={isCheckoutLoading}
            >
              {isCheckoutLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              ${proPlan.annualPrice.toLocaleString()}/yr
              <span className="ml-1 text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full">
                Save 17%
              </span>
            </Button>
          </div>
        </div>

        {/* Feature comparison */}
        <div className="mt-4 pt-4 border-t border-blue-500/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-blue-200">{proPlan.tickerLimit} companies</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-200">Real-time alerts</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-200">All filing types</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-200">Email support</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PRO tier - upsell to Max
  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg p-6 text-white mt-6 shadow-lg">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-1">
            <Crown className="w-5 h-5" />
            Go Max
          </h3>
          <p className="text-amber-100 text-sm">
            {isAtLimit
              ? `You've reached your ${tickerLimit} company limit. Upgrade to unlimited.`
              : 'Unlock unlimited companies, first priority processing, and dedicated support.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="secondary"
            className="bg-white text-amber-600 hover:bg-amber-50 font-semibold shadow-sm"
            onClick={() => onUpgradeClick?.('MAX', 'monthly')}
            disabled={isCheckoutLoading}
          >
            {isCheckoutLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            ${maxPlan.monthlyPrice}/mo
          </Button>
          <Button
            variant="secondary"
            className="bg-amber-100 text-amber-700 hover:bg-amber-200 font-semibold shadow-sm border-2 border-amber-300"
            onClick={() => onUpgradeClick?.('MAX', 'annual')}
            disabled={isCheckoutLoading}
          >
            {isCheckoutLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            ${maxPlan.annualPrice.toLocaleString()}/yr
            <span className="ml-1 text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full">
              Save 17%
            </span>
          </Button>
        </div>
      </div>

      {/* Feature comparison */}
      <div className="mt-4 pt-4 border-t border-amber-400/30">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-amber-100">Unlimited companies</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-100">First priority queue</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-100">All filing types</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-100">Dedicated support</span>
          </div>
        </div>
      </div>
    </div>
  );
}
