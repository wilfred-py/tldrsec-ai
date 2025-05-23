"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { SearchIcon, SettingsIcon, Trash2Icon, PlusIcon, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  FilterFn,
  getFilteredRowModel
} from "@tanstack/react-table";
import { Company, TickerSearchResult } from "@/lib/api/types";
import { getTrackedCompanies, searchCompanies, addTrackedCompany, deleteTrackedCompany, updateCompanyPreferences } from "@/lib/api/ticker-service";
import { useAsync } from "@/lib/hooks/use-async";
import { Skeleton } from "@/components/ui/skeleton";

// Column definition helper
const columnHelper = createColumnHelper<Company>();

// Global filter function for search
const globalFilterFn: FilterFn<Company> = (row, columnId, value) => {
  const searchValue = String(value).toLowerCase();
  const symbol = row.original.symbol.toLowerCase();
  const name = row.original.name.toLowerCase();
  
  return symbol.includes(searchValue) || name.includes(searchValue);
};

export function DashboardClient() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [newTickerSearch, setNewTickerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isAddTickerOpen, setIsAddTickerOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  
  // Use the custom hook for async operations
  const {
    data: companies,
    isLoading: isLoadingCompanies,
    error: companiesError,
    execute: executeCompaniesQuery,
    setData: setCompanies
  } = useAsync<Company[]>([]);
  
  // Fetch companies on component mount
  useEffect(() => {
    executeCompaniesQuery(
      () => getTrackedCompanies(),
      {
        errorMessage: "Failed to load tracked companies. Please try again."
      }
    );
  }, [executeCompaniesQuery]);
  
  // Define table columns
  const columns = useMemo(() => [
    columnHelper.accessor('symbol', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent"
          >
            Symbol
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100" />
            )}
          </Button>
        )
      },
      cell: info => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor('name', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent"
          >
            Company
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('lastFiling', {
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 font-medium hover:bg-transparent"
          >
            Last Filing
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-100" />
            )}
          </Button>
        )
      },
      cell: info => info.getValue(),
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const company = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => {
                setCurrentCompany({...company});
                setIsPreferencesOpen(true);
              }}
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="sr-only">Settings</span>
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => {
                setCompanyToDelete(company);
                setIsDeleteConfirmOpen(true);
              }}
            >
              <Trash2Icon className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        )
      },
    }),
  ], []);
  
  // Initialize the table with React Table
  const table = useReactTable({
    data: companies || [],
    columns,
    state: {
      sorting,
      globalFilter: searchQuery,
    },
    globalFilterFn,
    onGlobalFilterChange: setSearchQuery,
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
  });

  // Handle saving preferences for a company
  const handleSavePreferences = async (id: string, preferences: Company['preferences']) => {
    const { success } = await executeCompaniesQuery(
      () => updateCompanyPreferences(id, preferences),
      {
        successMessage: `Preferences updated for ${currentCompany?.symbol || 'company'}`,
        errorMessage: "Failed to update preferences. Please try again.",
        onSuccess: (updatedCompany) => {
          // Update the companies list with the updated company
          if (companies) {
            setCompanies(
              companies.map(company => 
                company.id === id ? { ...company, preferences } : company
              )
            );
          }
          setIsPreferencesOpen(false);
          setCurrentCompany(null);
        }
      }
    );
    
    if (success) {
      setIsPreferencesOpen(false);
      setCurrentCompany(null);
    }
  };

  // Handle deleting a company
  const handleDeleteCompany = async (id: string) => {
    if (!companies) return;
    
    // Find the company for the toast message
    const company = companies.find(c => c.id === id);
    
    // Optimistic update
    const previousCompanies = [...companies];
    setCompanies(companies.filter(company => company.id !== id));
    
    // Close the confirmation dialog
    setIsDeleteConfirmOpen(false);
    setCompanyToDelete(null);
    
    const { success } = await executeCompaniesQuery(
      () => deleteTrackedCompany(id),
      {
        successMessage: `${company?.symbol || 'Company'} has been removed from tracked tickers`,
        errorMessage: "Failed to remove company. Please try again.",
        onError: () => {
          // Restore previous state if error
          setCompanies(previousCompanies);
        }
      }
    );
  };

  // Handle search for adding new tickers
  const handleSearchTickers = async (query: string) => {
    setNewTickerSearch(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    const { success, data } = await executeCompaniesQuery(
      () => searchCompanies(query),
      {
        errorMessage: "Failed to search tickers. Please try again."
      }
    );
    
    if (success && data) {
      setSearchResults(data);
    }
  };

  // Handle adding a new ticker
  const handleAddTicker = async (symbol: string, name: string) => {
    if (!companies) return;
    
    // Check if company already exists client-side
    const exists = companies.some(company => company.symbol === symbol);
    if (exists) {
      toast.error(`${symbol} is already being tracked`);
      return;
    }
    
    const { success, data } = await executeCompaniesQuery(
      () => addTrackedCompany(symbol, name),
      {
        successMessage: `${symbol} has been added to tracked tickers`,
        errorMessage: `Failed to add ${symbol}. Please try again.`,
        onSuccess: () => {
          setNewTickerSearch("");
          setSearchResults([]);
          setIsAddTickerOpen(false);
        }
      }
    );
    
    if (success && data) {
      // Add the new company to the list
      setCompanies([...(companies || []), data]);
    }
  };

  const showEmptyState = (companies?.length === 0 && !isLoadingCompanies) || companiesError;

  return (
    <div className="space-y-6">
      <DashboardHeader
        heading="Dashboard"
        description="Welcome to tldrSEC."
      />
      
      {/* Tracked Tickers - Removed border */}
      <div>
        <div className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tracked Tickers</h2>
              <p className="text-sm text-muted-foreground">Manage your tracked companies.</p>
            </div>
            
            <Dialog open={isAddTickerOpen} onOpenChange={setIsAddTickerOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Ticker
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Ticker</DialogTitle>
                  <DialogDescription>
                    Search for a company to track its SEC filings.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="my-4">
                  <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search by ticker or company name..."
                      className="pl-8 w-full"
                      value={newTickerSearch}
                      onChange={(e) => handleSearchTickers(e.target.value)}
                    />
                  </div>
                  
                  {searchResults.length > 0 && (
                    <div className="mt-4 border rounded-md divide-y max-h-64 overflow-auto">
                      {searchResults.map((result) => (
                        <div 
                          key={result.symbol}
                          className="p-3 hover:bg-accent flex justify-between items-center cursor-pointer"
                          onClick={() => handleAddTicker(result.symbol, result.name)}
                        >
                          <div>
                            <p className="font-medium">{result.symbol}</p>
                            <p className="text-sm text-muted-foreground">{result.name}</p>
                          </div>
                          <Button size="sm" variant="ghost">
                            <PlusIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {newTickerSearch.length > 1 && searchResults.length === 0 && (
                    <div className="mt-4 text-center py-8 border rounded-md">
                      <p className="text-muted-foreground">No results found</p>
                    </div>
                  )}
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setNewTickerSearch("");
                    setSearchResults([]);
                    setIsAddTickerOpen(false);
                  }}>
                    Cancel
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="mt-6">
            {isLoadingCompanies ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : showEmptyState ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
                <h3 className="text-base font-medium">No companies tracked yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Start tracking companies to receive SEC filing summaries.
                </p>
                <Dialog open={isAddTickerOpen} onOpenChange={setIsAddTickerOpen}>
                  <DialogTrigger asChild>
                    <Button className="mt-6">Add Your First Company</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Ticker</DialogTitle>
                      <DialogDescription>
                        Search for a company to track its SEC filings.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="my-4">
                      <div className="relative">
                        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search by ticker or company name..."
                          className="pl-8 w-full"
                          value={newTickerSearch}
                          onChange={(e) => handleSearchTickers(e.target.value)}
                        />
                      </div>
                      
                      {searchResults.length > 0 && (
                        <div className="mt-4 border rounded-md divide-y max-h-64 overflow-auto">
                          {searchResults.map((result) => (
                            <div 
                              key={result.symbol}
                              className="p-3 hover:bg-accent flex justify-between items-center cursor-pointer"
                              onClick={() => handleAddTicker(result.symbol, result.name)}
                            >
                              <div>
                                <p className="font-medium">{result.symbol}</p>
                                <p className="text-sm text-muted-foreground">{result.name}</p>
                              </div>
                              <Button size="sm" variant="ghost">
                                <PlusIcon className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {newTickerSearch.length > 1 && searchResults.length === 0 && (
                        <div className="mt-4 text-center py-8 border rounded-md">
                          <p className="text-muted-foreground">No results found</p>
                        </div>
                      )}
                    </div>
                    
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {
                        setNewTickerSearch("");
                        setSearchResults([]);
                        setIsAddTickerOpen(false);
                      }}>
                        Cancel
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Filter companies..."
                      className="pl-8 w-full sm:max-w-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
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
                      {table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map(row => (
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
                            No companies found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                
                <div className="mt-4 text-right text-sm text-muted-foreground">
                  Total tracked tickers: {table.getRowModel().rows.length}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Preferences Dialog */}
      <Dialog 
        open={isPreferencesOpen} 
        onOpenChange={(open) => {
          setIsPreferencesOpen(open);
          if (!open) setCurrentCompany(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Form Preferences for {currentCompany?.symbol}
            </DialogTitle>
            <DialogDescription>
              Select which SEC form types you want to receive notifications for this ticker.
            </DialogDescription>
          </DialogHeader>
          
          {currentCompany && (
            <>
              <div className="py-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${currentCompany.symbol}-10k`} className="cursor-pointer">
                    10-K
                    <div className="text-xs text-muted-foreground">Annual Report</div>
                  </Label>
                  <Switch 
                    id={`${currentCompany.symbol}-10k`}
                    checked={currentCompany.preferences.tenK}
                    onCheckedChange={(checked) => {
                      setCurrentCompany({
                        ...currentCompany,
                        preferences: {
                          ...currentCompany.preferences,
                          tenK: checked
                        }
                      });
                    }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${currentCompany.symbol}-10q`} className="cursor-pointer">
                    10-Q
                    <div className="text-xs text-muted-foreground">Quarterly Report</div>
                  </Label>
                  <Switch 
                    id={`${currentCompany.symbol}-10q`}
                    checked={currentCompany.preferences.tenQ}
                    onCheckedChange={(checked) => {
                      setCurrentCompany({
                        ...currentCompany,
                        preferences: {
                          ...currentCompany.preferences,
                          tenQ: checked
                        }
                      });
                    }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${currentCompany.symbol}-8k`} className="cursor-pointer">
                    8-K
                    <div className="text-xs text-muted-foreground">Current Report</div>
                  </Label>
                  <Switch 
                    id={`${currentCompany.symbol}-8k`}
                    checked={currentCompany.preferences.eightK}
                    onCheckedChange={(checked) => {
                      setCurrentCompany({
                        ...currentCompany,
                        preferences: {
                          ...currentCompany.preferences,
                          eightK: checked
                        }
                      });
                    }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${currentCompany.symbol}-form4`} className="cursor-pointer">
                    Form 4
                    <div className="text-xs text-muted-foreground">Insider Trading</div>
                  </Label>
                  <Switch 
                    id={`${currentCompany.symbol}-form4`}
                    checked={currentCompany.preferences.form4}
                    onCheckedChange={(checked) => {
                      setCurrentCompany({
                        ...currentCompany,
                        preferences: {
                          ...currentCompany.preferences,
                          form4: checked
                        }
                      });
                    }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${currentCompany.symbol}-144`} className="cursor-pointer">
                    Form 144
                    <div className="text-xs text-muted-foreground">Proposed Sale of Securities</div>
                  </Label>
                  <Switch 
                    id={`${currentCompany.symbol}-144`}
                    checked={currentCompany.preferences.other}
                    onCheckedChange={(checked) => {
                      setCurrentCompany({
                        ...currentCompany,
                        preferences: {
                          ...currentCompany.preferences,
                          other: checked
                        }
                      });
                    }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${currentCompany.symbol}-13f`} className="cursor-pointer">
                    Form 13F
                    <div className="text-xs text-muted-foreground">Beneficial Ownership Report</div>
                  </Label>
                  <Switch 
                    id={`${currentCompany.symbol}-13f`}
                    checked={false}
                    disabled={true}
                    onCheckedChange={() => {}}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${currentCompany.symbol}-13g`} className="cursor-pointer">
                    Form 13G
                    <div className="text-xs text-muted-foreground">Beneficial Ownership Report</div>
                  </Label>
                  <Switch 
                    id={`${currentCompany.symbol}-13g`}
                    checked={false}
                    disabled={true}
                    onCheckedChange={() => {}}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setCurrentCompany(null);
                    setIsPreferencesOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    if (currentCompany) {
                      handleSavePreferences(
                        currentCompany.id, 
                        currentCompany.preferences
                      );
                    }
                  }}
                >
                  Save Preferences
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {companyToDelete?.symbol} ({companyToDelete?.name}) from your tracked tickers?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteConfirmOpen(false);
                setCompanyToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => companyToDelete && handleDeleteCompany(companyToDelete.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 