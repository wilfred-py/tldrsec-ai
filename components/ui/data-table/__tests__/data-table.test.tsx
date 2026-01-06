import { render, screen, fireEvent } from "@testing-library/react";
import { DataTable } from "../data-table";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from "@tanstack/react-table";

type TestData = {
  id: string;
  name: string;
  value: number;
  status: string;
};

const columnHelper = createColumnHelper<TestData>();

const mockData: TestData[] = [
  { id: "1", name: "Item 1", value: 100, status: "active" },
  { id: "2", name: "Item 2", value: 200, status: "inactive" },
  { id: "3", name: "Item 3", value: 300, status: "active" },
  { id: "4", name: "Item 4", value: 400, status: "pending" },
  { id: "5", name: "Item 5", value: 500, status: "active" },
];

const mockColumns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => <span>{info.getValue()}</span>,
  }),
  columnHelper.accessor("value", {
    header: "Value",
    cell: (info) => <span>${info.getValue()}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <span className={`status-${info.getValue()}`}>{info.getValue()}</span>
    ),
  }),
];

describe("DataTable", () => {
  const defaultProps = {
    data: mockData,
    columns: mockColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  };

  test("renders table with data", () => {
    render(<DataTable {...defaultProps} />);
    
    // Check headers
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    
    // Check data rows
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  test("renders all data rows", () => {
    render(<DataTable {...defaultProps} />);
    
    mockData.forEach((item) => {
      expect(screen.getByText(item.name)).toBeInTheDocument();
      expect(screen.getByText(`$${item.value}`)).toBeInTheDocument();
      expect(screen.getByText(item.status)).toBeInTheDocument();
    });
  });

  test("handles empty data gracefully", () => {
    render(<DataTable {...defaultProps} data={[]} />);
    
    // Should still render table structure
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    
    // Headers should still be present
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  test("applies correct table structure", () => {
    render(<DataTable {...defaultProps} />);
    
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    
    const thead = table.querySelector("thead");
    expect(thead).toBeInTheDocument();
    
    const tbody = table.querySelector("tbody");
    expect(tbody).toBeInTheDocument();
  });

  test("renders correct number of rows", () => {
    render(<DataTable {...defaultProps} />);
    
    const rows = screen.getAllByRole("row");
    // Should have header row + data rows
    expect(rows).toHaveLength(mockData.length + 1);
  });

  test("handles single row data", () => {
    const singleRowData = [mockData[0]];
    render(<DataTable {...defaultProps} data={singleRowData} />);
    
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2); // header + 1 data row
  });

  test("handles missing data properties gracefully", () => {
    const incompleteData: Partial<TestData>[] = [
      { id: "1", name: "Item 1" }, // missing value and status
      { id: "2", value: 200 }, // missing name and status
    ];
    
    render(<DataTable {...defaultProps} data={incompleteData as TestData[]} />);
    
    // Should not crash and should render what data is available
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
  });

  test("applies custom cell rendering", () => {
    render(<DataTable {...defaultProps} />);
    
    // Check that custom value formatting is applied
    expect(screen.getByText("$100")).toBeInTheDocument();
    expect(screen.getByText("$200")).toBeInTheDocument();
    
    // Check that custom status classes might be applied
    const statusElements = screen.getAllByText("active");
    statusElements.forEach((element) => {
      expect(element).toBeInTheDocument();
    });
  });

  test("maintains table accessibility", () => {
    render(<DataTable {...defaultProps} />);
    
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    
    // Check for proper table structure
    const columnheaders = screen.getAllByRole("columnheader");
    expect(columnheaders).toHaveLength(3);
    
    const cells = screen.getAllByRole("cell");
    expect(cells.length).toBeGreaterThan(0);
  });

  test("handles large datasets", () => {
    const largeData = Array.from({ length: 100 }, (_, i) => ({
      id: String(i + 1),
      name: `Item ${i + 1}`,
      value: (i + 1) * 100,
      status: i % 2 === 0 ? "active" : "inactive",
    }));

    render(<DataTable {...defaultProps} data={largeData} />);
    
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    
    // Should render without performance issues
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 100")).toBeInTheDocument();
  });
});