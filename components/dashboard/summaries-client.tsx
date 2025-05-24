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
import { SearchIcon, RefreshCw, FileTextIcon } from "lucide-react";
import { SummaryCard } from "@/components/summary/summary-card";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface SummaryWithTicker {
  id: string;
  filingType: string;
  filingDate: string;
  filingUrl: string;
  summaryText: string;
  createdAt: string;
  tickerId: string;
  ticker: {
    id: string;
    symbol: string;
    companyName: string;
    userId: string;
    addedAt: string;
  };
}

export function SummariesClient() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<SummaryWithTicker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");

  useEffect(() => {
    const fetchSummaries = async () => {
      setIsLoading(true);
      try {
        // In a real implementation, this would be an API call with filters
        const response = await fetch('/api/summaries');
        const data = await response.json();
        
        if (data.success) {
          setSummaries(data.summaries);
        } else {
          console.error("Failed to fetch summaries:", data.error);
        }
      } catch (error) {
        console.error("Error fetching summaries:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummaries();
  }, []);

  // For demo purposes, we'll use mock data if no summaries are fetched
  const mockSummaries: SummaryWithTicker[] = isLoading || summaries.length > 0 ? [] : [
    {
      id: "1",
      filingType: "10-K",
      filingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      filingUrl: "https://www.sec.gov/example",
      summaryText: "Annual report highlighting strong revenue growth despite market challenges. Key financials show a 15% increase in operating income and expansion into new markets.",
      createdAt: new Date().toISOString(),
      tickerId: "t1",
      ticker: {
        id: "t1",
        symbol: "AAPL",
        companyName: "Apple Inc.",
        userId: "user1",
        addedAt: new Date().toISOString()
      }
    },
    {
      id: "2",
      filingType: "8-K",
      filingDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      filingUrl: "https://www.sec.gov/example2",
      summaryText: "Current report announcing the appointment of a new Chief Financial Officer with extensive experience in the technology sector.",
      createdAt: new Date().toISOString(),
      tickerId: "t2",
      ticker: {
        id: "t2",
        symbol: "MSFT",
        companyName: "Microsoft Corporation",
        userId: "user1",
        addedAt: new Date().toISOString()
      }
    },
    {
      id: "3",
      filingType: "10-Q",
      filingDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      filingUrl: "https://www.sec.gov/example3",
      summaryText: "Quarterly report showing better than expected earnings. Revenue increased by 12% year-over-year with strong performance in cloud services division.",
      createdAt: new Date().toISOString(),
      tickerId: "t1",
      ticker: {
        id: "t1",
        symbol: "AAPL",
        companyName: "Apple Inc.",
        userId: "user1",
        addedAt: new Date().toISOString()
      }
    }
  ];

  const displaySummaries = summaries.length > 0 ? summaries : mockSummaries;
  
  // Filter and sort summaries
  const filteredSummaries = displaySummaries
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
              onChange={(e) => setSearchTerm(e.target.value)}
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
          onClick={() => router.refresh()}
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
        icon={<FileTextIcon className="h-8 w-8" />}
        title="No summaries found"
        description="No summaries were found matching your filters. Try adjusting your search or add more tickers to your watchlist."
        actions={
          <Link href="/dashboard/settings">
            <Button>Manage Watchlist</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {summaries.map((summary) => (
        <SummaryCard
          key={summary.id}
          summary={summary as any}
          showPreview={true}
          previewLength={150}
        />
      ))}
    </div>
  );
} 