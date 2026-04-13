"use client";

import { Clock, FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface EmailStatsWidgetProps {
  summaryCountThisMonth: number;
  summaryCountTotal: number;
  totalTimeSavedMinutes?: number;
}

function formatTimeSaved(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  if (remaining === 0) return `~${hours} hr${hours > 1 ? "s" : ""}`;
  return `~${hours} hr${hours > 1 ? "s" : ""} ${remaining} min`;
}

export function EmailStatsWidget({
  summaryCountThisMonth,
  summaryCountTotal,
  totalTimeSavedMinutes = 0,
}: EmailStatsWidgetProps) {
  const hasTimeSaved = totalTimeSavedMinutes >= 1;
  const isEmpty = summaryCountThisMonth === 0 && summaryCountTotal === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {hasTimeSaved ? (
            <>
              <Clock className="h-4 w-4" />
              Time Saved
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Filing Summaries
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">
            Your first filing summary is on the way! We&apos;ll email you when
            filings come in for your tracked companies.
          </p>
        ) : (
          <div className="space-y-1">
            {hasTimeSaved && (
              <p className="text-2xl font-bold tracking-tight text-[var(--brand-secondary)]">
                {formatTimeSaved(totalTimeSavedMinutes)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {summaryCountThisMonth} summary{summaryCountThisMonth !== 1 ? "s" : ""} this month
              {" "}&middot;{" "}
              {summaryCountTotal} all time
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
