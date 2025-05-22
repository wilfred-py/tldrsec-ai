"use client";

import { useState, useMemo } from "react";
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
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  FilterFn,
  getFilteredRowModel,
} from "@tanstack/react-table";

// Representing a company with filing preferences
interface FilingLog {
  ticker: string;
  company: string;
  filingCode: string;
  filingName: string;
  filingDate: string;
  jobStart: string;
  jobCompleted: string;
  emailSent: string;
  status: "Completed" | "Started" | "Failed";
  details?: {
    revenue?: string;
    operatingMargin?: string;
    eps?: string;
    yoy?: {
      revenue: string;
      margin: string;
      eps: string;
    };
    keyInsights?: string[];
    riskFactors?: string[];
  };
}

// This would typically come from an API or database
const MOCK_LOGS: FilingLog[] = [
  {
    ticker: "AAPL",
    company: "Apple Inc.",
    filingCode: "10-Q",
    filingName: "Quarterly Report",
    filingDate: "May 15",
    jobStart: "May 15, 2025, 10:30 AM",
    jobCompleted: "May 15, 2025, 10:32 AM",
    emailSent: "May 15, 2025, 10:33 AM",
    status: "Completed",
    details: {
      revenue: "$81.8B",
      operatingMargin: "30.3%",
      eps: "$1.52",
      yoy: {
        revenue: "+2.1%",
        margin: "+1.2%",
        eps: "+3.4%"
      },
      keyInsights: [
        "Services revenue reached all-time high, driving margin expansion",
        "iPhone sales exceeded expectations despite supply chain challenges",
        "China revenue declined 2.5% amid increased competition"
      ],
      riskFactors: [
        "Ongoing supply chain constraints may impact product availability",
        "Regulatory scrutiny in app store practices could affect services growth",
        "Foreign exchange headwinds expected to continue in next quarter"
      ]
    }
  },
  {
    ticker: "MSFT",
    company: "Microsoft Corp.",
    filingCode: "8-K",
    filingName: "Current Report",
    filingDate: "May 12",
    jobStart: "May 12, 2025, 02:22 PM",
    jobCompleted: "May 12, 2025, 02:23 PM",
    emailSent: "May 12, 2025, 02:24 PM",
    status: "Completed",
    details: {
      keyInsights: [
        "Azure cloud division revenue grew 27% year-over-year",
        "Acquisition of Nuance Communications completed",
        "New productivity features announced for Microsoft 365"
      ],
      riskFactors: [
        "Increased competition in cloud services market",
        "Global economic uncertainty may affect enterprise spending",
        "Cybersecurity threats could impact customer confidence"
      ]
    }
  },
  {
    ticker: "AMZN",
    company: "Amazon.com Inc.",
    filingCode: "Form 4",
    filingName: "Statement of Changes in Beneficial Ownership",
    filingDate: "May 10",
    jobStart: "May 10, 2025, 09:15 AM",
    jobCompleted: "May 10, 2025, 09:16 AM",
    emailSent: "May 10, 2025, 09:17 AM",
    status: "Completed",
    details: {
      keyInsights: [
        "CEO sold 50,000 shares at $175.25 per share",
        "Transaction part of pre-established trading plan",
        "CEO retains 10.2 million shares after transaction"
      ]
    }
  },
  {
    ticker: "GOOGL",
    company: "Alphabet Inc.",
    filingCode: "8-K",
    filingName: "Current Report",
    filingDate: "May 8",
    jobStart: "May 8, 2025, 04:45 PM",
    jobCompleted: "May 8, 2025, 04:47 PM",
    emailSent: "May 8, 2025, 04:48 PM",
    status: "Completed",
    details: {
      keyInsights: [
        "Board approved additional $70 billion share repurchase program",
        "New head of AI division appointed",
        "YouTube ad revenue increased 15% year-over-year"
      ],
      riskFactors: [
        "Increased regulatory scrutiny in multiple jurisdictions",
        "Competitive pressures in digital advertising market",
        "AI ethics concerns may affect product development timeline"
      ]
    }
  },
  {
    ticker: "META",
    company: "Meta Platforms Inc.",
    filingCode: "10-K",
    filingName: "Annual Report",
    filingDate: "May 5",
    jobStart: "May 5, 2025, 11:10 AM",
    jobCompleted: "May 5, 2025, 11:14 AM",
    emailSent: "May 5, 2025, 11:15 AM",
    status: "Completed",
    details: {
      revenue: "$134.9B",
      operatingMargin: "29.4%",
      eps: "$13.15",
      yoy: {
        revenue: "+15.7%",
        margin: "-2.3%",
        eps: "+18.2%"
      },
      keyInsights: [
        "Daily active users across family of apps increased 5% to 3.1 billion",
        "Reality Labs segment losses increased to $13.7 billion",
        "Ad impression growth of 12% offset by 3% decrease in average price per ad"
      ],
      riskFactors: [
        "Privacy changes in mobile operating systems continue to impact ad effectiveness",
        "Metaverse investment requires significant capital with uncertain returns",
        "Regulatory headwinds in key markets including EU and US"
      ]
    }
  },
  {
    ticker: "TSLA",
    company: "Tesla, Inc.",
    filingCode: "8-K",
    filingName: "Current Report",
    filingDate: "May 3",
    jobStart: "May 3, 2025, 01:20 PM",
    jobCompleted: "—",
    emailSent: "—",
    status: "Started",
  },
  {
    ticker: "NVDA",
    company: "NVIDIA Corporation",
    filingCode: "Form 4",
    filingName: "Statement of Changes in Beneficial Ownership",
    filingDate: "May 1",
    jobStart: "May 1, 2025, 08:30 AM",
    jobCompleted: "May 1, 2025, 08:31 AM",
    emailSent: "May 1, 2025, 08:32 AM",
    status: "Completed",
    details: {
      keyInsights: [
        "CTO purchased 15,000 shares at $950.25 per share",
        "Direct acquisition, not part of compensation package",
        "CTO owns 235,000 shares after transaction"
      ]
    }
  },
];

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
  const [logs, setLogs] = useState<FilingLog[]>(MOCK_LOGS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilingType, setSelectedFilingType] = useState("all-types");
  const [selectedStatus, setSelectedStatus] = useState("all-statuses");
  const [isFilingDetailsOpen, setIsFilingDetailsOpen] = useState(false);
  const [selectedFiling, setSelectedFiling] = useState<FilingLog | null>(null);
  const [runningJobs, setRunningJobs] = useState<Record<number, boolean>>({});
  const [sorting, setSorting] = useState<SortingState>([]);

  // Define column filters based on dropdowns
  const filingTypeFilter = useMemo<FilterFn<FilingLog>>(() => 
    (row) => {
      if (selectedFilingType === "all-types") return true;
      if (selectedFilingType === "10-k" && row.original.filingCode === "10-K") return true;
      if (selectedFilingType === "10-q" && row.original.filingCode === "10-Q") return true;
      if (selectedFilingType === "8-k" && row.original.filingCode === "8-K") return true;
      if (selectedFilingType === "form-4" && row.original.filingCode === "Form 4") return true;
      return false;
    }, 
    [selectedFilingType]
  );

  const statusFilter = useMemo<FilterFn<FilingLog>>(() => 
    (row) => {
      if (selectedStatus === "all-statuses") return true;
      if (selectedStatus === "completed" && row.original.status === "Completed") return true;
      if (selectedStatus === "started" && row.original.status === "Started") return true;
      if (selectedStatus === "failed" && row.original.status === "Failed") return true;
      return false;
    },
    [selectedStatus]
  );

  // Define table columns
  const columns = useMemo(() => [
    columnHelper.accessor('ticker', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Ticker
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: info => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor('company', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Company
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('filingCode', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Filing Code
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('filingName', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Filing Name
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('filingDate', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Filing Date
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('jobStart', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Job Start
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('jobCompleted', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Job Completed
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('emailSent', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Email Sent
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('status', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent group"
          >
            Status
            {column.getIsSorted() ? (
              column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Button>
        )
      },
      cell: ({ getValue }) => {
        const status = getValue();
        return (
          <span
            className={
              status === "Completed"
                ? "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-green-50 text-green-700 border-green-100"
                : status === "Failed"
                ? "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border-red-100"
                : "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-yellow-50 text-yellow-700 border-yellow-100"
            }
          >
            {status}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const log = row.original;
        const index = logs.findIndex(l => l === log);
        return (
          <div className="flex justify-end gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => handleViewFiling(log)}
              disabled={log.status !== "Completed" || !log.details}
            >
              <EyeIcon className="h-4 w-4" />
              <span className="sr-only">View</span>
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => handleRerunJob(index)}
              disabled={runningJobs[index]}
            >
              {runningJobs[index] ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightIcon className="h-4 w-4" />
              )}
              <span className="sr-only">Rerun</span>
            </Button>
          </div>
        );
      },
    }),
  ], [logs, runningJobs]);

  // Initialize the table with React Table
  const table = useReactTable({
    data: logs,
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
    return table.getRowModel().rows.filter(
      row => {
        // Apply filing type filter
        const matchesFilingType = 
          selectedFilingType === "all-types" ||
          (selectedFilingType === "10-k" && row.original.filingCode === "10-K") ||
          (selectedFilingType === "10-q" && row.original.filingCode === "10-Q") ||
          (selectedFilingType === "8-k" && row.original.filingCode === "8-K") ||
          (selectedFilingType === "form-4" && row.original.filingCode === "Form 4");
        
        // Apply status filter
        const matchesStatus = 
          selectedStatus === "all-statuses" ||
          (selectedStatus === "completed" && row.original.status === "Completed") ||
          (selectedStatus === "started" && row.original.status === "Started") ||
          (selectedStatus === "failed" && row.original.status === "Failed");
        
        return matchesFilingType && matchesStatus;
      }
    );
  }, [table.getRowModel().rows, selectedFilingType, selectedStatus]);

  // Handle viewing a filing's details
  const handleViewFiling = (log: FilingLog) => {
    setSelectedFiling(log);
    setIsFilingDetailsOpen(true);
  };

  // Handle rerun job functionality
  const handleRerunJob = (index: number) => {
    // Set the job as running
    setRunningJobs(prev => ({ ...prev, [index]: true }));
    
    // Update the job start time
    const now = new Date();
    const formattedDate = now.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // Create a copy of the logs array and update the specific log
    const updatedLogs = [...logs];
    updatedLogs[index] = {
      ...updatedLogs[index],
      jobStart: formattedDate,
      jobCompleted: "—",
      emailSent: "—",
      status: "Started"
    };
    
    setLogs(updatedLogs);
    
    // Simulate job completion after a random time between 2-5 seconds
    const completionTime = Math.floor(Math.random() * 3000) + 2000;
    
    setTimeout(() => {
      const completionDate = new Date(now.getTime() + completionTime);
      const formattedCompletionDate = completionDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      const emailDate = new Date(completionDate.getTime() + 1000);
      const formattedEmailDate = emailDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      const finalLogs = [...updatedLogs];
      finalLogs[index] = {
        ...finalLogs[index],
        jobCompleted: formattedCompletionDate,
        emailSent: formattedEmailDate,
        status: "Completed"
      };
      
      setLogs(finalLogs);
      setRunningJobs(prev => ({ ...prev, [index]: false }));
      toast.success(`Job for ${finalLogs[index].ticker} completed and email sent`);
    }, completionTime);
  };

  return (
    <div className="space-y-6">
      <DashboardHeader heading="Logs" description="SEC Filing Logs" />

      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by ticker, company, or filing..."
              className="pl-8 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Select 
              defaultValue="all-types" 
              value={selectedFilingType} 
              onValueChange={setSelectedFilingType}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-types">All Types</SelectItem>
                <SelectItem value="10-k">10-K</SelectItem>
                <SelectItem value="10-q">10-Q</SelectItem>
                <SelectItem value="8-k">8-K</SelectItem>
                <SelectItem value="form-4">Form 4</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              defaultValue="all-statuses" 
              value={selectedStatus}
              onValueChange={setSelectedStatus}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-statuses">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="[&_td]:border-l [&_td:first-child]:border-l-0 [&_th]:border-l [&_th:first-child]:border-l-0">
              <TableHeader>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <TableHead key={header.id}>
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
                {filteredLogs.length > 0 ? (
                  filteredLogs.map(row => (
                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No logs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-4 text-right text-sm text-muted-foreground">
          Showing {filteredLogs.length} logs
        </div>
      </div>

      <Dialog open={isFilingDetailsOpen} onOpenChange={setIsFilingDetailsOpen}>
        <DialogContent className="max-w-2xl">
          {selectedFiling && (
            <>
              <DialogHeader className="text-left">
                <div className="flex justify-between items-start">
                  <div>
                    <DialogTitle className="text-xl">
                      {selectedFiling.ticker} ({selectedFiling.company}) - {selectedFiling.filingName} ({selectedFiling.filingCode})
                    </DialogTitle>
                    <DialogDescription>
                      Filed on {selectedFiling.filingDate}, 2025
                    </DialogDescription>
                  </div>
                  <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                    <XIcon className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogClose>
                </div>
              </DialogHeader>
              
              {selectedFiling.details && selectedFiling.details.revenue && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-4">Financial Highlights</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-md p-4">
                      <div className="text-sm text-muted-foreground">Revenue</div>
                      <div className="text-2xl font-bold">{selectedFiling.details.revenue}</div>
                      <div className="text-sm text-green-500">
                        {selectedFiling.details.yoy?.revenue} YoY
                      </div>
                    </div>
                    <div className="border rounded-md p-4">
                      <div className="text-sm text-muted-foreground">Operating Margin</div>
                      <div className="text-2xl font-bold">{selectedFiling.details.operatingMargin}</div>
                      <div className="text-sm text-green-500">
                        {selectedFiling.details.yoy?.margin} YoY
                      </div>
                    </div>
                    <div className="border rounded-md p-4">
                      <div className="text-sm text-muted-foreground">EPS</div>
                      <div className="text-2xl font-bold">{selectedFiling.details.eps}</div>
                      <div className="text-sm text-green-500">
                        {selectedFiling.details.yoy?.eps} YoY
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {selectedFiling.details && selectedFiling.details.keyInsights && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-2">Key Insights</h3>
                  <ul className="space-y-2">
                    {selectedFiling.details.keyInsights.map((insight, i) => (
                      <li key={i} className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {selectedFiling.details && selectedFiling.details.riskFactors && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-2">Risk Factors</h3>
                  <ul className="space-y-2">
                    {selectedFiling.details.riskFactors.map((risk, i) => (
                      <li key={i} className="flex items-start">
                        <span className="text-amber-500 mr-2">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 