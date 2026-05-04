import { render, screen } from "@testing-library/react";
import DashboardLoading from "../loading";

describe("DashboardLoading", () => {
  test("renders the shell container", () => {
    render(<DashboardLoading />);
    const container = document.querySelector(".space-y-6");
    expect(container).toBeInTheDocument();
  });

  test("includes the sr-only Dashboard heading for accessibility", () => {
    render(<DashboardLoading />);
    const heading = screen.getByRole("heading", { level: 1, name: /dashboard/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass("sr-only");
  });

  test("renders skeleton elements via the shared Skeleton component", () => {
    render(<DashboardLoading />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test("renders the tabs scaffolding with Emails and Tickers triggers", () => {
    render(<DashboardLoading />);
    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /emails/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tickers/i })).toBeInTheDocument();
  });

  test("regression: does NOT render a fake table mock", () => {
    // The previous loading.tsx rendered an 8-row table with pagination that did
    // not match the dashboard's actual card-list UI, producing the visible
    // "skeleton then MORE skeleton" wave. This test guards against re-introducing
    // that mismatched skeleton.
    render(<DashboardLoading />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
  });

  test("renders the activity skeleton inside the activity tab panel", () => {
    render(<DashboardLoading />);
    // ActivitySkeleton renders inside a Card with min-h-[320px] for CLS stability.
    const activityCard = document.querySelector('.min-h-\\[320px\\]');
    expect(activityCard).toBeInTheDocument();
  });
});
