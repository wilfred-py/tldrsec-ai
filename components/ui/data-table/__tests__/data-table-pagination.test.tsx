import { render, screen, fireEvent } from "@testing-library/react";
import { DataTablePagination } from "../data-table-pagination";

// Mock table object with pagination functionality
const createMockTable = (overrides = {}) => ({
  getState: jest.fn(() => ({
    pagination: {
      pageIndex: 0,
      pageSize: 10,
    },
  })),
  getPageCount: jest.fn(() => 5),
  getCanPreviousPage: jest.fn(() => false),
  getCanNextPage: jest.fn(() => true),
  previousPage: jest.fn(),
  nextPage: jest.fn(),
  setPageIndex: jest.fn(),
  ...overrides,
});

describe("DataTablePagination", () => {
  test("renders pagination controls", () => {
    const mockTable = createMockTable();
    render(<DataTablePagination table={mockTable} />);
    
    expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
  });

  test("shows correct page information", () => {
    const mockTable = createMockTable({
      getState: jest.fn(() => ({
        pagination: {
          pageIndex: 2,
          pageSize: 10,
        },
      })),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    expect(screen.getByText("Page 3 of 5")).toBeInTheDocument();
  });

  test("disables previous button on first page", () => {
    const mockTable = createMockTable({
      getCanPreviousPage: jest.fn(() => false),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    const prevButton = screen.getByRole("button", { name: /previous/i });
    expect(prevButton).toBeDisabled();
  });

  test("disables next button on last page", () => {
    const mockTable = createMockTable({
      getState: jest.fn(() => ({
        pagination: {
          pageIndex: 4,
          pageSize: 10,
        },
      })),
      getCanNextPage: jest.fn(() => false),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  test("calls previousPage when previous button clicked", () => {
    const mockTable = createMockTable({
      getState: jest.fn(() => ({
        pagination: {
          pageIndex: 1,
          pageSize: 10,
        },
      })),
      getCanPreviousPage: jest.fn(() => true),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    const prevButton = screen.getByRole("button", { name: /previous/i });
    fireEvent.click(prevButton);
    
    expect(mockTable.previousPage).toHaveBeenCalled();
  });

  test("calls nextPage when next button clicked", () => {
    const mockTable = createMockTable();
    render(<DataTablePagination table={mockTable} />);
    
    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);
    
    expect(mockTable.nextPage).toHaveBeenCalled();
  });

  test("renders page number buttons", () => {
    const mockTable = createMockTable();
    render(<DataTablePagination table={mockTable} />);
    
    // Should show page numbers
    const pageButton1 = screen.getByRole("button", { name: "1" });
    expect(pageButton1).toBeInTheDocument();
  });

  test("highlights current page button", () => {
    const mockTable = createMockTable({
      getState: jest.fn(() => ({
        pagination: {
          pageIndex: 2,
          pageSize: 10,
        },
      })),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    const currentPageButton = screen.getByRole("button", { name: "3" });
    expect(currentPageButton).toHaveClass("bg-black");
  });

  test("calls setPageIndex when page number clicked", () => {
    const mockTable = createMockTable();
    render(<DataTablePagination table={mockTable} />);
    
    const pageButton3 = screen.getByRole("button", { name: "3" });
    fireEvent.click(pageButton3);
    
    expect(mockTable.setPageIndex).toHaveBeenCalledWith(2); // 0-indexed
  });

  test("shows ellipsis for many pages", () => {
    const mockTable = createMockTable({
      getPageCount: jest.fn(() => 20),
      getState: jest.fn(() => ({
        pagination: {
          pageIndex: 10,
          pageSize: 10,
        },
      })),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    const ellipsis = screen.getAllByText("...");
    expect(ellipsis.length).toBeGreaterThan(0);
  });

  test("handles single page correctly", () => {
    const mockTable = createMockTable({
      getPageCount: jest.fn(() => 1),
      getCanPreviousPage: jest.fn(() => false),
      getCanNextPage: jest.fn(() => false),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    
    const prevButton = screen.getByRole("button", { name: /previous/i });
    const nextButton = screen.getByRole("button", { name: /next/i });
    
    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeDisabled();
  });

  test("handles empty dataset", () => {
    const mockTable = createMockTable({
      getPageCount: jest.fn(() => 0),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    // Should handle gracefully without crashing
    const paginationDiv = screen.getByRole("navigation") || screen.getByText(/page/i)?.closest("div");
    expect(paginationDiv).toBeInTheDocument();
  });

  test("updates correctly when page changes", () => {
    const mockTable = createMockTable();
    const { rerender } = render(<DataTablePagination table={mockTable} />);
    
    expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
    
    // Update mock to simulate page change
    const updatedMockTable = createMockTable({
      getState: jest.fn(() => ({
        pagination: {
          pageIndex: 1,
          pageSize: 10,
        },
      })),
    });
    
    rerender(<DataTablePagination table={updatedMockTable} />);
    
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  test("handles edge case with zero pages", () => {
    const mockTable = createMockTable({
      getPageCount: jest.fn(() => 0),
      getState: jest.fn(() => ({
        pagination: {
          pageIndex: 0,
          pageSize: 10,
        },
      })),
    });
    
    render(<DataTablePagination table={mockTable} />);
    
    // Should not crash and handle gracefully
    const component = screen.getByRole("navigation") || screen.getByText(/page/i)?.closest("div");
    expect(component).toBeInTheDocument();
  });
});