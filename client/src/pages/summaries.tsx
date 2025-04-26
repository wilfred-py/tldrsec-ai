import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { format } from "date-fns";

export default function Summaries() {
  const [selectedSummaryId, setSelectedSummaryId] = useState<number | null>(null);
  
  // Get summaries
  const { data: summaries, isLoading: isLoadingSummaries } = useQuery({
    queryKey: ["/api/summaries"],
  });
  
  const { data: selectedSummary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ["/api/summaries", selectedSummaryId],
    enabled: selectedSummaryId !== null,
  });

  // Function to get the form type badge
  const getFormTypeBadge = (formType: string) => {
    switch (formType) {
      case "10-K":
        return <Badge variant="destructive">{formType}</Badge>;
      case "10-Q":
        return <Badge variant="secondary">{formType}</Badge>;
      case "8-K":
        return <Badge variant="default">{formType}</Badge>;
      case "4":
      case "Form 4":
        return <Badge variant="outline">{formType}</Badge>;
      default:
        return <Badge>{formType}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 bg-slate-50 dark:bg-slate-900">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Filing Summaries</h1>
          
          <Card>
            <CardHeader>
              <CardTitle>SEC Filing Summaries</CardTitle>
              <CardDescription>
                View AI-generated summaries of SEC filings for your tracked tickers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all">
                <TabsList className="mb-6">
                  <TabsTrigger value="all">All Filings</TabsTrigger>
                  <TabsTrigger value="10k">10-K</TabsTrigger>
                  <TabsTrigger value="10q">10-Q</TabsTrigger>
                  <TabsTrigger value="8k">8-K</TabsTrigger>
                  <TabsTrigger value="form4">Form 4</TabsTrigger>
                </TabsList>
                
                <TabsContent value="all" className="space-y-4">
                  {isLoadingSummaries ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner size="lg" />
                    </div>
                  ) : summaries && Array.isArray(summaries) && summaries.length > 0 ? (
                    summaries.map((summary: { id: number; ticker: string; formType: string; summary: string; createdAt: string }) => (
                      <Card key={summary.id} className="overflow-hidden">
                        <CardContent className="p-0">
                          <div className="p-6">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 bg-primary/10 rounded-md flex items-center justify-center text-primary font-bold">
                                  {summary.ticker.charAt(0)}
                                </div>
                                <div>
                                  <h3 className="font-semibold">{summary.ticker}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(summary.createdAt), "MMMM d, yyyy")}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-4">
                                {getFormTypeBadge(summary.formType || "Unknown")}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedSummaryId(summary.id)}
                                >
                                  View Summary
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                      <h3 className="mt-4 text-lg font-medium">No summaries found</h3>
                      <p className="mt-2 text-muted-foreground">
                        No SEC filing summaries available for your tracked tickers.
                      </p>
                      <Button className="mt-4" variant="outline" onClick={() => window.location.href = '/dashboard'}>
                        Track Tickers
                      </Button>
                    </div>
                  )}
                </TabsContent>
                
                {/* Other tabs would filter by form type */}
                <TabsContent value="10k" className="space-y-4">
                  <div className="text-center py-12">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-medium">No 10-K summaries</h3>
                    <p className="mt-2 text-muted-foreground">
                      No 10-K filing summaries available for your tracked tickers.
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="10q" className="space-y-4">
                  <div className="text-center py-12">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-medium">No 10-Q summaries</h3>
                    <p className="mt-2 text-muted-foreground">
                      No 10-Q filing summaries available for your tracked tickers.
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="8k" className="space-y-4">
                  <div className="text-center py-12">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-medium">No 8-K summaries</h3>
                    <p className="mt-2 text-muted-foreground">
                      No 8-K filing summaries available for your tracked tickers.
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="form4" className="space-y-4">
                  <div className="text-center py-12">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-medium">No Form 4 summaries</h3>
                    <p className="mt-2 text-muted-foreground">
                      No Form 4 filing summaries available for your tracked tickers.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Summary Dialog */}
      <Dialog open={selectedSummaryId !== null} onOpenChange={(open) => !open && setSelectedSummaryId(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>SEC Filing Summary</DialogTitle>
            <DialogDescription>
              {selectedSummary && typeof selectedSummary === 'object' && 'ticker' in selectedSummary ? (
                <>
                  {selectedSummary.ticker} - {
                    'createdAt' in selectedSummary && selectedSummary.createdAt ? 
                    format(new Date(selectedSummary.createdAt as string), "MMMM d, yyyy") : 
                    ''
                  }
                </>
              ) : 'Loading summary...'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto mt-4">
            {isLoadingSummary ? (
              <div className="flex justify-center items-center h-full">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                <pre className="text-sm whitespace-pre-wrap">
                  {selectedSummary && typeof selectedSummary === 'object' && 'summary' in selectedSummary ? 
                    selectedSummary.summary as string : 
                    'Summary not available'
                  }
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}