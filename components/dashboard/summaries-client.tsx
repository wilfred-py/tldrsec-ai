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
import { SearchIcon, RefreshCw, FileTextIcon, InfoIcon } from "lucide-react";
import { SummaryCard } from "@/components/summary/summary-card";
import { Summary } from "@/lib/generated/prisma";
import { useAsync } from "@/lib/hooks/use-async";
import { getRecentSummaries, SummaryWithTicker as ApiSummaryWithTicker } from "@/lib/api/summary-service";
import { ApiResponse } from "@/lib/api/types";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");

  // Use the useAsync hook
  const { data, isLoading, error, execute } = useAsync<SummaryWithTicker[]>([], {
    onMount: true,
    asyncFn: async () => {
      try {
        const response = await getRecentSummaries();
        if (response && response.data) {
          return response.data;
        }
        return [];
      } catch (error) {
        console.error("Error fetching summaries:", error);
        return [];
      }
    }
  });

  // Function to handle search input changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Function to refresh summaries
  const handleRefresh = () => {
    execute();
    router.refresh();
  };

  // Filter and sort summaries
  const filteredSummaries = (data || [])
    .filter(summary => {
      // Apply search filter
      const matchesSearch = searchTerm === "" || 
        summary.ticker.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        summary.ticker.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        summary.summaryText.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Apply tab filter
      const matchesFilter = 
        filter === "all" || 
        (filter === "10k" && summary.filingType === "10-K") ||
        (filter === "10q" && summary.filingType === "10-Q") ||
        (filter === "8k" && summary.filingType === "8-K");
      
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      // Apply sorting
      if (sortBy === "date-desc") {
        return new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime();
      } else if (sortBy === "date-asc") {
        return new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime();
      } else if (sortBy === "ticker") {
        return a.ticker.symbol.localeCompare(b.ticker.symbol);
      } else {
        return 0;
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search summaries by ticker or keyword..."
              className="pl-8"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest first</SelectItem>
              <SelectItem value="date-asc">Oldest first</SelectItem>
              <SelectItem value="ticker">Ticker symbol</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          title="Refresh summaries"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      <Tabs defaultValue="all" onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All Filings</TabsTrigger>
          <TabsTrigger value="10k">10-K</TabsTrigger>
          <TabsTrigger value="10q">10-Q</TabsTrigger>
          <TabsTrigger value="8k">8-K</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-6">
          {renderSummaryList(filteredSummaries, isLoading)}
        </TabsContent>
        <TabsContent value="10k" className="mt-6">
          {renderSummaryList(filteredSummaries, isLoading)}
        </TabsContent>
        <TabsContent value="10q" className="mt-6">
          {renderSummaryList(filteredSummaries, isLoading)}
        </TabsContent>
        <TabsContent value="8k" className="mt-6">
          {renderSummaryList(filteredSummaries, isLoading)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function renderSummaryList(
  summaries: SummaryWithTicker[],
  isLoading: boolean
) {
  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <EmptyPlaceholder
        title="No summaries found"
        description="Try adjusting your search or filter criteria."
        icon={() => <FileTextIcon className="h-8 w-8" />}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {summaries.map((summary) => (
        <SummaryCard key={summary.id} summary={summary as any} />
      ))}
    </div>
  );
} 