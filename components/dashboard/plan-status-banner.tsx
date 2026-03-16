'use client';

import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PlanStatusBannerProps {
  planType: 'FREE' | 'PRO' | 'MAX';
  daysRemaining?: number;
  isTrialing?: boolean;
  isGrandfathered?: boolean;
}

export function PlanStatusBanner({
  planType,
  daysRemaining,
  isTrialing,
  isGrandfathered,
}: PlanStatusBannerProps) {
  // Only show banner for FREE-tier users who are not grandfathered
  if (planType !== 'FREE' || isGrandfathered) return null;

  const isExpired = !isTrialing || daysRemaining === undefined || daysRemaining <= 0;

  if (isExpired) {
    return (
      <div className={cn('w-full border-b', 'bg-red-100 dark:bg-red-950/30', 'border-red-200 dark:border-red-900')}>
        <div className="container max-w-7xl mx-auto px-6 md:px-8 py-3">
          <div className="flex items-center justify-center gap-4">
            <span className="text-sm font-medium text-red-900 dark:text-red-100">
              Your trial has ended &mdash; upgrade now to continue receiving summaries
            </span>
            <Button
              size="sm"
              asChild
              className="text-white font-medium shadow-sm bg-red-600 hover:bg-red-700"
            >
              <Link
                href="/subscribe"
                className="flex items-center gap-2"
              >
                <CreditCard className="h-4 w-4" />
                Upgrade Now
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full border-b', 'bg-emerald-100 dark:bg-emerald-950/30', 'border-emerald-200 dark:border-emerald-900')}>
      <div className="container max-w-7xl mx-auto px-6 md:px-8 py-3">
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left in your
            trial
          </span>
          <Button
            size="sm"
            asChild
            className="text-white font-medium shadow-sm bg-emerald-600 hover:bg-emerald-700"
          >
            <Link
              href="/subscribe"
              className="flex items-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Upgrade Now
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
