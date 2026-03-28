"use client";

import { useState } from "react";
import Link from "next/link";
import { FileTextIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export interface ActivitySummary {
  id: string;
  filingType: string;
  filingDate: string;
  importance: string | null;
  smartSubject: string | null;
  summaryText: string | null;
  companyName: string;
  ticker: string;
  filingUrl: string;
}

interface ActivityFeedProps {
  summaries: ActivitySummary[];
}

const IMPORTANCE_BORDER: Record<string, string> = {
  critical: "border-l-4 border-red-600",
  high: "border-l-4 border-red-500",
  medium: "border-l-4 border-amber-500",
};

const IMPORTANCE_BADGE: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-red-500 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-gray-400 text-white",
};

function formatFilingType(type: string): string {
  const upper = type.toUpperCase();
  switch (upper) {
    case "10-K":
    case "10K":
      return "10-K";
    case "10-Q":
    case "10Q":
      return "10-Q";
    case "8-K":
    case "8K":
      return "8-K";
    case "SC13G":
    case "SC 13G":
    case "SCHEDULE 13G":
      return "Schedule 13G";
    case "SC13D":
    case "SC 13D":
    case "SCHEDULE 13D":
      return "Schedule 13D";
    default:
      return type;
  }
}

function getFilingBadge(filingType: string) {
  const formatted = formatFilingType(filingType);
  const upper = filingType.toUpperCase();

  if (upper.includes("10-K") || upper.includes("10K")) {
    return <Badge variant="default">{formatted}</Badge>;
  }
  if (upper.includes("10-Q") || upper.includes("10Q")) {
    return <Badge variant="secondary">{formatted}</Badge>;
  }
  if (upper.includes("8-K") || upper.includes("8K")) {
    return <Badge variant="outline">{formatted}</Badge>;
  }
  if (upper.includes("FORM 4") || upper === "4" || upper === "FORM4") {
    return (
      <Badge className="bg-purple-100 text-purple-800 border-transparent">
        Form 4
      </Badge>
    );
  }
  return <Badge variant="secondary">{formatted}</Badge>;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

function getPreviewText(summary: ActivitySummary): string | null {
  const raw = summary.summaryText?.trim();
  if (raw && raw.length > 0) {
    const text = stripMarkdown(raw);
    return text.length > 150 ? text.substring(0, 150) + "..." : text;
  }
  return null;
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  // Use Monday as week start (getDay()=0 on Sunday, so offset by 6 instead of -1)
  const dayOfWeek = startOfToday.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) return "This Week";
  return "Earlier";
}

interface GroupedSummaries {
  label: string;
  items: ActivitySummary[];
}

