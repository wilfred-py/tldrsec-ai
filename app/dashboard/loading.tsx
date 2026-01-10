import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SKELETON_ROW_COUNT = 10;

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="text-center">
        <Skeleton className="h-8 w-32 mx-auto bg-muted" />
      </div>

      {/* Tracked Tickers Card Skeleton */}
      <div className="landing-card">
        <div className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-left space-y-2">
              <Skeleton className="h-6 w-36 bg-muted" />
              <Skeleton className="h-4 w-48 bg-muted" />
            </div>
            <Skeleton className="h-10 w-32 bg-muted" />
          </div>
        </div>

        {/* Desktop skeleton */}
        <div className="hidden sm:block overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">
                  <div className="h-9 flex items-center">
                    <Skeleton className="h-4 w-14 bg-muted" />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="h-9 flex items-center">
                    <Skeleton className="h-4 w-20 bg-muted" />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="h-9 flex items-center">
                    <Skeleton className="h-4 w-24 bg-muted" />
                  </div>
                </TableHead>
                <TableHead className="text-center w-[100px]">
                  <div className="h-9 flex items-center justify-center">
                    <Skeleton className="h-4 w-16 bg-muted" />
                  </div>
                </TableHead>
                <TableHead className="w-[40px]" />
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="py-4">
                    <Skeleton className="h-5 w-12 bg-muted" />
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-4 w-32 bg-muted" />
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-4 w-24 bg-muted" />
                  </TableCell>
                  <TableCell className="py-4 text-center">
                    <Skeleton className="h-4 w-8 mx-auto bg-muted" />
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-8 w-8 rounded-md bg-muted" />
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-8 w-8 rounded-md bg-muted" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination skeleton */}
          <div className="flex items-center justify-between border-t px-2 py-4">
            <Skeleton className="h-4 w-24 bg-muted" />
          </div>
        </div>

        {/* Mobile skeleton */}
        <div className="sm:hidden space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-4 border bg-card">
              <div className="flex justify-between items-start mb-3">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-14 bg-muted" />
                  <Skeleton className="h-4 w-32 bg-muted" />
                </div>
                <div className="flex gap-1">
                  <Skeleton className="h-8 w-8 rounded-md bg-muted" />
                  <Skeleton className="h-8 w-8 rounded-md bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20 bg-muted" />
                  <Skeleton className="h-4 w-24 bg-muted" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="h-3 w-16 bg-muted" />
                  <Skeleton className="h-4 w-8 bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
