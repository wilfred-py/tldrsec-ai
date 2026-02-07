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

const SKELETON_ROW_COUNT = 8;

export function TickersTableSkeleton() {
  return (
    <div className="animate-fadeIn">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b">
            <TableHead className="w-[100px] h-12">
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead className="h-12">
              <Skeleton className="h-4 w-24" />
            </TableHead>
            <TableHead className="h-12">
              <Skeleton className="h-4 w-28" />
            </TableHead>
            <TableHead className="text-center w-[120px] h-12">
              <Skeleton className="h-4 w-20 mx-auto" />
            </TableHead>
            <TableHead className="w-[50px] h-12" />
            <TableHead className="w-[50px] h-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
            <TableRow
              key={i}
              className="hover:bg-muted/50 transition-colors animate-slideUp"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <TableCell className="py-5">
                <Skeleton className="h-6 w-16 rounded-md" />
              </TableCell>
              <TableCell className="py-5">
                <Skeleton className="h-5 w-40" />
              </TableCell>
              <TableCell className="py-5">
                <Skeleton className="h-5 w-32" />
              </TableCell>
              <TableCell className="py-5 text-center">
                <div className="flex justify-center">
                  <Skeleton className="h-5 w-10" />
                </div>
              </TableCell>
              <TableCell className="py-5">
                <Skeleton className="h-9 w-9 rounded-lg" />
              </TableCell>
              <TableCell className="py-5">
                <Skeleton className="h-9 w-9 rounded-lg" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-4">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function TickersMobileSkeleton() {
  return (
    <div className="space-y-4 animate-fadeIn">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl p-4 border border-border/50 bg-card shadow-sm hover:shadow-md transition-shadow animate-slideUp"
          style={{ animationDelay: `${i * 75}ms` }}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="space-y-2.5 flex-1">
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="flex gap-2 ml-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/50">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-28" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Combined skeleton that shows appropriate view based on screen size
export function TickersLoadingSkeleton() {
  return (
    <>
      {/* Desktop skeleton */}
      <div className="hidden sm:block">
        <TickersTableSkeleton />
      </div>
      {/* Mobile skeleton */}
      <div className="sm:hidden">
        <TickersMobileSkeleton />
      </div>
    </>
  );
}
