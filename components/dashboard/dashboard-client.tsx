"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { CompanySearch } from "@/components/dashboard/company-search";
import { Input } from "@/components/ui/input";
import { SearchIcon, SettingsIcon, Trash2Icon, PlusIcon, ArrowUpDown, ChevronDown, ChevronUp, Mail as EnvelopeIcon } from "lucide-react";

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
  FilterFn,
  getFilteredRowModel
} from "@tanstack/react-table";
import { Company, TickerSearchResult } from "@/lib/api/types";
import { getTrackedCompanies, searchCompanies, addTrackedCompany, deleteTrackedCompany, updateCompanyPreferences } from "@/lib/api/ticker-service";
import { useAsync } from "@/lib/hooks/use-async";
import { TutorialGuide } from "@/components/onboarding/tutorial-guide";

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
  const [newTickerSearch, setNewTickerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialProgress, setTutorialProgress] = useState(0);
  
  // State for email request
  const [isEmailRequestLoading, setIsEmailRequestLoading] = useState(false);
  
  // Async hooks for API calls
  const { execute: executeGetCompanies, status: companiesStatus, error: companiesError } = useAsync(getTrackedCompanies);
  const { execute: executeSearchTickers, status: searchStatus } = useAsync(searchCompanies);
  const { execute: executeAddTicker, status: addStatus } = useAsync(addTrackedCompany);
  const { execute: executeDeleteTicker, status: deleteStatus } = useAsync(deleteTrackedCompany);
  const { execute: executeUpdatePreferences, status: updateStatus } = useAsync(updateCompanyPreferences);
  const { execute: executeEmailRequest } = useAsync();
  
  const isLoadingCompanies = companiesStatus === 'pending';
  const isSearchingTickers = searchStatus === 'pending';
  const isAddingTicker = addStatus === 'pending';
  const isDeletingTicker = deleteStatus === 'pending';
  const isUpdatingPreferences = updateStatus === 'pending';
  


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
  }, []);
  
  // Save tutorial progress when it changes
  useEffect(() => {
    if (tutorialProgress > 0) {
      localStorage.setItem('tutorialProgress', tutorialProgress.toString());
    }
  }, [tutorialProgress]);
  
  // Load tracked companies
  const loadCompanies = async () => {
    try {
      const data = await executeGetCompanies();
      setCompanies(data || []);
    } catch (error) {
      console.error("Error loading companies:", error);
      toast.error("Failed to load tracked companies");
    }
  };
  



  
  // Handle adding a ticker
  const handleAddTicker = async (symbol: string, name: string) => {
    setIsAddTickerOpen(false);
    setNewTickerSearch("");
    setSearchResults([]);
    
    try {
      await executeAddTicker(symbol);
      toast.success(`Added ${symbol} to your tracked companies`);
      
      // Add to local state to avoid refetch
      setCompanies(prevCompanies => {
        // Ensure prev is an array before spreading
        const prevArray = Array.isArray(prevCompanies) ? prevCompanies : [];
        
        return [...prevArray, { 
          id: `temp-${Date.now()}`, // Temporary ID until refresh
          symbol, 
          name, 
          companyName: name,
          lastFiling: "—", // Placeholder
          lastFilingDate: "", // Empty string instead of null
          preferences: { 
            emailAlerts: true, 
            pushNotifications: false,
            summaryFrequency: 'daily',
            // Add missing FilingPreferences properties
            tenK: true,
            tenQ: true,
            eightK: true,
            form4: false,
            other: false
          } 
        } as Company];
      });
      
      // Show next step in tutorial if active
      if (showTutorial && tutorialProgress === 0) {
        setTutorialProgress(1);
      }
    } catch (error) {
      console.error("Error adding ticker:", error);
      toast.error(`Failed to add ${symbol}`);
    }
  };
  
  // Handle deleting a ticker
  const handleDeleteTicker = async () => {
    if (!currentCompany) return;
    
    try {
      await executeDeleteTicker(currentCompany.symbol);
      toast.success(`Removed ${currentCompany.symbol} from tracked companies`);
      
      // Remove from local state
      setCompanies(prev => prev.filter(c => c.symbol !== currentCompany.symbol));
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
      await executeUpdatePreferences(currentCompany.symbol, currentCompany.preferences);
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
  const handlePreferenceChange = (key: keyof Company['preferences'], value: any) => {
    if (!currentCompany) return;
    
    setCurrentCompany({
      ...currentCompany,
      preferences: {
        ...currentCompany.preferences,
        [key]: value
      }
    });
  };
  
  // Handle requesting email summary
  const handleRequestEmailSummary = async () => {
    try {
      // Get tickers from tracked companies
      const tickers = companies ? companies.map(company => company.symbol) : [];
      
      // Execute the API request
      setIsEmailRequestLoading(true);
      const result = await executeEmailRequest(async () => {
        const response = await fetch('/api/email/filings-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tickers }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to send email');
        }
        
        return response.json();
      }, {
        errorMessage: 'Failed to send filing summaries email.'
      });
      
      if (result?.success) {
        toast.success('Filing summaries email sent! Check your inbox.');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setIsEmailRequestLoading(false);
    }
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
      
      {/* Tracked Tickers - Removed border */}
      <div>
        <div className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tracked Tickers</h2>
              <p className="text-sm text-muted-foreground">Manage your tracked companies.</p>
            </div>
            
            <div className="flex gap-2">
              {/* Email Latest Filings Button */}
              <Button
                onClick={handleRequestEmailSummary}
                disabled={isEmailRequestLoading}
                className="gap-1"
              >
                <EnvelopeIcon className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Email Latest Filings</span>
                <span className="inline sm:hidden">Email</span>
              </Button>
              
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
          </div>
        </div>
        
        {isLoadingCompanies ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-4 sm:p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading tracked companies...</p>
          </div>
        ) : showEmptyState ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed p-4 sm:p-8 text-center">
            <h3 className="text-base font-medium">No companies tracked yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
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
                <Label htmlFor="email-alerts">Email Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Receive email alerts for new filings
                </p>
              </div>
              <Switch
                id="email-alerts"
                checked={currentCompany?.preferences?.emailAlerts}
                onCheckedChange={(checked) => handlePreferenceChange('emailAlerts', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="push-notifications">Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive push notifications for new filings
                </p>
              </div>
              <Switch
                id="push-notifications"
                checked={currentCompany?.preferences?.pushNotifications}
                onCheckedChange={(checked) => handlePreferenceChange('pushNotifications', checked)}
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
