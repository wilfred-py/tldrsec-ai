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
  // Only show banner for active trial users
  if (planType !== 'FREE' || !isTrialing || isGrandfathered) return null;
  if (daysRemaining === undefined || daysRemaining <= 0) return null;

  const getUrgencyConfig = () => {
    if (daysRemaining <= 2) {
      return {
        bgColor: 'bg-red-100 dark:bg-red-950/30',
        borderColor: 'border-red-200 dark:border-red-900',
        textColor: 'text-red-900 dark:text-red-100',
        buttonColor: 'bg-red-600 hover:bg-red-700',
      };
    } else if (daysRemaining <= 5) {
      return {
        bgColor: 'bg-orange-100 dark:bg-orange-950/30',
        borderColor: 'border-orange-200 dark:border-orange-900',
        textColor: 'text-orange-900 dark:text-orange-100',
        buttonColor: 'bg-orange-600 hover:bg-orange-700',
      };
    } else {
      return {
        bgColor: 'bg-emerald-100 dark:bg-emerald-950/30',
        borderColor: 'border-emerald-200 dark:border-emerald-900',
        textColor: 'text-emerald-900 dark:text-emerald-100',
        buttonColor: 'bg-emerald-600 hover:bg-emerald-700',
      };
    }
  };

  const config = getUrgencyConfig();

  return (
    <div className={cn('w-full border-b', config.bgColor, config.borderColor)}>
      <div className="container max-w-7xl mx-auto px-6 md:px-8 py-3">
        <div className="flex items-center justify-center gap-4">
          <span className={cn('text-sm font-medium', config.textColor)}>
            {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left in your
            free trial
          </span>
          <Button
            size="sm"
            asChild
            className={cn(
              'text-white font-medium shadow-sm',
              config.buttonColor
            )}
          >
            <Link
              href="/dashboard/billing"
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
