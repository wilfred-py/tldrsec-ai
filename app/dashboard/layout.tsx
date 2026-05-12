import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// Layout intentionally has NO force-dynamic. force-dynamic at the layout level
// cascaded the directive to every /dashboard/** child page, which combined
// with Next 15's default staleTimes.dynamic=0 meant back-navigation re-rendered
// the dashboard from scratch every time (~5s wait).
//
// Sub-pages that need request-time render carry force-dynamic themselves; pure
// client sub-pages (usage, email-logs) static-prerender as empty shells. With
// experimental.staleTimes set in next.config.js, back-nav within 10s hits the
// Router Cache and renders instantly.
//
// See: streaming-perf-v2 Subtask 2 + CLAUDE.md item #18.

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <DashboardShell>{children}</DashboardShell>;
}
