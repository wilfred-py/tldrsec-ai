import { Summary, Ticker } from '@/lib/generated/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileTextIcon } from 'lucide-react';
import { SummaryCard } from '@/components/summary/summary-card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface SummaryWithTicker extends Summary {
  ticker: Ticker;
}

interface SummaryListProps {
  summaries: SummaryWithTicker[];
  title?: string;
  className?: string;
  showEmptyState?: boolean;
  emptyStateActions?: React.ReactNode;
}

export function SummaryList({ 
  summaries, 
  title = "Recent Summaries", 
  className = "",
  showEmptyState = true,
  emptyStateActions
}: SummaryListProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {summaries.length > 0 && (
          <Link href="/dashboard/summaries">
            <Button variant="ghost" size="sm" className="text-xs">
              View All
            </Button>
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {summaries.length > 0 ? (
          <div className="space-y-4">
            {summaries.map((summary) => (
              <SummaryCard 
                key={summary.id}
                summary={summary}
                variant="compact"
              />
            ))}
          </div>
        ) : showEmptyState ? (
          <div className="py-6 text-center text-muted-foreground">
            <FileTextIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p>No summaries available yet.</p>
            <p className="text-sm mt-1">Add tickers to track to receive summaries.</p>
            {emptyStateActions && (
              <div className="mt-4">
                {emptyStateActions}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
} 