"use client";

import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  className?: string;
  showPageNumbers?: boolean;
}

export function DataTablePagination<TData>({
  table,
  className,
  showPageNumbers = true,
}: DataTablePaginationProps<TData>) {
  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  // Generate page numbers with ellipsis logic
  const getPageNumbers = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];

    // Always show first page
    pages.push(0);

    if (pageCount <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i < pageCount - 1; i++) {
        pages.push(i);
      }
    } else {
      // Show ellipsis for many pages
      if (currentPage > 2) {
        pages.push("ellipsis");
      }
      // Show pages around current
      const start = Math.max(1, currentPage - 1);
      const end = Math.min(pageCount - 2, currentPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (currentPage < pageCount - 3) {
        pages.push("ellipsis");
      }
    }

    // Always show last page if more than 1 page
    if (pageCount > 1 && !pages.includes(pageCount - 1)) {
      pages.push(pageCount - 1);
    }

    return pages;
  };

  if (pageCount <= 1) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-4",
        className
      )}
    >
      <div className="text-sm text-muted-foreground">
        Page {currentPage + 1} of {pageCount}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {showPageNumbers &&
          getPageNumbers().map((page, idx) =>
            page === "ellipsis" ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-2 text-muted-foreground"
              >
                ...
              </span>
            ) : (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "ghost"}
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-full transition-colors",
                  currentPage === page
                    ? "bg-black text-white hover:bg-black"
                    : "hover:bg-black hover:text-white"
                )}
                onClick={() => table.setPageIndex(page)}
              >
                {page + 1}
              </Button>
            )
          )}

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Simplified mobile pagination
export function DataTablePaginationMobile<TData>({
  table,
  className,
}: Omit<DataTablePaginationProps<TData>, "showPageNumbers">) {
  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  // Simplified page numbers for mobile
  const getMobilePageNumbers = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];

    if (pageCount <= 5) {
      for (let i = 0; i < pageCount; i++) {
        pages.push(i);
      }
    } else {
      pages.push(0);
      if (currentPage > 1) pages.push("ellipsis");
      if (currentPage > 0 && currentPage < pageCount - 1) {
        pages.push(currentPage);
      }
      if (currentPage < pageCount - 2) pages.push("ellipsis");
      pages.push(pageCount - 1);
    }

    return pages;
  };

  if (pageCount <= 1) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 px-2 py-4",
        className
      )}
    >
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => table.previousPage()}
        disabled={!table.getCanPreviousPage()}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {getMobilePageNumbers().map((page, idx) =>
        page === "ellipsis" ? (
          <span
            key={`m-ellipsis-${idx}`}
            className="px-1 text-muted-foreground text-sm"
          >
            ...
          </span>
        ) : (
          <Button
            key={page}
            variant={currentPage === page ? "default" : "ghost"}
            size="icon"
            className={cn(
              "h-8 w-8 text-sm rounded-full transition-colors",
              currentPage === page
                ? "bg-black text-white hover:bg-black"
                : "hover:bg-black hover:text-white"
            )}
            onClick={() => table.setPageIndex(page)}
          >
            {page + 1}
          </Button>
        )
      )}

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => table.nextPage()}
        disabled={!table.getCanNextPage()}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
