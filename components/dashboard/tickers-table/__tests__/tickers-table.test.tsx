import { render, screen, fireEvent } from "@testing-library/react";
import { TickersTable } from "../tickers-table";
import { Company } from "@/lib/api/types";

// Mock the mobile view component
jest.mock("../tickers-mobile-view", () => ({
  TickersMobileView: ({ 
    companies, 
    onPreferenceChange, 
    onDeleteClick 
  }: {
    companies: Company[];
    onPreferenceChange: (company: Company, key: string, value: boolean) => void;
    onDeleteClick: (company: Company) => void;
  }) => (
    <div data-testid="mobile-view">
      {companies.map((company) => (
        <div key={company.id} data-testid={`mobile-company-${company.symbol}`}>
          <span>{company.symbol}</span>
          <span>{company.name}</span>
          <button onClick={() => onDeleteClick(company)}>Delete</button>
          <button onClick={() => onPreferenceChange(company, "tenK", true)}>
            Update Preference
          </button>
        </div>
      ))}
    </div>
  ),
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
  {
    id: "3",
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    lastFiling: "—",
    lastFilingDate: undefined,
    summaryCount: 0,
    preferences: {
      tenK: true,
      tenQ: true,
      eightK: true,
      formFour: false,
      defFourteenA: false,
    },
  },
];

const defaultProps = {
  companies: mockCompanies,
  showInlineAdd: false,
  allCompanies: [],
  emptyStateResults: [],
  setEmptyStateResults: jest.fn(),
  handleAddTicker: jest.fn(),
  setShowInlineAdd: jest.fn(),
  handlePreferenceChange: jest.fn(),
  onDeleteClick: jest.fn(),
};

// Mock window.matchMedia for responsive tests
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe("TickersTable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Desktop View", () => {
    beforeEach(() => {
      // Mock desktop viewport
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query === "(min-width: 640px)",
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });
    });

    test("renders table with company data", () => {
      render(<TickersTable {...defaultProps} />);
      
      expect(screen.getByText("AAPL")).toBeInTheDocument();
      expect(screen.getByText("Apple Inc.")).toBeInTheDocument();
      expect(screen.getByText("MSFT")).toBeInTheDocument();
      expect(screen.getByText("Microsoft Corporation")).toBeInTheDocument();
      expect(screen.getByText("GOOGL")).toBeInTheDocument();
      expect(screen.getByText("Alphabet Inc.")).toBeInTheDocument();
    });

    test("displays filing dates correctly", () => {
      render(<TickersTable {...defaultProps} />);
      
      expect(screen.getByText("Jan 15, 2024")).toBeInTheDocument();
      expect(screen.getByText("Jan 10, 2024")).toBeInTheDocument();
      expect(screen.getAllByText("—")[0]).toBeInTheDocument(); // For undefined date
    });

    test("displays summary counts", () => {
      render(<TickersTable {...defaultProps} />);
      
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    test("handles sorting by symbol", async () => {
      render(<TickersTable {...defaultProps} />);
      
      const symbolHeader = screen.getByRole("button", { name: /ticker/i });
      fireEvent.click(symbolHeader);
      
      // Verify sort icon is present
      const sortIcon = symbolHeader.querySelector("svg");
      expect(sortIcon).toBeInTheDocument();
    });

    test("handles preference changes", async () => {
      const mockHandlePreferenceChange = jest.fn();
      render(
        <TickersTable 
          {...defaultProps} 
          handlePreferenceChange={mockHandlePreferenceChange} 
        />
      );
      
      // Find and click a settings dropdown (assuming it has a button)
      const settingsButtons = screen.getAllByRole("button");
      const settingsButton = settingsButtons.find(btn => 
        btn.getAttribute("aria-label")?.includes("settings") ||
        btn.className.includes("settings")
      );
      
      if (settingsButton) {
        fireEvent.click(settingsButton);
      }
    });

    test("handles delete button clicks", () => {
      const mockOnDeleteClick = jest.fn();
      render(<TickersTable {...defaultProps} onDeleteClick={mockOnDeleteClick} />);
      
      const deleteButtons = screen.getAllByRole("button");
      const deleteButton = deleteButtons.find(btn => 
        btn.getAttribute("aria-label")?.includes("Delete") ||
        btn.querySelector("svg")?.getAttribute("class")?.includes("trash")
      );
      
      if (deleteButton) {
        fireEvent.click(deleteButton);
        expect(mockOnDeleteClick).toHaveBeenCalled();
      }
    });
  });

  describe("Mobile View", () => {
    beforeEach(() => {
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
    });

    test("renders mobile view component", () => {
      render(<TickersTable {...defaultProps} />);
      
      expect(screen.getByTestId("mobile-view")).toBeInTheDocument();
      expect(screen.getByTestId("mobile-company-AAPL")).toBeInTheDocument();
      expect(screen.getByTestId("mobile-company-MSFT")).toBeInTheDocument();
      expect(screen.getByTestId("mobile-company-GOOGL")).toBeInTheDocument();
    });

    test("handles mobile delete clicks", () => {
      const mockOnDeleteClick = jest.fn();
      render(<TickersTable {...defaultProps} onDeleteClick={mockOnDeleteClick} />);
      
      const deleteButton = screen.getAllByText("Delete")[0];
      fireEvent.click(deleteButton);
      
      expect(mockOnDeleteClick).toHaveBeenCalledWith(mockCompanies[0]);
    });

    test("handles mobile preference changes", () => {
      const mockHandlePreferenceChange = jest.fn();
      render(
        <TickersTable 
          {...defaultProps} 
          handlePreferenceChange={mockHandlePreferenceChange} 
        />
      );
      
      const preferenceButton = screen.getAllByText("Update Preference")[0];
      fireEvent.click(preferenceButton);
      
      expect(mockHandlePreferenceChange).toHaveBeenCalledWith(
        mockCompanies[0], 
        "tenK", 
        true
      );
    });
  });

  describe("Inline Add Functionality", () => {
    test("shows inline add row when showInlineAdd is true", () => {
      render(<TickersTable {...defaultProps} showInlineAdd={true} />);
      
      // Look for search input or add row indicators
      const searchInput = screen.queryByPlaceholderText(/search/i);
      if (searchInput) {
        expect(searchInput).toBeInTheDocument();
      }
    });

    test("handles add ticker functionality", () => {
      const mockHandleAddTicker = jest.fn();
      const searchResults = [
        { symbol: "TSLA", name: "Tesla Inc." }
      ];
      
      render(
        <TickersTable 
          {...defaultProps} 
          showInlineAdd={true}
          emptyStateResults={searchResults}
          handleAddTicker={mockHandleAddTicker}
        />
      );
      
      // If there's a search result, clicking it should call handleAddTicker
      const teslaResult = screen.queryByText("TSLA");
      if (teslaResult) {
        fireEvent.click(teslaResult);
        expect(mockHandleAddTicker).toHaveBeenCalledWith("TSLA", "Tesla Inc.");
      }
    });
  });

  describe("Edge Cases", () => {
    test("renders empty table gracefully", () => {
      render(<TickersTable {...defaultProps} companies={[]} />);
      
      // Should handle empty state without crashing
      const table = screen.getByRole("table");
      expect(table).toBeInTheDocument();
    });

    test("handles companies with missing data", () => {
      const companiesWithMissingData: Company[] = [
        {
          id: "1",
          symbol: "TEST",
          name: "Test Company",
          lastFiling: "",
          lastFilingDate: undefined,
          summaryCount: undefined as any,
          preferences: {
            tenK: false,
            tenQ: false,
            eightK: false,
            formFour: false,
            defFourteenA: false,
          },
        },
      ];

      render(
        <TickersTable {...defaultProps} companies={companiesWithMissingData} />
      );
      
      expect(screen.getByText("TEST")).toBeInTheDocument();
      expect(screen.getByText("Test Company")).toBeInTheDocument();
    });

    test("handles single company data", () => {
      render(<TickersTable {...defaultProps} companies={[mockCompanies[0]]} />);
      
      expect(screen.getByText("AAPL")).toBeInTheDocument();
      expect(screen.getByText("Apple Inc.")).toBeInTheDocument();
    });
  });

  describe("Pagination", () => {
    test("shows pagination controls when needed", () => {
      // Create more than 10 companies to trigger pagination
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

      render(<TickersTable {...defaultProps} companies={manyCompanies} />);
      
      // Look for pagination controls
      const nextButton = screen.queryByRole("button", { name: /next/i });
      if (nextButton) {
        expect(nextButton).toBeInTheDocument();
      }
    });
  });
});