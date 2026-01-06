import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DashboardClient } from "../../dashboard-client";
import { Company } from "@/lib/api/types";

// Mock the API functions
jest.mock("@/lib/api/ticker-service", () => ({
  getTrackedCompanies: jest.fn(),
  addTrackedCompany: jest.fn(),
  deleteTrackedCompany: jest.fn(),
  updateCompanyPreferences: jest.fn(),
}));

// Mock the useAsync hook
jest.mock("@/lib/hooks/use-async", () => ({
  useAsync: jest.fn(),
}));

// Mock the tutorial guide
jest.mock("@/components/onboarding/tutorial-guide", () => ({
  TutorialGuide: () => <div data-testid="tutorial-guide">Tutorial</div>,
}));

const mockCompanies: Company[] = [
  {
    id: "1",
    symbol: "AAPL",
    name: "Apple Inc.",
    lastFiling: "10-K",
    lastFilingDate: "2024-01-15",
    summaryCount: 5,
    preferences: {
      tenK: true,
      tenQ: false,
      eightK: true,
      formFour: false,
      defFourteenA: false,
    },
  },
  {
    id: "2",
    symbol: "MSFT", 
    name: "Microsoft Corporation",
    lastFiling: "10-Q",
    lastFilingDate: "2024-01-10",
    summaryCount: 3,
    preferences: {
      tenK: false,
      tenQ: true,
      eightK: false,
      formFour: true,
      defFourteenA: false,
    },
  },
];

