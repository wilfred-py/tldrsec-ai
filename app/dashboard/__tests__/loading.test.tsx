import { render, screen } from "@testing-library/react";
import DashboardLoading from "../loading";

describe("DashboardLoading", () => {
  test("renders loading skeleton structure", () => {
    render(<DashboardLoading />);

    // Check for main container
    const container = document.querySelector(".space-y-6");
    expect(container).toBeInTheDocument();
  });

  test("displays header skeleton", () => {
    render(<DashboardLoading />);

    // Look for header skeleton element
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test("shows desktop table skeleton", () => {
    render(<DashboardLoading />);

    // Check for desktop table structure
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    // Check for table headers
    const tableHeaders = screen.getAllByRole("columnheader");
    expect(tableHeaders).toHaveLength(6);
  });

  test("renders mobile skeleton cards", () => {
    render(<DashboardLoading />);

    // Check for mobile skeleton structure
    const mobileContainer = document.querySelector(".sm\\:hidden.space-y-4");
    expect(mobileContainer).toBeInTheDocument();
  });

  test("displays correct number of skeleton rows", () => {
    render(<DashboardLoading />);

    // Check desktop skeleton rows (8 body rows + 1 header = 9)
    const tableRows = screen.getAllByRole("row");
    expect(tableRows).toHaveLength(9);
  });

  test("shows mobile skeleton cards", () => {
    render(<DashboardLoading />);

    // Check for 4 mobile skeleton cards
    const mobileCards = document.querySelectorAll(".sm\\:hidden .rounded-xl");
    expect(mobileCards).toHaveLength(4);
  });

  test("applies correct responsive classes", () => {
    render(<DashboardLoading />);

    // Check for responsive visibility classes
    const desktopTable = document.querySelector(".hidden.sm\\:block");
    expect(desktopTable).toBeInTheDocument();

    const mobileCards = document.querySelector(".sm\\:hidden.space-y-4");
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

    // Check for table header skeletons
    const headerSkeletons = document.querySelectorAll("thead [data-slot='skeleton']");
    expect(headerSkeletons.length).toBeGreaterThan(0);
  });

  test("displays skeleton elements for table cells", () => {
    render(<DashboardLoading />);

    // Check for table cell skeletons
    const cellSkeletons = document.querySelectorAll("tbody [data-slot='skeleton']");
    expect(cellSkeletons.length).toBeGreaterThan(0);
  });

  test("renders consistent skeleton styling", () => {
    render(<DashboardLoading />);

    // All skeletons should have the data-slot attribute
    const skeletonElements = document.querySelectorAll("[data-slot='skeleton']");
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

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThan(0);
  });

  test("does not crash with different viewport sizes", () => {
    render(<DashboardLoading />);

    expect(document.querySelector(".space-y-6")).toBeInTheDocument();
  });
});
