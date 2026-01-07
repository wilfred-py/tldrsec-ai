"use client";

import { useMemo, useState, useCallback } from "react";
import {
  SortingState,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  flexRender,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/ui/data-table";
import { Company, FilingPreferences, TickerSearchResult } from "@/lib/api/types";
import { getTickersColumns } from "./columns";
import { TickersMobileView } from "./tickers-mobile-view";
import { InlineAddRow } from "@/components/dashboard/inline-add-row";

const ITEMS_PER_PAGE = 10;

interface TickersTableProps {
  data: Company[];
  showInlineAdd: boolean;
  allCompanies: TickerSearchResult[];
  onAddTicker: (symbol: string, name: string) => void;
  onCancelAdd: () => void;
  onPreferenceChange: (
    company: Company,
    key: keyof FilingPreferences,
    value: boolean
  ) => void;
  onDeleteClick: (company: Company) => void;
}

export function TickersTable({
  data,
  showInlineAdd,
  allCompanies,
  onAddTicker,
  onCancelAdd,
  onPreferenceChange,
  onDeleteClick,
}: TickersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  // Format date helper
  const formatDate = useCallback((dateString?: string) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }, []);

  // Memoize columns with callbacks
  const columns = useMemo(
    () =>
      getTickersColumns({
        onPreferenceChange,
        onDelete: onDeleteClick,
        formatDate,
      }),
    [onPreferenceChange, onDeleteClick, formatDate]
  );

  // Initialize table
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageSize: ITEMS_PER_PAGE,
      },
    },
  });

  // Check if pagination is needed
  const hasPagination = data.length > ITEMS_PER_PAGE;

  return (
    <>
      {/* Desktop Table View */}
      {/* Use flex column with fixed height when paginated to prevent layout shift */}
      <div className={`hidden sm:block ${hasPagination ? "h-[530px] flex flex-col" : ""}`}>
        <div className={hasPagination ? "flex-1" : ""}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="group">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {/* Inline Add Row at the top */}
              {showInlineAdd && (
                <InlineAddRow
                  companies={allCompanies}
                  onSelect={onAddTicker}
                  onCancel={onCancelAdd}
                  columnCount={columns.length}
                />
              )}
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No companies found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Desktop Pagination - always at bottom when paginated */}
        {hasPagination && (
          <div className="mt-auto pt-4">
            <DataTablePagination table={table} showPageNumbers={true} />
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden">
        <TickersMobileView
          table={table}
          showInlineAdd={showInlineAdd}
          allCompanies={allCompanies}
          onAddTicker={onAddTicker}
          onCancelAdd={onCancelAdd}
          onPreferenceChange={onPreferenceChange}
          onDelete={onDeleteClick}
          formatDate={formatDate}
          totalCount={data.length}
          pageSize={ITEMS_PER_PAGE}
          hasPagination={hasPagination}
        />
      </div>
    </>
  );
}
