"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { SearchIcon, SettingsIcon, Trash2Icon, PlusIcon } from "lucide-react";
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

// Representing a company with filing preferences
interface Company {
  symbol: string;
  name: string;
  lastFiling: string;
  preferences: {
    tenK: boolean;
    tenQ: boolean;
    eightK: boolean;
    form4: boolean;
    other: boolean;
  };
}

// This would typically come from an API or database
const MOCK_COMPANIES: Company[] = [
  { 
    symbol: "AAPL", 
    name: "Apple Inc.", 
    lastFiling: "2 days ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: false }
  },
  { 
    symbol: "MSFT", 
    name: "Microsoft Corp.", 
    lastFiling: "1 week ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
  { 
    symbol: "GOOGL", 
    name: "Alphabet Inc.", 
    lastFiling: "3 days ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: false }
  },
  { 
    symbol: "AMZN", 
    name: "Amazon.com Inc.", 
    lastFiling: "1 day ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: true }
  },
  { 
    symbol: "META", 
    name: "Meta Platforms Inc.", 
    lastFiling: "2 weeks ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
  { 
    symbol: "TSLA", 
    name: "Tesla, Inc.", 
    lastFiling: "5 days ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: false }
  },
  { 
    symbol: "NVDA", 
    name: "NVIDIA Corporation", 
    lastFiling: "1 week ago",
    preferences: { tenK: true, tenQ: true, eightK: false, form4: false, other: false }
  },
  { 
    symbol: "AMD", 
    name: "Advanced Micro Devices, Inc.", 
    lastFiling: "3 weeks ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
  { 
    symbol: "INTC", 
    name: "Intel Corporation", 
    lastFiling: "2 weeks ago",
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
];

// More comprehensive list of available tickers for search
// In a real application, this would come from an API or database
const AVAILABLE_TICKERS = [
  { symbol: "WMT", name: "Walmart Inc." },
  { symbol: "TGT", name: "Target Corporation" },
  { symbol: "COST", name: "Costco Wholesale Corp." },
  { symbol: "HD", name: "Home Depot Inc." },
  { symbol: "LOW", name: "Lowe's Companies Inc." },
  { symbol: "SBUX", name: "Starbucks Corporation" },
  { symbol: "MCD", name: "McDonald's Corporation" },
  { symbol: "DIS", name: "The Walt Disney Company" },
  { symbol: "NFLX", name: "Netflix Inc." },
  { symbol: "JPM", name: "JPMorgan Chase & Co." },
  { symbol: "BAC", name: "Bank of America Corp." },
  { symbol: "WFC", name: "Wells Fargo & Co." },
  { symbol: "C", name: "Citigroup Inc." },
  { symbol: "GS", name: "Goldman Sachs Group Inc." },
  { symbol: "V", name: "Visa Inc." },
  { symbol: "MA", name: "Mastercard Inc." },
  { symbol: "PYPL", name: "PayPal Holdings Inc." },
  { symbol: "SQ", name: "Block Inc." },
  { symbol: "ADBE", name: "Adobe Inc." },
  { symbol: "CRM", name: "Salesforce Inc." },
  { symbol: "IBM", name: "International Business Machines Corp." },
  { symbol: "ORCL", name: "Oracle Corporation" },
  { symbol: "CSCO", name: "Cisco Systems Inc." },
  { symbol: "QCOM", name: "Qualcomm Inc." },
  { symbol: "TMO", name: "Thermo Fisher Scientific Inc." },
  { symbol: "DHR", name: "Danaher Corporation" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "PFE", name: "Pfizer Inc." },
  { symbol: "MRK", name: "Merck & Co. Inc." },
  { symbol: "ABBV", name: "AbbVie Inc." },
  { symbol: "LLY", name: "Eli Lilly and Company" },
  { symbol: "PG", name: "Procter & Gamble Co." },
  { symbol: "KO", name: "Coca-Cola Company" },
  { symbol: "PEP", name: "PepsiCo Inc." },
  { symbol: "MDLZ", name: "Mondelez International Inc." },
  { symbol: "NKE", name: "Nike Inc." },
  { symbol: "ABNB", name: "Airbnb Inc." }
];

export function DashboardClient() {
  const [companies, setCompanies] = useState<Company[]>(MOCK_COMPANIES);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [newTickerSearch, setNewTickerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<typeof AVAILABLE_TICKERS>([]);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isAddTickerOpen, setIsAddTickerOpen] = useState(false);
  
  // Filter companies based on search query
  const filteredCompanies = companies.filter(company => 
    company.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
    company.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle saving preferences for a company
  const handleSavePreferences = (symbol: string, preferences: Company['preferences']) => {
    setCompanies(companies.map(company => 
      company.symbol === symbol ? { ...company, preferences } : company
    ));
    toast.success(`Preferences updated for ${symbol}`);
    setIsPreferencesOpen(false); // Close modal after saving
  };

  // Handle deleting a company
  const handleDeleteCompany = (symbol: string) => {
    setCompanies(companies.filter(company => company.symbol !== symbol));
    toast.success(`${symbol} has been removed from tracked tickers`);
  };

  // Handle search for adding new tickers
  const handleSearchTickers = (query: string) => {
    setNewTickerSearch(query);
    if (query.length > 1) {
      const results = AVAILABLE_TICKERS.filter(ticker => 
        ticker.symbol.toLowerCase().includes(query.toLowerCase()) || 
        ticker.name.toLowerCase().includes(query.toLowerCase())
      );
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  // Handle adding a new ticker
  const handleAddTicker = (symbol: string, name: string) => {
    const exists = companies.some(company => company.symbol === symbol);
    if (!exists) {
      const newCompany: Company = {
        symbol,
        name,
        lastFiling: "—",
        preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
      };
      setCompanies([...companies, newCompany]);
      toast.success(`${symbol} has been added to tracked tickers`);
      setNewTickerSearch("");
      setSearchResults([]);
      setIsAddTickerOpen(false); // Close modal after adding
    } else {
      toast.error(`${symbol} is already being tracked`);
    }
  };

  const showEmptyState = filteredCompanies.length === 0 && searchQuery === "";

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
            {showEmptyState ? (
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
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Last Filing</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCompanies.map((company) => (
                        <TableRow key={company.symbol}>
                          <TableCell className="font-medium">{company.symbol}</TableCell>
                          <TableCell>{company.name}</TableCell>
                          <TableCell>{company.lastFiling}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Dialog open={isPreferencesOpen && currentCompany?.symbol === company.symbol} 
                                      onOpenChange={(open) => {
                                        setIsPreferencesOpen(open);
                                        if (!open) setCurrentCompany(null);
                                      }}>
                                <DialogTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setCurrentCompany(company);
                                      setIsPreferencesOpen(true);
                                    }}
                                  >
                                    <SettingsIcon className="h-4 w-4" />
                                    <span className="sr-only">Settings</span>
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>
                                      {company.symbol} Filing Preferences
                                    </DialogTitle>
                                    <DialogDescription>
                                      Select which filing types you want to receive for {company.name}.
                                    </DialogDescription>
                                  </DialogHeader>
                                  
                                  {currentCompany && currentCompany.symbol === company.symbol && (
                                    <>
                                      <div className="py-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                          <Label htmlFor={`${company.symbol}-10k`} className="cursor-pointer">
                                            10-K and 10-Q Reports
                                          </Label>
                                          <Switch 
                                            id={`${company.symbol}-10k`}
                                            checked={currentCompany.preferences.tenK}
                                            onCheckedChange={(checked) => {
                                              setCurrentCompany({
                                                ...currentCompany,
                                                preferences: {
                                                  ...currentCompany.preferences,
                                                  tenK: checked,
                                                  tenQ: checked
                                                }
                                              });
                                            }}
                                          />
                                        </div>
                                        
                                        <div className="flex items-center justify-between">
                                          <Label htmlFor={`${company.symbol}-8k`} className="cursor-pointer">
                                            8-K Reports
                                          </Label>
                                          <Switch 
                                            id={`${company.symbol}-8k`}
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
                                          <Label htmlFor={`${company.symbol}-form4`} className="cursor-pointer">
                                            Form 4 (Insider Trading)
                                          </Label>
                                          <Switch 
                                            id={`${company.symbol}-form4`}
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
                                          <Label htmlFor={`${company.symbol}-other`} className="cursor-pointer">
                                            Other Filings
                                          </Label>
                                          <Switch 
                                            id={`${company.symbol}-other`}
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
                                      </div>
                                      
                                      <DialogFooter>
                                        <Button variant="outline" onClick={() => {
                                          setCurrentCompany(null);
                                          setIsPreferencesOpen(false);
                                        }}>
                                          Cancel
                                        </Button>
                                        <Button 
                                          onClick={() => {
                                            if (currentCompany) {
                                              handleSavePreferences(
                                                currentCompany.symbol, 
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
                              
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => handleDeleteCompany(company.symbol)}
                              >
                                <Trash2Icon className="h-4 w-4" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <div className="mt-4 text-right text-sm text-muted-foreground">
                  Total tracked tickers: {filteredCompanies.length}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 