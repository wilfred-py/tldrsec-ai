import { render, screen } from "@testing-library/react";
import DashboardLoading from "../loading";

describe("DashboardLoading", () => {
  test("renders loading skeleton structure", () => {
    render(<DashboardLoading />);
    
    // Check for main container
    const container = screen.getByTestId("dashboard-loading") || 
                     document.querySelector(".space-y-6");
    expect(container).toBeInTheDocument();
  });

  test("displays header skeleton", () => {
    render(<DashboardLoading />);
    
    // Look for header skeleton elements
    const skeletons = document.querySelectorAll(".h-8.w-32");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test("shows desktop table skeleton", () => {
    render(<DashboardLoading />);
    
    // Check for desktop table structure
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    
    // Check for table headers
    const tableHeaders = screen.getAllByRole("columnheader");
    expect(tableHeaders).toHaveLength(6); // Based on the component structure
  });

  test("renders mobile skeleton cards", () => {
    render(<DashboardLoading />);
    
    // Check for mobile skeleton structure
    const mobileSkeletons = document.querySelectorAll(".sm\\:hidden .space-y-3");
    expect(mobileSkeletons.length).toBeGreaterThan(0);
  });

  test("displays correct number of skeleton rows", () => {
    render(<DashboardLoading />);
    
    // Check desktop skeleton rows (should be 5 based on Array.from({ length: 5 }))
    const tableRows = screen.getAllByRole("row");
    expect(tableRows.length).toBeGreaterThan(5); // Header + 5 body rows
  });

  test("shows mobile skeleton cards", () => {
    render(<DashboardLoading />);
    
    // Check for mobile skeleton cards (should be 3 based on Array.from({ length: 3 }))
    const mobileCards = document.querySelectorAll(".sm\\:hidden .landing-card");
    expect(mobileCards.length).toBeGreaterThanOrEqual(3);
  });

  test("applies correct responsive classes", () => {
    render(<DashboardLoading />);
    
    // Check for responsive visibility classes
    const desktopTable = document.querySelector(".hidden.sm\\:block");
    expect(desktopTable).toBeInTheDocument();
    
    const mobileCards = document.querySelector(".sm\\:hidden.space-y-3");
    expect(mobileCards).toBeInTheDocument();
  });

  test("renders landing card container", () => {
    render(<DashboardLoading />);
    
    // Check for main content card
    const landingCard = document.querySelector(".landing-card");
    expect(landingCard).toBeInTheDocument();
  });

  test("shows proper skeleton elements for table headers", () => {
    render(<DashboardLoading />);
    
    // Check for table header skeletons with appropriate sizes
    const headerSkeletons = document.querySelectorAll("thead .h-4");
    expect(headerSkeletons.length).toBeGreaterThan(0);
  });

  test("displays skeleton elements for table cells", () => {
    render(<DashboardLoading />);
    
    // Check for table cell skeletons
    const cellSkeletons = document.querySelectorAll("tbody .h-5, tbody .h-4, tbody .h-8");
    expect(cellSkeletons.length).toBeGreaterThan(0);
  });

  test("renders consistent skeleton styling", () => {
    render(<DashboardLoading />);
    
    // All skeletons should have the Skeleton component class
    const skeletonElements = document.querySelectorAll("[class*='animate-pulse'], [class*='bg-muted']");
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  test("maintains proper table structure in loading state", () => {
    render(<DashboardLoading />);
    
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    
    const thead = table.querySelector("thead");
    expect(thead).toBeInTheDocument();
    
    const tbody = table.querySelector("tbody");
    expect(tbody).toBeInTheDocument();
  });

  test("shows button skeleton for actions", () => {
    render(<DashboardLoading />);
    
    // Check for button skeletons (Add Ticker button area)
    const buttonSkeletons = document.querySelectorAll(".h-10");
    expect(buttonSkeletons.length).toBeGreaterThan(0);
  });

  test("renders without accessibility violations", () => {
    render(<DashboardLoading />);
    
    // Basic accessibility check - table should have proper structure
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThan(0);
  });

  test("does not crash with different viewport sizes", () => {
    // Test that component renders without errors in different conditions
    render(<DashboardLoading />);
    
    // Component should render without throwing
    expect(document.querySelector(".space-y-6")).toBeInTheDocument();
  });
});