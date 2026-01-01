"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { CompanySearch } from "@/components/dashboard/company-search";
import { SettingsIcon, Trash2Icon, PlusIcon, ArrowUpDown, Loader2 } from "lucide-react";

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
} from "@tanstack/react-table";
import { Company } from "@/lib/api/types";
import { getTrackedCompanies, addTrackedCompany, deleteTrackedCompany, updateCompanyPreferences } from "@/lib/api/ticker-service";
import { useAsync } from "@/lib/hooks/use-async";
import { TutorialGuide } from "@/components/onboarding/tutorial-guide";
import { SystemHealthBanner } from "@/components/dashboard/system-health-banner";
import { ProcessingStatus } from "@/components/dashboard/processing-status";

// Column helper for the table
const columnHelper = createColumnHelper<Company>();

export function DashboardClient() {
  // State for tracked companies
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAddTickerOpen, setIsAddTickerOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialProgress, setTutorialProgress] = useState(0);
  
  
  // Async hooks for API calls
  const { execute: executeGetCompanies, isLoading: isLoadingCompanies, error: companiesError } = useAsync([]);
  const { execute: executeAddTicker } = useAsync();
  const { execute: executeDeleteTicker, isLoading: isDeletingTicker } = useAsync();
  const { execute: executeUpdatePreferences, isLoading: isUpdatingPreferences } = useAsync();
  
  

  // Load tracked companies
  const loadCompanies = useCallback(async () => {
    try {
      const response = await executeGetCompanies(() => getTrackedCompanies());
      if (response && 'data' in response && Array.isArray(response.data)) {
        setCompanies(response.data);
      } else {
        setCompanies([]);
      }
    } catch (error) {
      console.error("Error loading companies:", error);
      toast.error("Failed to load tracked companies");
    }
  }, [executeGetCompanies, setCompanies]);

  // Load tracked companies on component mount
  useEffect(() => {
    loadCompanies();
    
    // Check if user is new and should see tutorial
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
      localStorage.setItem('hasSeenTutorial', 'true');
    }
    
    // Load tutorial progress if available
    const savedProgress = localStorage.getItem('tutorialProgress');
    if (savedProgress) {
      setTutorialProgress(parseInt(savedProgress, 10));
    }
  }, [loadCompanies]);
  



  
  // Handle adding a ticker
  const handleAddTicker = async (symbol: string, name: string) => {
    setIsAddTickerOpen(false);
    
    // Create a new company object for optimistic update
    const newCompany: Company = {
      id: `temp-${Date.now()}`, // Temporary ID that will be replaced after API refresh
      symbol,
      name, // name property is the company name in the Company interface
      lastFiling: "—",
      lastFilingDate: undefined, // Using undefined instead of null to match Company type
      preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
    };
    
    // Optimistically add the company to the list to reduce perceived latency
    setCompanies(prevCompanies => {
      // Check if this ticker already exists to prevent duplicates
      const exists = prevCompanies.some(company => company.symbol === symbol);
      if (exists) {
        // If it exists, don't add it again
        return prevCompanies;
      }
      // Add the new company to the list
      return [...prevCompanies, newCompany];
    });
    
    try {
      // Add the ticker to the database
      const result = await executeAddTicker(() => addTrackedCompany(symbol, name));
      
      if (result && result.success && result.data) {
        toast.success(`Added ${symbol} to your tracked companies`);
        
        // Explicitly reload the companies list from the API to ensure we have the latest data
        // This will replace our optimistic update with the real data
        try {
          // Call executeGetCompanies with a function that calls getTrackedCompanies
          const response = await executeGetCompanies(() => getTrackedCompanies());
          if (response && 'data' in response && Array.isArray(response.data)) {
            setCompanies(response.data);
          }
        } catch (refreshError) {
          console.error("Error refreshing companies list:", refreshError);
          // Even if refresh fails, we still added the ticker successfully
          // and our optimistic update remains in place
        }
        
        // Show next step in tutorial if active
        if (showTutorial && tutorialProgress === 0) {
          setTutorialProgress(1);
        }
      } else {
        // Handle API error response - remove the optimistic update
        setCompanies(prevCompanies => prevCompanies.filter(company => company.id !== newCompany.id));
        
        // Get error message from result if available
        let errorMessage = `Failed to add ${symbol}`;
        if (!result.success && result.data === null) {
          errorMessage = `Failed to add ${symbol}: The ticker may already be tracked or not exist`;
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      // Remove the optimistic update on error
      setCompanies(prevCompanies => prevCompanies.filter(company => company.id !== newCompany.id));
      
      console.error("Error adding ticker:", error);
      toast.error(`Failed to add ${symbol}`);
    }
  };
  
  // Handle deleting a ticker
  const handleDeleteTicker = async () => {
    if (!currentCompany) return;
    
    try {
      await executeDeleteTicker(() => deleteTrackedCompany(currentCompany.id));
      toast.success(`Removed ${currentCompany.symbol} from tracked companies`);
      
      // Remove from local state
      setCompanies(prev => prev.filter(c => c.id !== currentCompany.id));
      setIsDeleteDialogOpen(false);
      setCurrentCompany(null);
    } catch (error) {
      console.error("Error deleting ticker:", error);
      toast.error(`Failed to remove ${currentCompany.symbol}`);
    }
  };
  
  // Handle updating company preferences
  const handleUpdatePreferences = async () => {
    if (!currentCompany) return;
    
    try {
      await executeUpdatePreferences(() => updateCompanyPreferences(currentCompany.symbol, currentCompany.preferences));
      toast.success(`Updated preferences for ${currentCompany.symbol}`);
      
      // Update in local state
      setCompanies(prev => prev.map(c => 
        c.symbol === currentCompany.symbol ? currentCompany : c
      ));
      
      setIsPreferencesOpen(false);
    } catch (error) {
      console.error("Error updating preferences:", error);
      toast.error(`Failed to update preferences for ${currentCompany.symbol}`);
    }
  };
  
  // Handle preference toggle changes
  const handlePreferenceChange = (key: keyof Company['preferences'], value: boolean) => {
    if (!currentCompany) return;
    
    setCurrentCompany({
      ...currentCompany,
      preferences: {
        ...currentCompany.preferences,
        [key]: value
      }
    });
  };
  
  
  // Table columns definition
  const columns = useMemo(() => [
    columnHelper.accessor('symbol', {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="pl-0 font-medium"
        >
          Ticker
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: info => <div className="font-medium">{info.getValue()}</div>,
    }),
    columnHelper.accessor('name', {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="pl-0 font-medium"
        >
          Company
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: info => <div>{info.getValue()}</div>,
    }),
    columnHelper.accessor(row => row, {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: info => {
        const company = info.getValue();
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCurrentCompany(company);
                setIsPreferencesOpen(true);
              }}
              className="h-8 w-8"
              data-tutorial="preferences"
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="sr-only">Preferences</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCurrentCompany(company);
                setIsDeleteDialogOpen(true);
              }}
              className="h-8 w-8"
            >
              <Trash2Icon className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        );
      },
    }),
  ], []);
  
  // Initialize table
  const table = useReactTable({
    data: companies || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });
  
  const showEmptyState = (companies?.length === 0 && !isLoadingCompanies) || companiesError;

  return (
    <div className="space-y-6">
      <DashboardHeader
        heading="Dashboard"
        description="Welcome to tldrSEC."
      />
      
      {/* System Health & Status */}
      <SystemHealthBanner />
      <ProcessingStatus />
      
      {/* Tracked Tickers - Removed border */}
      <div className="landing-card">
        <div className="mb-6 text-center">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="mx-auto sm:mx-0">
              <h2 className="text-lg font-semibold">Tracked Tickers</h2>
              <p className="text-sm text-muted-foreground">Manage your tracked companies.</p>
            </div>
            
            <div className="flex gap-2">
              {/* Email Latest Filings Button - HIDDEN */}
              {/* <Button
                onClick={handleRequestEmailSummary}
                disabled={isEmailRequestLoading}
                className="gap-1"
              >
                <EnvelopeIcon className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Email Latest Filings</span>
                <span className="inline sm:hidden">Email</span>
              </Button> */}
              
              <Dialog open={isAddTickerOpen} onOpenChange={setIsAddTickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => setIsAddTickerOpen(true)}
                    className="gap-1"
                    data-tutorial="add-ticker"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Add Ticker</span>
                    <span className="inline sm:hidden">Add</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Ticker</DialogTitle>
                    <DialogDescription>
                      Search for a company to track its SEC filings.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="my-4">
                    <CompanySearch 
                      onSelect={handleAddTicker}
                      onCancel={() => setIsAddTickerOpen(false)}
                    />
                  </div>
                  
                  <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => {
                      setIsAddTickerOpen(false);
                    }}>
                      Cancel
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
        
        {isLoadingCompanies ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-4 sm:p-8 text-center space-y-3">
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Loading tracked companies...</p>
          </div>
        ) : showEmptyState ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-4 sm:p-8 text-center space-y-4">
            <h3 className="text-base font-medium">No companies tracked yet</h3>
            <p className="text-sm text-muted-foreground">
              Start tracking companies to receive SEC filing summaries.
            </p>
            <Dialog open={isAddTickerOpen} onOpenChange={setIsAddTickerOpen}>
              <DialogTrigger asChild>
                <Button className="mt-6">Add Your First Company</Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Ticker</DialogTitle>
                  <DialogDescription>
                    Search for a company to track its SEC filings.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="my-4">
                  <CompanySearch 
                    onSelect={handleAddTicker}
                    onCancel={() => setIsAddTickerOpen(false)}
                  />
                </div>
                
                <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => {
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
            {/* Desktop Table View */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
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
            
            {/* Mobile Card View */}
            <div className="sm:hidden space-y-4">
              {companies.map(company => (
                <div key={company.symbol} className="border rounded-md p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium">{company.symbol}</h3>
                      <p className="text-sm text-muted-foreground">{company.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setCurrentCompany(company);
                          setIsPreferencesOpen(true);
                        }}
                        className="h-8 w-8"
                      >
                        <SettingsIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setCurrentCompany(company);
                          setIsDeleteDialogOpen(true);
                        }}
                        className="h-8 w-8"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {currentCompany?.symbol} from your tracked companies?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTicker} disabled={isDeletingTicker}>
              {isDeletingTicker ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Preferences Dialog */}
      <Dialog open={isPreferencesOpen} onOpenChange={setIsPreferencesOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Company Preferences</DialogTitle>
            <DialogDescription>
              Customize your preferences for {currentCompany?.symbol}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="tenK">10-K Filings</Label>
                <p className="text-sm text-muted-foreground">
                  Annual reports
                </p>
              </div>
              <Switch
                id="tenK"
                checked={currentCompany?.preferences?.tenK}
                onCheckedChange={(checked) => handlePreferenceChange('tenK', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="tenQ">10-Q Filings</Label>
                <p className="text-sm text-muted-foreground">
                  Quarterly reports
                </p>
              </div>
              <Switch
                id="tenQ"
                checked={currentCompany?.preferences?.tenQ}
                onCheckedChange={(checked) => handlePreferenceChange('tenQ', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="eightK">8-K Filings</Label>
                <p className="text-sm text-muted-foreground">
                  Current reports
                </p>
              </div>
              <Switch
                id="eightK"
                checked={currentCompany?.preferences?.eightK}
                onCheckedChange={(checked) => handlePreferenceChange('eightK', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="form4">Form 4 Filings</Label>
                <p className="text-sm text-muted-foreground">
                  Insider trading reports
                </p>
              </div>
              <Switch
                id="form4"
                checked={currentCompany?.preferences?.form4}
                onCheckedChange={(checked) => handlePreferenceChange('form4', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="other">Other Filings</Label>
                <p className="text-sm text-muted-foreground">
                  All other SEC filings
                </p>
              </div>
              <Switch
                id="other"
                checked={currentCompany?.preferences?.other}
                onCheckedChange={(checked) => handlePreferenceChange('other', checked)}
              />
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsPreferencesOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePreferences} disabled={isUpdatingPreferences}>
              {isUpdatingPreferences ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>  
        </DialogContent>
      </Dialog>

      {/* Tutorial Guide */}
      <TutorialGuide
        active={showTutorial}
        onComplete={() => setShowTutorial(false)}
        initialProgress={tutorialProgress}
      />
    </div>
  );
}
