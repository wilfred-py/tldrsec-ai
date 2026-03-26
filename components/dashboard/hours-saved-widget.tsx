"use client";

import { Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface HoursSavedWidgetProps {
  hoursSavedThisMonth: number;
  hoursSavedTotal: number;
}

function formatHours(minutes: number): string {
  return `~${Math.round(minutes / 60)}`;
}

export function HoursSavedWidget({
  hoursSavedThisMonth,
  hoursSavedTotal,
}: HoursSavedWidgetProps) {
  const isEmpty = hoursSavedThisMonth === 0 && hoursSavedTotal === 0;

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
              {formatHours(hoursSavedThisMonth)} hrs saved this month
            </p>
            <p className="text-sm text-muted-foreground">
              {formatHours(hoursSavedTotal)} hrs total
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
