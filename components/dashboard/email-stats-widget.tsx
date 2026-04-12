"use client";

import { Mail } from "lucide-react";

interface EmailStatsWidgetProps {
  summaryCountThisMonth: number;
  summaryCountTotal: number;
}

export function EmailStatsWidget({
  summaryCountThisMonth,
  summaryCountTotal,
}: EmailStatsWidgetProps) {
  const isEmpty = summaryCountThisMonth === 0 && summaryCountTotal === 0;

  return (
    <div className="rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-bg)] p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--landing-text-muted)] mb-3">
        <Mail className="h-4 w-4" />
        Email Delivery
      </div>
      {isEmpty ? (
        <p className="text-sm text-[var(--landing-text-muted)]">
          Your first email summary is on the way! We&apos;ll email you when
          filings come in for your tracked companies.
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-2xl font-bold tracking-tight text-[var(--landing-secondary)]">
            {summaryCountThisMonth} email{summaryCountThisMonth !== 1 ? "s" : ""} this month
          </p>
          <p className="text-sm text-[var(--landing-text-muted)]">
            {summaryCountTotal} filing{summaryCountTotal !== 1 ? "s" : ""}{" "}
            summarized all time
          </p>
        </div>
      )}
    </div>
  );
}
