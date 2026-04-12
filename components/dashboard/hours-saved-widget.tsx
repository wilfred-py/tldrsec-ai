"use client";

import { Clock } from "lucide-react";

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
    <div className="brand-card">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--brand-primary-light)' }}
        >
          <Clock className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} />
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--brand-text-muted)' }}>
          Time Saved
        </span>
      </div>
      {isEmpty ? (
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Summaries save you time. Check back after your first filing.
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--brand-secondary)' }}>
            {formatTimeSaved(summaryCountThisMonth)} this month
          </p>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            {formatTimeSaved(summaryCountTotal)} total &middot;{" "}
            {summaryCountTotal} filing{summaryCountTotal !== 1 ? "s" : ""}{" "}
            summarized
          </p>
        </div>
      )}
    </div>
  );
}