function groupSummaries(summaries: ActivitySummary[]): GroupedSummaries[] {
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

interface Form4Group {
  key: string;
  company: string;
  ticker: string;
  primary: ActivitySummary;
  rest: ActivitySummary[];
}

function groupForm4s(items: ActivitySummary[]): (ActivitySummary | Form4Group)[] {
  const form4sByCompany = new Map<string, ActivitySummary[]>();
  const nonForm4s: ActivitySummary[] = [];

  for (const item of items) {
    const upper = item.filingType.toUpperCase();
    if (upper.includes("FORM 4") || upper === "4" || upper === "FORM4") {
      const key = item.ticker;
      if (!form4sByCompany.has(key)) {
        form4sByCompany.set(key, []);
      }
      form4sByCompany.get(key)!.push(item);
    } else {
      nonForm4s.push(item);
    }
  }

  const result: (ActivitySummary | Form4Group)[] = [];
  const form4Entries: (ActivitySummary | Form4Group)[] = [];

  for (const [ticker, form4s] of form4sByCompany) {
    if (form4s.length >= 3) {
      // Sort by importance: critical > high > medium > low > null
      const importanceOrder = ["critical", "high", "medium", "low"];
      const sorted = [...form4s].sort((a, b) => {
        const aIdx = a.importance
          ? importanceOrder.indexOf(a.importance.toLowerCase())
          : importanceOrder.length;
        const bIdx = b.importance
          ? importanceOrder.indexOf(b.importance.toLowerCase())
          : importanceOrder.length;
        return aIdx - bIdx;
      });
      form4Entries.push({
        key: `form4-group-${ticker}`,
        company: sorted[0].companyName,
        ticker,
        primary: sorted[0],
        rest: sorted.slice(1),
      });
    } else {
      form4Entries.push(...form4s);
    }
  }

  // Interleave by original date order: merge non-form4s and form4 entries
  // For simplicity, put non-form4s first, then form4 entries
  result.push(...nonForm4s, ...form4Entries);
  return result;
}

function isForm4Group(item: ActivitySummary | Form4Group): item is Form4Group {
  return "primary" in item && "rest" in item;
}

function ImportanceBadge({ importance }: { importance: string | null }) {
  if (!importance) return null;
  const level = importance.toLowerCase();
  // Only show text badge for critical/high — border handles medium/low
  if (level !== "critical" && level !== "high") return null;
  const colorClass =
    IMPORTANCE_BADGE[level] ?? IMPORTANCE_BADGE.low;
  return (
    <Badge
      className={`${colorClass} border-transparent text-[10px] uppercase tracking-wide`}
    >
      {importance}
    </Badge>
  );
}

function FeedCard({ summary }: { summary: ActivitySummary }) {
  const subject =
    summary.smartSubject ??
    `${summary.companyName} ${formatFilingType(summary.filingType)} Filing`;
  const preview = getPreviewText(summary);
  const borderClass =
    summary.importance
      ? IMPORTANCE_BORDER[summary.importance.toLowerCase()] ?? ""
      : "";
  const relativeDate = formatDistanceToNow(new Date(summary.filingDate), {
    addSuffix: true,
  });

  return (
    <Link
      href={`/summary/${summary.id}`}
      className={`block rounded-md px-3 py-3 transition-colors hover:bg-muted/50 hover:shadow-sm ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {getFilingBadge(summary.filingType)}
          <span className="text-sm text-muted-foreground truncate">
            {summary.ticker} &middot; {summary.companyName}
          </span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
          {relativeDate}
        </span>
      </div>

      <p className="mt-1.5 text-sm font-medium text-foreground line-clamp-1">
        {subject}
      </p>

      {preview && (
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2 sm:line-clamp-3">
          {preview}
        </p>
      )}

      {summary.importance && (
        <div className="mt-1.5">
          <ImportanceBadge importance={summary.importance} />
        </div>
      )}
    </Link>
  );
}

function Form4GroupCard({ group }: { group: Form4Group }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-0">
      <FeedCard summary={group.primary} />
      <div className="px-3 pb-2">
        <button
          onClick={(e) => {
            e.preventDefault();
            setExpanded(!expanded);
          }}
          aria-expanded={expanded}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {expanded ? "Hide" : `Show ${group.rest.length} more`} insider
          transaction{group.rest.length !== 1 ? "s" : ""} from {group.ticker}
        </button>

        {expanded && (
          <div className="mt-1 space-y-1 border-l-2 border-muted ml-1 pl-3">
            {group.rest.map((summary) => {
              const subject =
                summary.smartSubject ??
                `${summary.companyName} Form 4 Filing`;
              const relativeDate = formatDistanceToNow(
                new Date(summary.filingDate),
                { addSuffix: true }
              );
              return (
                <Link
                  key={summary.id}
                  href={`/summary/${summary.id}`}
                  className="flex items-center justify-between gap-2 py-1 text-sm hover:text-foreground transition-colors"
                >
                  <span className="text-muted-foreground truncate">
                    {subject}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {relativeDate}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
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
            {grouped.map((group) => {
              const processedItems = groupForm4s(group.items);
              return (
                <div key={group.label}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h4>
                  <div className="space-y-1">
                    {processedItems.map((item) =>
                      isForm4Group(item) ? (
                        <Form4GroupCard key={item.key} group={item} />
                      ) : (
                        <FeedCard key={item.id} summary={item} />
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