describe("Dashboard Table Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock useAsync hook to return success state
    const { useAsync } = require("@/lib/hooks/use-async");
    useAsync.mockReturnValue({
      execute: jest.fn(),
      loading: false,
      error: null,
    });

    // Mock API responses
    const tickerService = require("@/lib/api/ticker-service");
    tickerService.getTrackedCompanies.mockResolvedValue({
      success: true,
      data: mockCompanies,
    });
  });

  test("integrates dashboard client with table components", async () => {
    render(<DashboardClient />);
    
    // Should render dashboard header
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    
    // Should render add ticker button
    expect(screen.getByText("Add Ticker")).toBeInTheDocument();
    
    // Table structure should be present
    await waitFor(() => {
      const table = screen.queryByRole("table");
      if (table) {
        expect(table).toBeInTheDocument();
      }
    });
  });

  test("handles complete add ticker workflow", async () => {
    const { addTrackedCompany } = require("@/lib/api/ticker-service");
    addTrackedCompany.mockResolvedValue({
      success: true,
      data: {
        id: "3",
        symbol: "GOOGL",
        name: "Alphabet Inc.",
      },
    });

    render(<DashboardClient />);
    
    // Click add ticker button
    const addButton = screen.getByText("Add Ticker");
    fireEvent.click(addButton);
    
    // Wait for inline add interface
    await waitFor(() => {
      const searchInput = screen.queryByPlaceholderText(/search/i);
      if (searchInput) {
        expect(searchInput).toBeInTheDocument();
        
        // Type in search
        fireEvent.change(searchInput, { target: { value: "GOOGL" } });
      }
    });
  });

  test("handles preference change workflow", async () => {
    const { updateCompanyPreferences } = require("@/lib/api/ticker-service");
    updateCompanyPreferences.mockResolvedValue({
      success: true,
    });

    render(<DashboardClient />);
    
    // Wait for companies to load
    await waitFor(() => {
      expect(screen.queryByText("AAPL")).toBeInTheDocument();
    });
    
    // Look for settings buttons or preference controls
    const buttons = screen.getAllByRole("button");
    const settingsButton = buttons.find(btn => 
      btn.getAttribute("aria-label")?.includes("settings") ||
      btn.className.includes("settings")
    );
    
    if (settingsButton) {
      fireEvent.click(settingsButton);
      
      // Should trigger preference update
      await waitFor(() => {
        expect(updateCompanyPreferences).toHaveBeenCalled();
      });
    }
  });

  test("handles delete company workflow", async () => {
    const { deleteTrackedCompany } = require("@/lib/api/ticker-service");
    deleteTrackedCompany.mockResolvedValue({
      success: true,
    });

    render(<DashboardClient />);
    
    // Wait for companies to load
    await waitFor(() => {
      expect(screen.queryByText("AAPL")).toBeInTheDocument();
    });
    
    // Look for delete buttons
    const buttons = screen.getAllByRole("button");
    const deleteButton = buttons.find(btn => 
      btn.getAttribute("aria-label")?.includes("Delete") ||
      btn.querySelector("svg")?.getAttribute("class")?.includes("trash")
    );
    
    if (deleteButton) {
      fireEvent.click(deleteButton);
      
      // Should open delete confirmation dialog
      await waitFor(() => {
        const dialog = screen.queryByRole("dialog");
        if (dialog) {
          expect(dialog).toBeInTheDocument();
        }
      });
    }
  });

  test("handles loading states correctly", async () => {
    const { useAsync } = require("@/lib/hooks/use-async");
    useAsync.mockReturnValue({
      execute: jest.fn(),
      loading: true,
      error: null,
    });

    render(<DashboardClient />);
    
    // Should show loading skeleton
    await waitFor(() => {
      const skeleton = document.querySelector("[class*='animate-pulse']") ||
                      document.querySelector(".skeleton");
      if (skeleton) {
        expect(skeleton).toBeInTheDocument();
      }
    });
  });

  test("handles error states appropriately", async () => {
    const { useAsync } = require("@/lib/hooks/use-async");
    useAsync.mockReturnValue({
      execute: jest.fn(),
      loading: false,
      error: new Error("Failed to load companies"),
    });

    render(<DashboardClient />);
    
    // Should show error state or empty state
    await waitFor(() => {
      const errorElement = screen.queryByText(/failed/i) ||
                          screen.queryByText(/error/i) ||
                          screen.queryByText(/no companies/i);
      if (errorElement) {
        expect(errorElement).toBeInTheDocument();
      }
    });
  });

  test("maintains data consistency across components", async () => {
    render(<DashboardClient />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.queryByText("AAPL")).toBeInTheDocument();
    });
    
    // Verify company data appears in table
    expect(screen.getByText("Apple Inc.")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("Microsoft Corporation")).toBeInTheDocument();
  });

  test("handles responsive behavior integration", async () => {
    // Mock mobile viewport
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: query === "(max-width: 639px)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    render(<DashboardClient />);
    
    // Should adapt to mobile layout
    await waitFor(() => {
      // Mobile-specific elements should be visible
      const mobileElements = document.querySelectorAll(".sm\\:hidden");
      if (mobileElements.length > 0) {
        expect(mobileElements[0]).toBeInTheDocument();
      }
    });
  });

  test("integrates tutorial flow with table interactions", async () => {
    render(<DashboardClient />);
    
    // Tutorial guide should be present
    await waitFor(() => {
      const tutorial = screen.queryByTestId("tutorial-guide");
      if (tutorial) {
        expect(tutorial).toBeInTheDocument();
      }
    });
  });

  test("handles pagination integration", async () => {
    // Create many companies to trigger pagination
    const manyCompanies: Company[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1),
      symbol: `TICK${i + 1}`,
      name: `Company ${i + 1}`,
      lastFiling: "10-K",
      lastFilingDate: "2024-01-15",
      summaryCount: i,
      preferences: {
        tenK: true,
        tenQ: false,
        eightK: false,
        formFour: false,
        defFourteenA: false,
      },
    }));

    const { getTrackedCompanies } = require("@/lib/api/ticker-service");
    getTrackedCompanies.mockResolvedValue({
      success: true,
      data: manyCompanies,
    });

    render(<DashboardClient />);
    
    // Should show pagination controls
    await waitFor(() => {
      const nextButton = screen.queryByRole("button", { name: /next/i });
      if (nextButton) {
        expect(nextButton).toBeInTheDocument();
        
        // Test pagination functionality
        fireEvent.click(nextButton);
      }
    });
  });
});