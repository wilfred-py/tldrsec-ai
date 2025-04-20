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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowUpDown } from "lucide-react";

interface Filing {
  id: number;
  ticker: string;
  companyName: string;
  formType: string;
  filingDate: string;
  processingStatus: string;
}

interface FilingsTableProps {
  filings: Filing[];
  isLoading: boolean;
  onViewSummary: (filingId: number) => void;
}

export function FilingsTable({ filings, isLoading, onViewSummary }: FilingsTableProps) {
  const [sortColumn, setSortColumn] = useState<keyof Filing>("filingDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (column: keyof Filing) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  // Get status badge color based on filing status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="success">Summarized</Badge>;
      case "processing":
        return <Badge variant="warning">Processing</Badge>;
      case "queued":
        return <Badge variant="secondary">Queued</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Get form type badge color
  const getFormTypeBadge = (formType: string) => {
    switch (formType) {
      case "10-K":
        return <Badge variant="destructive">{formType}</Badge>;
      case "10-Q":
        return <Badge variant="blue">{formType}</Badge>;
      case "8-K":
        return <Badge variant="purple">{formType}</Badge>;
      case "4":
      case "Form 4":
        return <Badge variant="amber">{formType}</Badge>;
      default:
        return <Badge>{formType}</Badge>;
    }
  };

  // Sort filings
  const sortedFilings = [...filings].sort((a, b) => {
    if (a[sortColumn] < b[sortColumn]) {
      return sortDirection === "asc" ? -1 : 1;
    }
    if (a[sortColumn] > b[sortColumn]) {
      return sortDirection === "asc" ? 1 : -1;
    }
    return 0;
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Recent SEC Filings</CardTitle>
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
                      <span>Company</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("formType")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Form</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("filingDate")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("processingStatus")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFilings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No filings found. Add tickers to start tracking SEC filings.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedFilings.map((filing) => (
                    <TableRow key={filing.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center">
                          <div className="mr-2 flex-shrink-0 h-8 w-8 bg-primary/10 rounded-md flex items-center justify-center text-primary font-bold">
                            {filing.ticker.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium">{filing.ticker}</div>
                            <div className="text-sm text-muted-foreground">{filing.companyName}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getFormTypeBadge(filing.formType)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(filing.filingDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(filing.processingStatus)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="link" 
                          onClick={() => onViewSummary(filing.id)}
                          disabled={filing.processingStatus !== "completed"}
                        >
                          View
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
