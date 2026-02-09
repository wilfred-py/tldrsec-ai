'use client';

import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';
import Link from 'next/link';

interface PlanStatusBannerProps {
  planType: 'FREE' | 'PRO' | 'MAX';
}

export function PlanStatusBanner({ planType }: PlanStatusBannerProps) {
  // Only show for free plan users
  if (planType !== 'FREE') return null;

  return (
    <div className="w-full bg-emerald-100 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-900">
      <div className="container max-w-7xl mx-auto px-6 md:px-8 py-3">
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            You&apos;re on the Free Plan
          </span>
          <Button
            size="sm"
            asChild
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <Link href="/dashboard/billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Add Payment Method
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
