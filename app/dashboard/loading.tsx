import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
    <div className="container max-w-7xl mx-auto p-4 sm:p-6 space-y-8 animate-fadeIn">
      {/* Header skeleton */}
      <div className="flex items-center justify-center py-4">
        <Skeleton className="h-10 w-48" />
      </div>

      {/* Tracked Tickers Card Skeleton */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2.5">
              <CardTitle>
                <Skeleton className="h-7 w-44" />
              </CardTitle>
              <CardDescription>
                <Skeleton className="h-4 w-72" />
              </CardDescription>
            </div>
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Desktop skeleton */}
          <div className="hidden sm:block">
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

          {/* Mobile skeleton */}
          <div className="sm:hidden p-4 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl p-4 border border-border/50 bg-card shadow-sm animate-slideUp"
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
        </CardContent>
      </Card>

      {/* Additional skeleton cards for context */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card
            key={i}
            className="border-border/50 shadow-sm animate-slideUp"
            style={{ animationDelay: `${(i + 2) * 100}ms` }}
          >
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-12 w-full mb-3" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
