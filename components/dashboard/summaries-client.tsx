"use client";

import { useState, useEffect } from "react";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { EmptyPlaceholder } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchIcon, RefreshCw } from "lucide-react";
import { SummaryCard } from "@/components/summary/summary-card";
import { Summary } from "@/lib/generated/prisma";
import { useAsync } from "@/lib/hooks/use-async";
import { getRecentSummaries, SummaryWithTicker as ApiSummaryWithTicker } from "@/lib/api/summary-service";
import { ApiResponse } from "@/lib/api/types";
import Link from "next/link";

// Extend the interface to match the structure from the API service
interface SummaryWithTicker extends Summary {
  ticker: {
    id: string;
    symbol: string;
    companyName: string;
    userId: string;
    addedAt: Date;
  };
}

export function SummariesClient() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filingType, setFilingType] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [filteredSummaries, setFilteredSummaries] = useState<SummaryWithTicker[]>([]);

  // Wrap getRecentSummaries in a function that returns the expected ApiResponse format
  const fetchSummariesWithApiResponse = async (): Promise<ApiResponse<SummaryWithTicker[]>> => {
    try {
      const summaries = await getRecentSummaries();
      // Convert the API type to our component type if needed
      const convertedSummaries = summaries as unknown as SummaryWithTicker[];
      return { data: convertedSummaries };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch summaries';
      return {
        error: {
          status: 500,
          message
        }
      };
    }
  };

  // Use the custom hook for async operations
  const {
    data: summaries,
    isLoading,
    error,
    execute: fetchSummaries
  } = useAsync<SummaryWithTicker[]>([]);

  // Fetch summaries on component mount
  useEffect(() => {
    fetchSummaries(
      fetchSummariesWithApiResponse,
      {
        errorMessage: "Failed to load summaries. Please try again."
      }
    );
  }, [fetchSummaries]);

  // Filter and sort summaries when data, filingType or sortBy changes
  useEffect(() => {
    if (!summaries) {
      setFilteredSummaries([]);
      return;
    }

    let filtered = [...summaries];
    
    // Filter by filing type if specified
    if (filingType !== "all") {
      filtered = filtered.filter(summary => 
        summary.filingType.toUpperCase() === filingType.toUpperCase()
      );
    }
    
    // Sort the summaries
    filtered = filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime();
        case 'oldest':
          return new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime();
        case 'company-asc':
          return a.ticker.symbol.localeCompare(b.ticker.symbol);
        case 'company-desc':
          return b.ticker.symbol.localeCompare(a.ticker.symbol);
        default:
          return 0;
      }
    });

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(summary => 
        summary.ticker.symbol.toLowerCase().includes(query) ||
        summary.ticker.companyName?.toLowerCase().includes(query) ||
        summary.filingType.toLowerCase().includes(query) ||
        summary.summaryText.toLowerCase().includes(query)
      );
    }
    
    setFilteredSummaries(filtered);
  }, [summaries, filingType, sortBy, searchQuery]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Handle refresh button click
  const handleRefresh = () => {
    fetchSummaries(
      fetchSummariesWithApiResponse,
      {
        errorMessage: "Failed to refresh summaries. Please try again."
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Search and filter controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search summaries..."
            className="pl-8 w-full md:max-w-sm"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        
        <div className="flex gap-2">
          <Select 
            defaultValue="newest"
            value={sortBy}
            onValueChange={setSortBy}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="company-asc">Company (A-Z)</SelectItem>
              <SelectItem value="company-desc">Company (Z-A)</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="icon" 
            className="h-10 w-10"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>
      
      {/* Tabs for different filing types */}
      <Tabs 
        defaultValue="all" 
        value={filingType}
        onValueChange={setFilingType}
        className="w-full"
      >
        <TabsList className="mb-6">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="10-K">10-K</TabsTrigger>
          <TabsTrigger value="10-Q">10-Q</TabsTrigger>
          <TabsTrigger value="8-K">8-K</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
        
        {/* Display summaries or empty state */}
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-24 bg-muted rounded-md" />
            ))}
          </div>
        ) : filteredSummaries.length > 0 ? (
          <div className="space-y-4">
            {filteredSummaries.map((summary) => (
              <SummaryCard 
                key={summary.id}
                summary={summary}
              />
            ))}
          </div>
        ) : (
          <EmptyPlaceholder
            title={`No ${filingType !== 'all' ? filingType : ''} summaries yet`}
            description="Summaries will appear here once you start tracking companies."
            actions={
              <Link href="/dashboard">
                <Button>Add Company</Button>
              </Link>
            }
          />
        )}
      </Tabs>
    </div>
  );
} 