"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  featuredSummaries?: ActivitySummary[];
}

const IMPORTANCE_BORDER: Record<string, string> = {
  critical: "border-l-4 border-l-red-600",
  high: "border-l-4 border-l-red-500",
  medium: "border-l-4 border-l-amber-500",
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

/** Filing badge colors matching the landing page gmail-inbox-hero */
function getFilingBadgeColor(filingType: string): string {
  const upper = filingType.toUpperCase();

  if (upper.includes("10-K") || upper.includes("10K")) {
    return "bg-purple-100 text-purple-700 border-purple-200";
  }
  if (upper.includes("10-Q") || upper.includes("10Q")) {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }
  if (upper.includes("8-K") || upper.includes("8K")) {
    return "bg-orange-100 text-orange-700 border-orange-200";
  }
  if (upper.includes("FORM 4") || upper === "4" || upper === "FORM4" || upper === "144") {
    return "bg-green-100 text-green-700 border-green-200";
  }
  if (upper.includes("DEFA14A") || upper.includes("DEF 14A")) {
    return "bg-red-100 text-red-700 border-red-200";
  }
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function getFilingBadge(filingType: string) {
  const formatted = formatFilingType(filingType);
  const upper = filingType.toUpperCase();
  const label = (upper.includes("FORM 4") || upper === "4" || upper === "FORM4") ? "Form 4" : formatted;
  const colorClass = getFilingBadgeColor(filingType);

  return (
    <Badge className={`${colorClass} border text-[10px] px-1.5 py-0 font-medium`}>
      {label}
    </Badge>
  );
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
    return text.length > 120 ? text.substring(0, 120) + "..." : text;
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

  result.push(...nonForm4s, ...form4Entries);
  return result;
}

function isForm4Group(item: ActivitySummary | Form4Group): item is Form4Group {
  return "primary" in item && "rest" in item;
}

function ImportanceBadge({ importance }: { importance: string | null }) {
  if (!importance) return null;
  const level = importance.toLowerCase();
  if (level !== "critical" && level !== "high") return null;
  const colorClass = level === "critical"
    ? "bg-red-600 text-white"
    : "bg-red-500 text-white";
  return (
    <Badge
      className={`${colorClass} border-transparent text-[10px] uppercase tracking-wide`}
    >
      {importance}
    </Badge>
  );
}

function FeedCard({ summary, showEmailBadge = true }: { summary: ActivitySummary; showEmailBadge?: boolean }) {
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
      className={`block border-b border-[var(--brand-border)] px-3 py-3 transition-colors hover:bg-[var(--brand-bg-subtle)] ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {getFilingBadge(summary.filingType)}
          <span className="text-sm text-[var(--brand-text-muted)] truncate">
            {summary.ticker} &middot; {summary.companyName}
          </span>
        </div>
        <span className="text-xs text-[var(--brand-text-muted)] whitespace-nowrap flex-shrink-0">
          {relativeDate}
        </span>
      </div>

      <p className="mt-1.5 text-sm font-medium text-[var(--brand-secondary)] line-clamp-1">
        {subject}
      </p>

      {preview && (
        <p className="mt-1 text-sm text-[var(--brand-text-muted)] line-clamp-1">
          {preview}
        </p>
      )}

      <div className="mt-1.5 flex items-center gap-3">
        {showEmailBadge && (
          <span className="flex items-center gap-1 text-xs text-[var(--brand-text-muted)]">
            <Mail className="h-3 w-3" />
            Emailed
          </span>
        )}
        {summary.importance && <ImportanceBadge importance={summary.importance} />}
      </div>
    </Link>
  );
}

function Form4GroupCard({ group, showEmailBadge = true }: { group: Form4Group; showEmailBadge?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-0">
      <FeedCard summary={group.primary} showEmailBadge={showEmailBadge} />
      <div className="px-3 pb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            setExpanded(!expanded);
          }}
          aria-expanded={expanded}
          className="h-auto p-0 text-xs text-[var(--brand-text-muted)] hover:text-[var(--brand-secondary)] gap-1"
        >
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {expanded ? "Hide" : `Show ${group.rest.length} more`} insider
          transaction{group.rest.length !== 1 ? "s" : ""} from {group.ticker}
        </Button>

        {expanded && (
          <div className="mt-1 space-y-1 border-l-2 border-[var(--brand-border)] ml-1 pl-3">
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
                  className="flex items-center justify-between gap-2 py-1 text-sm hover:text-[var(--brand-secondary)] transition-colors"
                >
                  <span className="text-[var(--brand-text-muted)] truncate">
                    {subject}
                  </span>
                  <span className="text-xs text-[var(--brand-text-muted)] whitespace-nowrap flex-shrink-0">
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

const INITIAL_VISIBLE = 10;

function DateGroupedFeed({ groups, showEmailBadge = true }: { groups: GroupedSummaries[]; showEmailBadge?: boolean }) {
  return (
    <>
      {groups.map((group, idx) => {
        const processedItems = groupForm4s(group.items);
        return (
          <div key={group.label}>
            {idx > 0 && <Separator className="my-4 mx-3" />}
            <h4 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--brand-text-muted)]">
              {group.label}
            </h4>
            <div>
              {processedItems.map((item) =>
                isForm4Group(item) ? (
                  <Form4GroupCard key={item.key} group={item} showEmailBadge={showEmailBadge} />
                ) : (
                  <FeedCard key={item.id} summary={item} showEmailBadge={showEmailBadge} />
                )
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function ActivityFeed({ summaries, featuredSummaries = [] }: ActivityFeedProps) {
  const [showAll, setShowAll] = useState(false);
  const grouped = groupSummaries(summaries);
  const showFeatured = grouped.length === 0 && featuredSummaries.length > 0;
  const featuredGrouped = showFeatured ? groupSummaries(featuredSummaries) : [];

  const visibleGrouped = (() => {
    if (showAll || summaries.length <= INITIAL_VISIBLE) return grouped;
    const limitedSummaries = summaries.slice(0, INITIAL_VISIBLE);
    return groupSummaries(limitedSummaries);
  })();

  const hasMore = !showAll && summaries.length > INITIAL_VISIBLE;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--brand-secondary)] mb-4">
        <FileText className="h-4 w-4 text-[var(--brand-primary)]" />
        {showFeatured ? "Example Filing Summaries" : "Filing Summaries"}
      </div>
      <div className="overflow-hidden">
        {showFeatured ? (
          <>
            <p className="text-sm text-[var(--brand-text-muted)] px-3 py-3 border-b border-[var(--brand-border)]">
              Here&apos;s what our AI does with real SEC filings. Your personalized summaries will appear here as new filings come in for your tracked companies.
            </p>
            <DateGroupedFeed groups={featuredGrouped} showEmailBadge={false} />
          </>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)] px-3 py-6 text-center">
            Your first email summaries are on the way! We&apos;ll email you when
            filings come in.
          </p>
        ) : (
          <>
            <DateGroupedFeed groups={visibleGrouped} />
            {hasMore && (
              <div className="py-3 text-center border-t border-[var(--brand-border)]">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll(true)}
                  className="text-[var(--brand-text-muted)] hover:text-[var(--brand-secondary)]"
                >
                  Show all summaries
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
