"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DataTableSkeletonProps {
  columnCount: number;
  rowCount?: number;
  columnWidths?: string[];
  headerWidths?: string[];
  className?: string;
  showHeader?: boolean;
}

export function DataTableSkeleton({
  columnCount,
  rowCount = 5,
  columnWidths,
  headerWidths,
  className,
  showHeader = true,
}: DataTableSkeletonProps) {
  // Default widths if not provided
  const defaultColumnWidth = "w-24";
  const defaultHeaderWidth = "w-20";

  return (
    <div className={cn("w-full", className)}>
      <Table>
        {showHeader && (
          <TableHeader>
            <TableRow>
              {Array.from({ length: columnCount }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton
                    className={cn(
                      "h-4",
                      headerWidths?.[i] || defaultHeaderWidth
                    )}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: columnCount }).map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton
                    className={cn(
                      "h-5",
                      columnWidths?.[colIndex] || defaultColumnWidth
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
