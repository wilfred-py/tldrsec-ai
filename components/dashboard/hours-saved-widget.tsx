"use client";

import { Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface HoursSavedWidgetProps {
  summaryCountThisMonth: number;
  summaryCountTotal: number;
}

function formatTimeSaved(count: number): string {
  const minutes = count * 15;
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.round(minutes / 60)} hrs`;
}

export function HoursSavedWidget({
  summaryCountThisMonth,
  summaryCountTotal,
}: HoursSavedWidgetProps) {
  const isEmpty = summaryCountThisMonth === 0 && summaryCountTotal === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Time Saved
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">
            Summaries save you time. Check back after your first filing.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-2xl font-bold tracking-tight">
              {formatTimeSaved(summaryCountThisMonth)} this month
            </p>
            <p className="text-sm text-muted-foreground">
              {formatTimeSaved(summaryCountTotal)} total &middot;{" "}
              {summaryCountTotal} filing{summaryCountTotal !== 1 ? "s" : ""}{" "}
              summarized
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
