'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, CreditCard } from 'lucide-react';
import Link from 'next/link';

export function ExpiredTrialBanner() {
  return (
    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-orange-600" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Your Trial Has Ended
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-md">
              You won&apos;t receive new filing summaries delivered to your inbox
              unless you upgrade to a Pro or Max plan. You can still view your
              past summaries below.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Link
              href="/subscribe"
              className="flex items-center gap-2"
            >
              <CreditCard className="h-5 w-5" />
              Upgrade Now
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
