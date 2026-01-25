'use client';

import { Button } from '@/components/ui/button';
import { TableRow, TableCell } from '@/components/ui/table';
import { Zap, Loader2 } from 'lucide-react';

interface UpgradeRowProps {
  tickerCount: number;
  tickerLimit: number;
  onUpgradeClick: (planType: 'PRO' | 'MAX', billingCycle: 'monthly' | 'annual') => void;
  isLoading: boolean;
  columnCount?: number;
}

export function UpgradeRow({
  tickerCount,
  tickerLimit,
  onUpgradeClick,
  isLoading,
  columnCount = 5,
}: UpgradeRowProps) {
  const isAtLimit = tickerLimit > 0 && tickerCount >= tickerLimit;

  const message = isAtLimit
    ? `You've reached your ${tickerLimit} company limit. Upgrade to track up to 25 companies.`
    : `Track up to 25 companies with Pro. Get real-time alerts and all filing types.`;

  return (
    <TableRow className="bg-blue-50/50 dark:bg-blue-950/20 border-t-2 border-blue-200 dark:border-blue-800">
      <TableCell colSpan={columnCount} className="py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4 text-blue-500" />
            <span>{message}</span>
          </div>
          <Button
            size="sm"
            onClick={() => onUpgradeClick('PRO', 'monthly')}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Upgrade to Pro
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
