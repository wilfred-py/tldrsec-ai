import { Summary, Ticker } from '@/lib/generated/prisma';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileTextIcon } from 'lucide-react';

interface SummaryWithTicker extends Summary {
  ticker: Ticker;
}

interface SummaryListProps {
  summaries: SummaryWithTicker[];
  title?: string;
  className?: string;
  showEmptyState?: boolean;
}

export function SummaryList({ 
  summaries, 
  title = "Recent Summaries", 
  className = "",
  showEmptyState = true
}: SummaryListProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {summaries.length > 0 ? (
          <ul className="space-y-4">
            {summaries.map((summary) => (
              <li key={summary.id} className="border-b pb-4 last:border-0 last:pb-0">
                <Link 
                  href={`/summary/${summary.id}`}
                  className="flex items-start gap-4 hover:bg-muted/50 p-2 rounded-md transition-colors"
                >
                  <div className="flex-shrink-0 bg-blue-100 text-blue-600 p-2 rounded-full">
                    <FileTextIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="font-medium truncate">
                        {summary.ticker.symbol}: {summary.filingType}
                      </h3>
                      <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                        {formatDistanceToNow(new Date(summary.filingDate), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {summary.summaryText.substring(0, 120)}...
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : showEmptyState ? (
          <div className="py-6 text-center text-muted-foreground">
            <FileTextIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p>No summaries available yet.</p>
            <p className="text-sm mt-1">Add tickers to track to receive summaries.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
} 