import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowUpDown, Trash, Search, BarChart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";

interface TrackedTicker {
  id: number;
  ticker: string;
  companyName: string;
  createdAt: string;
}

interface TickersTableProps {
  tickers: TrackedTicker[];
  isLoading: boolean;
  onRemove: (id: number) => void;
  isPremium?: boolean;
  maxFreeTickers?: number;
}

export function TickersTable({ tickers, isLoading, onRemove, isPremium = false, maxFreeTickers = 2 }: TickersTableProps) {
  const [sortColumn, setSortColumn] = useState<keyof TrackedTicker>("ticker");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { toast } = useToast();

  const handleSort = (column: keyof TrackedTicker) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleRemove = async (id: number) => {
    try {
      setRemovingId(id);
      await apiRequest("DELETE", `/api/tickers/${id}`);
      onRemove(id);
      toast({
        title: "Ticker removed",
        description: "The ticker has been removed from your watchlist.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove ticker. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  };

  // Filter by search query
  const filteredTickers = [...tickers].filter((ticker) => {
    if (!searchQuery.trim()) return true;
    
    const lowerSearchQuery = searchQuery.toLowerCase().trim();
    return (
      ticker.ticker.toLowerCase().includes(lowerSearchQuery) ||
      ticker.companyName.toLowerCase().includes(lowerSearchQuery)
    );
  });

  // Sort tickers
  const sortedTickers = filteredTickers.sort((a, b) => {
    if (a[sortColumn] < b[sortColumn]) {
      return sortDirection === "asc" ? -1 : 1;
    }
    if (a[sortColumn] > b[sortColumn]) {
      return sortDirection === "asc" ? 1 : -1;
    }
    return 0;
  });

  return (
    <Card className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="border-b flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/30">
        <div>
          <CardTitle className="text-xl">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Tracked Tickers
            </div>
          </CardTitle>
          {!isPremium && tickers.length >= maxFreeTickers && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Free plan limited to {maxFreeTickers} tickers. <a href="/subscribe" className="font-medium hover:underline">Upgrade to Pro</a> for unlimited tracking.
            </p>
          )}
        </div>
        <div className="relative w-full md:w-64">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <Input
            type="text"
            placeholder="Filter tickers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </CardHeader>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("ticker")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Ticker</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("companyName")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Company Name</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("createdAt")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Date Added</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTickers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No tickers tracked. Use the search bar to add tickers.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedTickers.map((ticker) => (
                    <TableRow key={ticker.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{ticker.ticker}</TableCell>
                      <TableCell>{ticker.companyName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(ticker.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemove(ticker.id)}
                          disabled={removingId === ticker.id}
                          title="Remove ticker"
                        >
                          {removingId === ticker.id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <Trash className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
