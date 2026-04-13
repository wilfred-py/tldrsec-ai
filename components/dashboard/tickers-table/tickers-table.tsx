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

const ITEMS_PER_PAGE = 8;

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

  const pageCount = table.getPageCount();
  const rowsOnCurrentPage = table.getRowModel().rows.length;
  const emptyRowCount = ITEMS_PER_PAGE - rowsOnCurrentPage;

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} style={{ backgroundColor: 'var(--brand-bg-subtle)' }}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="group brand-caption text-xs font-semibold uppercase tracking-wider">
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
            {showInlineAdd && (
              <InlineAddRow
                companies={allCompanies}
                onSelect={onAddTicker}
                onCancel={onCancelAdd}
                columnCount={columns.length}
              />
            )}
            {rowsOnCurrentPage > 0 ? (
              <>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="transition-colors hover:bg-[var(--brand-primary-light)]"
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
                ))}
                {/* Empty rows to maintain consistent height across pages */}
                {emptyRowCount > 0 &&
                  Array.from({ length: emptyRowCount }).map((_, i) => (
                    <TableRow key={`empty-${i}`} className="pointer-events-none">
                      {Array.from({ length: columns.length }).map((_, j) => (
                        <TableCell key={j}>
                          {j === columns.length - 1 ? (
                            <div className="h-8 invisible" />
                          ) : (
                            "\u00A0"
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              </>
            ) : (
              <>
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="py-4 text-center text-muted-foreground"
                  >
                    No companies found.
                  </TableCell>
                </TableRow>
                {/* Fill remaining space when empty */}
                {Array.from({ length: ITEMS_PER_PAGE - 1 }).map((_, i) => (
                  <TableRow key={`empty-${i}`} className="pointer-events-none">
                    {Array.from({ length: columns.length }).map((_, j) => (
                      <TableCell key={j}>
                        {j === columns.length - 1 ? (
                          <div className="h-8 invisible" />
                        ) : (
                          "\u00A0"
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>

        {/* Pagination - always visible */}
        <div className="border-t">
          {pageCount > 1 ? (
            <DataTablePagination table={table} showPageNumbers={true} />
          ) : (
            <div className="flex items-center justify-between px-2 py-4">
              <div className="text-sm text-muted-foreground">
                {data.length > 0 ? "Page 1 of 1" : "0 results"}
              </div>
            </div>
          )}
        </div>
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
        />
      </div>
    </>
  );
}
