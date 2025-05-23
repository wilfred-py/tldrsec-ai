"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { SearchIcon, EyeIcon, ArrowRightIcon, XIcon, Loader2Icon, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  SortingState,
  FilterFn,
  useReactTable,
} from "@tanstack/react-table";
import { FilingLog, FilingDetails } from "@/lib/api/types";
import { getFilingLogs, getFilingDetails, rerunFilingJob } from "@/lib/api/filing-service";
import { useAsync } from "@/lib/hooks/use-async";

// Column definition helper
const columnHelper = createColumnHelper<FilingLog>();

// Global filter function for search
const globalFilterFn: FilterFn<FilingLog> = (row, columnId, value) => {
  const searchValue = String(value).toLowerCase();
  const ticker = row.original.ticker.toLowerCase();
  const company = row.original.company.toLowerCase();
  const filingCode = row.original.filingCode.toLowerCase();
  const filingName = row.original.filingName.toLowerCase();
  
  return ticker.includes(searchValue) || 
         company.includes(searchValue) || 
         filingCode.includes(searchValue) || 
         filingName.includes(searchValue);
};

export default function LogsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilingType, setSelectedFilingType] = useState("all-types");
  const [selectedStatus, setSelectedStatus] = useState("all-status");
  const [isFilingDetailsOpen, setIsFilingDetailsOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [loadingRerun, setLoadingRerun] = useState<string | null>(null);
  const [currentFilingDetails, setCurrentFilingDetails] = useState<FilingDetails | null>(null);
  const [currentFilingLog, setCurrentFilingLog] = useState<FilingLog | null>(null);
  
  // Use the custom hook for async operations
  const {
    data: logs,
    isLoading: isLoadingLogs,
    error: logsError,
    execute: executeLogsQuery,
  } = useAsync<FilingLog[]>([]);
  
  // Fetch logs on component mount
  useEffect(() => {
    executeLogsQuery(
      () => getFilingLogs(),
      {
        errorMessage: "Failed to load filing logs. Please try again."
      }
    );
  }, [executeLogsQuery]);

  // Define table columns
  const columns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Ticker
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor('company', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Company
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
    }),
    columnHelper.accessor('filingCode', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Filing Type
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
    }),
    columnHelper.accessor('filingDate', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Filing Date
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
    }),
    columnHelper.accessor('status', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Status
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => {
        const status = info.getValue();
        return (
          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            status === 'Completed' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' 
              : status === 'Failed'
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
          }`}>
            {status}
          </div>
        );
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const filing = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => handleViewDetails(filing)}
            >
              <EyeIcon className="h-4 w-4" />
              <span className="sr-only">View</span>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => handleRerunJob(filing.id)}
              disabled={loadingRerun === filing.id}
            >
              {loadingRerun === filing.id ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightIcon className="h-4 w-4" />
              )}
              <span className="sr-only">Rerun</span>
            </Button>
          </div>
        )
      },
    }),
  ], [loadingRerun]);
  
  // Initialize the table with React Table
  const table = useReactTable({
    data: logs || [],
    columns,
    state: {
      sorting,
      globalFilter: searchQuery,
    },
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    globalFilterFn,
    onGlobalFilterChange: setSearchQuery,
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Apply additional filtering for dropdown filters
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    
    return table.getRowModel().rows.filter(
      row => {
        // Apply filing type filter
        const matchesFilingType = 
          selectedFilingType === "all-types" ||
          (selectedFilingType === "10-k" && row.original.filingCode.toLowerCase() === "10-k") ||
          (selectedFilingType === "10-q" && row.original.filingCode.toLowerCase() === "10-q") ||
          (selectedFilingType === "8-k" && row.original.filingCode.toLowerCase() === "8-k") ||
          (selectedFilingType === "other" && !["10-k", "10-q", "8-k"].includes(row.original.filingCode.toLowerCase()));
        
        // Apply status filter
        const matchesStatus =
          selectedStatus === "all-status" ||
          (selectedStatus === "completed" && row.original.status.toLowerCase() === "completed") ||
          (selectedStatus === "failed" && row.original.status.toLowerCase() === "failed") ||
          (selectedStatus === "in-progress" && row.original.status.toLowerCase() === "in-progress");
        
        return matchesFilingType && matchesStatus;
      }
    );
  }, [table, selectedFilingType, selectedStatus, logs]);

  // View filing details
  const handleViewDetails = async (filing: FilingLog) => {
    setCurrentFilingLog(filing);
    
    // If the filing has details, open the modal directly
    if (filing.details) {
      setCurrentFilingDetails(filing.details);
      setIsFilingDetailsOpen(true);
      return;
    }
    
    // Otherwise, fetch the details
    const { success, data } = await executeLogsQuery(
      () => getFilingDetails(filing.id),
      {
        errorMessage: "Failed to load filing details. Please try again."
      }
    );
    
    if (success && data) {
      setCurrentFilingDetails(data);
      setIsFilingDetailsOpen(true);
    }
  };

  // Rerun a filing job
  const handleRerunJob = async (id: string) => {
    setLoadingRerun(id);
    
    const { success } = await executeLogsQuery(
      () => rerunFilingJob(id),
      {
        successMessage: "Job rerun initiated",
        errorMessage: "Failed to rerun job. Please try again."
      }
    );
    
    // Set a timeout to simulate processing time
    setTimeout(() => {
      setLoadingRerun(null);
      
      // Refresh the logs list if successful
      if (success) {
        executeLogsQuery(
          () => getFilingLogs(),
          {
            errorMessage: "Failed to refresh filing logs. Please try again."
          }
        );
      }
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        heading="Filing Logs"
        description="View your SEC filing processing history."
      />
      
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="relative w-full max-w-sm">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by ticker, company or filing..."
            className="pl-8 w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex flex-1 gap-4 flex-col sm:flex-row">
          <div className="w-full sm:max-w-[180px]">
            <Select
              defaultValue="all-types"
              value={selectedFilingType}
              onValueChange={setSelectedFilingType}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filing Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-types">All Filing Types</SelectItem>
                <SelectItem value="10-k">10-K</SelectItem>
                <SelectItem value="10-q">10-Q</SelectItem>
                <SelectItem value="8-k">8-K</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-full sm:max-w-[180px]">
            <Select
              defaultValue="all-status"
              value={selectedStatus}
              onValueChange={setSelectedStatus}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-status">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 text-right hidden md:block">
            <p className="text-sm text-muted-foreground">
              Showing {filteredLogs.length} of {logs?.length || 0} filings
            </p>
          </div>
        </div>
      </div>
      
      {isLoadingLogs ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : logsError ? (
        <div className="rounded-md border border-destructive p-8 text-center">
          <p className="text-destructive">Error loading filing logs. Please try again.</p>
          <Button 
            variant="outline" 
            className="mt-4" 
            onClick={() => executeLogsQuery(
              () => getFilingLogs(),
              {
                errorMessage: "Failed to load filing logs. Please try again."
              }
            )}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
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
                {filteredLogs.length ? (
                  filteredLogs.map(row => (
                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id} className="py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No filings found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="block md:hidden">
            <p className="text-sm text-muted-foreground">
              Showing {filteredLogs.length} of {logs?.length || 0} filings
            </p>
          </div>
        </>
      )}
      
      {/* Filing Details Dialog */}
      <Dialog open={isFilingDetailsOpen} onOpenChange={setIsFilingDetailsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {currentFilingLog?.ticker} - {currentFilingLog?.filingCode} Filing Details
            </DialogTitle>
            <DialogDescription>
              {currentFilingLog?.company} • {currentFilingLog?.filingDate}
            </DialogDescription>
          </DialogHeader>
          
          {currentFilingDetails ? (
            <div className="py-4 space-y-6">
              {/* Financials */}
              {(currentFilingDetails.revenue || 
                currentFilingDetails.netIncome || 
                currentFilingDetails.eps || 
                currentFilingDetails.cashFlow ||
                currentFilingDetails.assets) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Financial Summary</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {currentFilingDetails.revenue && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Revenue</div>
                        <div className="text-lg font-medium">{currentFilingDetails.revenue}</div>
                        {currentFilingDetails.yoy?.revenue && (
                          <div className="text-xs text-green-600">
                            {currentFilingDetails.yoy.revenue} YoY
                          </div>
                        )}
                      </div>
                    )}
                    
                    {currentFilingDetails.netIncome && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Net Income</div>
                        <div className="text-lg font-medium">{currentFilingDetails.netIncome}</div>
                      </div>
                    )}
                    
                    {currentFilingDetails.eps && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-muted-foreground">EPS</div>
                        <div className="text-lg font-medium">{currentFilingDetails.eps}</div>
                        {currentFilingDetails.yoy?.eps && (
                          <div className="text-xs text-green-600">
                            {currentFilingDetails.yoy.eps} YoY
                          </div>
                        )}
                      </div>
                    )}
                    
                    {currentFilingDetails.cashFlow && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Cash Flow</div>
                        <div className="text-lg font-medium">{currentFilingDetails.cashFlow}</div>
                      </div>
                    )}
                    
                    {currentFilingDetails.assets && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Assets</div>
                        <div className="text-lg font-medium">{currentFilingDetails.assets}</div>
                      </div>
                    )}
                    
                    {currentFilingDetails.operatingMargin && (
                      <div className="p-3 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Operating Margin</div>
                        <div className="text-lg font-medium">{currentFilingDetails.operatingMargin}</div>
                        {currentFilingDetails.yoy?.margin && (
                          <div className="text-xs text-green-600">
                            {currentFilingDetails.yoy.margin} YoY
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Key Insights */}
              {currentFilingDetails.keyInsights && currentFilingDetails.keyInsights.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Key Insights</h3>
                  <ul className="space-y-2 list-disc list-inside">
                    {currentFilingDetails.keyInsights.map((insight, index) => (
                      <li key={index} className="text-sm">{insight}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Risk Factors */}
              {currentFilingDetails.riskFactors && currentFilingDetails.riskFactors.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Risk Factors</h3>
                  <ul className="space-y-2 list-disc list-inside">
                    {currentFilingDetails.riskFactors.map((risk, index) => (
                      <li key={index} className="text-sm">{risk}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* If no detailed content */}
              {!currentFilingDetails.revenue && 
               !currentFilingDetails.keyInsights?.length && 
               !currentFilingDetails.riskFactors?.length && (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">No detailed information available for this filing.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 flex justify-center">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => handleRerunJob(currentFilingLog?.id || "")}
              disabled={loadingRerun === currentFilingLog?.id}
            >
              {loadingRerun === currentFilingLog?.id ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightIcon className="mr-2 h-4 w-4" />
              )}
              Rerun Analysis
            </Button>
            <DialogClose asChild>
              <Button variant="secondary">
                <XIcon className="mr-2 h-4 w-4" />
                Close
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 