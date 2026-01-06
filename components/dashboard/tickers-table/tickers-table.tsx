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

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden sm:block">
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

        {/* Desktop Pagination */}
        {data.length > ITEMS_PER_PAGE && (
          <DataTablePagination table={table} showPageNumbers={true} />
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
        />
      </div>
    </>
  );
}
