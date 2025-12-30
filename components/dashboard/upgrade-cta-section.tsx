'use client';

import { Button } from '@/components/ui/button';
import { Crown, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface UpgradeCTASectionProps {
  currentPlan: 'FREE' | 'PRO' | 'MAX';
  tickerCount: number;
  tickerLimit: number;
}

export function UpgradeCTASection({
  currentPlan,
  tickerCount,
  tickerLimit,
}: UpgradeCTASectionProps) {
  // Max users don't need upgrade CTAs
  if (currentPlan === 'MAX') return null;

  const isNearLimit = tickerLimit > 0 && tickerCount >= tickerLimit * 0.8;
  const isAtLimit = tickerLimit > 0 && tickerCount >= tickerLimit;

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
                ? `You've reached your ${tickerLimit} company limit. Upgrade to track up to 10 companies.`
                : isNearLimit
                  ? `You're using ${tickerCount} of ${tickerLimit} companies. Get more with Pro.`
                  : 'Get real-time alerts, all filing types (8-K, Form 4), and track up to 10 companies.'}
            </p>
          </div>
          <Link href="/dashboard/billing">
            <Button
              variant="secondary"
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold shadow-sm"
            >
              Upgrade to Pro - $99/mo
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        {/* Feature comparison */}
        <div className="mt-4 pt-4 border-t border-blue-500/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-blue-200">10 companies</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-200">Real-time alerts</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-200">All filing types</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-200">Priority support</span>
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
              : 'Unlock unlimited companies, API access, and dedicated support.'}
          </p>
        </div>
        <Link href="/dashboard/billing">
          <Button
            variant="secondary"
            className="bg-white text-amber-600 hover:bg-amber-50 font-semibold shadow-sm"
          >
            Start Max - $139/mo
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>

      {/* Feature comparison */}
      <div className="mt-4 pt-4 border-t border-amber-400/30">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-amber-100">Unlimited companies</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-100">API access</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-100">Priority queue</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-100">Dedicated support</span>
          </div>
        </div>
      </div>
    </div>
  );
}
