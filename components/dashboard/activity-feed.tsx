"use client";

import Link from "next/link";
import { FileTextIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ActivitySummary {
  id: string;
  filingType: string;
  filingDate: string;
  importance: string | null;
  smartSubject: string | null;
  companyName: string;
  ticker: string;
  filingUrl: string;
}

interface ActivityFeedProps {
  summaries: ActivitySummary[];
}

const IMPORTANCE_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-red-500 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-gray-400 text-white",
};

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfToday.getDay());

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) return "This Week";
  return "Earlier";
}

function groupSummaries(
  summaries: ActivitySummary[]
): { label: string; items: ActivitySummary[] }[] {
  const order = ["Today", "Yesterday", "This Week", "Earlier"];
  const groups = new Map<string, ActivitySummary[]>();

  for (const summary of summaries) {
    const group = getDateGroup(summary.filingDate);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(summary);
  }

  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, items: groups.get(label)! }));
}

function ImportanceBadge({ importance }: { importance: string | null }) {
  if (!importance) return null;

  const colorClass =
    IMPORTANCE_COLORS[importance.toLowerCase()] ?? IMPORTANCE_COLORS.low;

  return (
    <Badge
      className={`${colorClass} border-transparent text-[10px] uppercase tracking-wide`}
    >
      {importance}
    </Badge>
  );
}

function FeedItem({ summary }: { summary: ActivitySummary }) {
  const subject =
    summary.smartSubject ??
    `${summary.companyName} ${summary.filingType} Filing`;

  return (
    <Link
      href={`/summary/${summary.id}`}
      className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ImportanceBadge importance={summary.importance} />
          <span className="truncate text-sm font-medium">{subject}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {summary.ticker} &middot; {summary.filingType}
        </p>
      </div>
    </Link>
  );
}

export function ActivityFeed({ summaries }: ActivityFeedProps) {
  const grouped = groupSummaries(summaries);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FileTextIcon className="h-4 w-4 text-muted-foreground" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your first summaries are on the way! We&apos;ll email you when
            filings come in.
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <div key={group.label}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h4>
                <div className="space-y-1">
                  {group.items.map((summary) => (
                    <FeedItem key={summary.id} summary={summary} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
