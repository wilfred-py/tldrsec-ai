import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SKELETON_ROW_COUNT = 8;

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Matches DashboardHeader: mb-8 > flex center > space-y-1 > h1(text-2xl = line-height 2rem = h-8) */}
      <div className="mb-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="space-y-1">
            <Skeleton className="h-8 w-36" />
          </div>
        </div>
      </div>

      {/* Matches DashboardClient landing-card container */}
      <div className="landing-card">
        <div className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Matches: h2(text-lg = lh 1.75rem = h-7) + p(text-sm = lh 1.25rem = h-5) */}
            <div className="text-left space-y-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-5 w-64" />
            </div>
            {/* Matches Button size="lg" */}
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>

        {/* Desktop skeleton */}
        <div className="hidden sm:block overflow-hidden">
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
                  className="hover:bg-muted/50 transition-colors"
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
          <div className="flex items-center justify-between border-t px-4 py-4">
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Mobile skeleton */}
        <div className="sm:hidden space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-4 border border-border/50 bg-card shadow-sm"
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
      </div>
    </div>
  );
}
