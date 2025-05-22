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

// Define interfaces
interface FilingDetails {
  revenue?: string;
  netIncome?: string;
  eps?: string;
  cashFlow?: string;
  assets?: string;
  operatingMargin?: string;
  yoy?: {
    revenue: string;
    margin: string;
    eps: string;
  };
  keyInsights?: string[];
  riskFactors?: string[];
}

interface FilingLog {
  id: string;
  ticker: string;
  company: string;
  filingCode: string;
  filingName: string;
  filingDate: string;
  jobStart: string;
  jobCompleted: string;
  emailSent: string;
  status: string;
  details?: FilingDetails;
}

// This would typically come from an API or database
const MOCK_LOGS: FilingLog[] = [
  {
    id: "log-1",
    ticker: "AAPL",
    company: "Apple Inc.",
    filingCode: "10-K",
    filingName: "Annual Report",
    filingDate: "Dec 12, 2023",
    jobStart: "Dec 12, 2023, 4:30 PM",
    jobCompleted: "Dec 12, 2023, 4:35 PM",
    emailSent: "Dec 12, 2023, 4:36 PM",
    status: "Completed",
    details: {
      revenue: "$394.3 billion",
      netIncome: "$96.9 billion",
      eps: "$6.14",
      cashFlow: "$114.5 billion",
      assets: "$335.1 billion",
      keyInsights: [
        "iPhone sales increased by 4% year-over-year",
        "Services revenue reached an all-time high of $85.2 billion",
        "International sales accounted for 62% of revenue",
        "R&D spending increased by 12% to $26.3 billion"
      ],
      riskFactors: [
        "Global economic conditions affecting consumer spending",
        "Intense competition in all business areas",
        "Rapid technological changes requiring continuous innovation",
        "Complex supply chain dependencies in multiple countries",
        "Regulatory challenges in key markets"
      ]
    }
  },
  {
    id: "log-2",
    ticker: "MSFT",
    company: "Microsoft Corp.",
    filingCode: "10-Q",
    filingName: "Quarterly Report",
    filingDate: "Nov 30, 2023",
    jobStart: "Nov 30, 2023, 2:15 PM",
    jobCompleted: "Nov 30, 2023, 2:22 PM",
    emailSent: "Nov 30, 2023, 2:23 PM",
    status: "Completed",
    details: {
      keyInsights: [
        "Cloud revenue grew 27% year-over-year driven by Azure",
        "Office 365 Commercial revenue increased by 15%",
        "Operating margin expanded to 45.3%",
        "AI implementations boosted premium service adoption"
      ],
      riskFactors: [
        "Increased competition in cloud services",
        "Potential cybersecurity incidents affecting customer trust",
        "Regulatory challenges related to market concentration",
        "Dependency on semiconductor supply chain"
      ]
    }
  },
  {
    id: "log-3",
    ticker: "GOOGL",
    company: "Alphabet Inc.",
    filingCode: "8-K",
    filingName: "Current Report",
    filingDate: "Nov 28, 2023",
    jobStart: "Nov 28, 2023, 10:45 AM",
    jobCompleted: "Nov 28, 2023, 10:50 AM",
    emailSent: "Nov 28, 2023, 10:51 AM",
    status: "Completed",
    details: {
      keyInsights: [
        "Announcement of $25 billion share repurchase program",
        "Executive leadership changes in Cloud division",
        "Expansion of AI research initiatives"
      ]
    }
  },
  {
    id: "log-4",
    ticker: "AMZN",
    company: "Amazon.com Inc.",
    filingCode: "10-Q",
    filingName: "Quarterly Report",
    filingDate: "Nov 15, 2023",
    jobStart: "Nov 15, 2023, 3:30 PM",
    jobCompleted: "Nov 15, 2023, 3:37 PM",
    emailSent: "Nov 15, 2023, 3:38 PM",
    status: "Completed",
    details: {
      keyInsights: [
        "AWS revenue grew 18% year-over-year",
        "Prime membership reached new highs in both retention and engagement",
        "Operating margin improved to 7.8% from 5.3% last year",
        "International segment achieved profitability for the second consecutive quarter"
      ],
      riskFactors: [
        "Increasing logistics costs",
        "Regulatory scrutiny in multiple jurisdictions",
        "Labor cost pressures in fulfillment centers",
        "Intense competition in cloud computing"
      ]
    }
  },
  {
    id: "log-5",
    ticker: "NVDA",
    company: "NVIDIA Corporation",
    filingCode: "10-K",
    filingName: "Annual Report",
    filingDate: "Nov 8, 2023",
    jobStart: "Nov 8, 2023, 9:15 AM",
    jobCompleted: "Nov 8, 2023, 9:23 AM",
    emailSent: "Nov 8, 2023, 9:24 AM",
    status: "Completed",
    details: {
      revenue: "$26.97 billion",
      netIncome: "$9.75 billion",
      eps: "$3.91",
      cashFlow: "$11.53 billion",
      assets: "$51.47 billion",
      keyInsights: [
        "Data center revenue increased 118% year-over-year",
        "AI solutions now represent 65% of data center revenue",
        "Gaming revenue stabilized with 22% growth in the second half",
        "Automotive and embedded segments grew 35% combined"
      ],
      riskFactors: [
        "Semiconductor industry cyclicality",
        "Concentration risk with key manufacturing partners",
        "Dependency on continued AI market expansion",
        "Increasing competition in accelerated computing",
        "Export restrictions affecting international sales"
      ]
    }
  },
  {
    id: "log-6",
    ticker: "TSLA",
    company: "Tesla, Inc.",
    filingCode: "8-K",
    filingName: "Current Report",
    filingDate: "Oct 30, 2023",
    jobStart: "Oct 30, 2023, 11:45 AM",
    jobCompleted: "",
    emailSent: "",
    status: "Started"
  },
  {
    id: "log-7",
    ticker: "META",
    company: "Meta Platforms Inc.",
    filingCode: "10-Q",
    filingName: "Quarterly Report",
    filingDate: "Oct 25, 2023",
    jobStart: "Oct 25, 2023, 5:30 PM",
    jobCompleted: "Oct 25, 2023, 5:37 PM",
    emailSent: "Oct 25, 2023, 5:38 PM",
    status: "Completed",
    details: {
      keyInsights: [
        "Daily active users across family of apps increased 5% year-over-year",
        "Reality Labs revenue grew 35% but continued to operate at a loss",
        "Ad impression growth of 21% across all platforms",
        "Cost reduction initiatives on track with 10% headcount reduction"
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
  const [loadingRerun, setLoadingRerun] = useState<string | null>(null);
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
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
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
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => info.getValue(),
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
              Filing Code
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('filingName', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Filing Name
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => info.getValue(),
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
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('jobStart', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Job Start
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('jobCompleted', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Job Completed
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('emailSent', {
      header: ({ column }) => {
        return (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="p-0 font-medium hover:bg-transparent w-full justify-start"
            >
              Email Sent
              <span className="ml-2 w-4">
                {column.getIsSorted() ? (
                  column.getIsSorted() === 'asc' ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
        )
      },
      cell: info => info.getValue(),
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
                  <ArrowUpDown className="h-4 w-4 opacity-0 transition-opacity hover:opacity-100" />
                )}
              </span>
            </Button>
          </div>
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
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleViewDetails(row.original)}
            className="h-8 w-8"
          >
            <EyeIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleRerunJob(row.original.id)}
            className="h-8 w-8"
            disabled={loadingRerun === row.original.id}
          >
            {loadingRerun === row.original.id ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
      ),
    }),
  ], [logs, loadingRerun]);

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
  const handleViewDetails = (log: FilingLog) => {
    setSelectedFiling(log);
    setIsFilingDetailsOpen(true);
  };

  // Handle rerun job functionality
  const handleRerunJob = (id: string) => {
    setLoadingRerun(id);
    
    // Simulate API call
    setTimeout(() => {
      toast.success("Job rerun initiated", {
        description: "The job has been submitted for reprocessing.",
      });
      setLoadingRerun(null);
    }, 1500);
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