/**
 * Enhanced Filing Summary Component
 * 
 * Displays SEC filing summaries with real-time streaming updates.
 * Features:
 * - Real-time streaming of partial results
 * - Progress indicators
 * - Key points extraction
 * - Error handling with retry support
 */

import React, { useState } from 'react';
import { useEnhancedFilingSummary } from '../hooks/useEnhancedFilingSummary';
import { FilingType } from '../lib/sec-edgar/types';
import { getFormMetadata } from '../lib/sec-edgar/form-registry';
import { Spinner } from './ui/spinner';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Badge } from './ui/badge';
import { ExternalLink, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

interface EnhancedFilingSummaryProps {
  ticker: string;
  formType: FilingType;
  useStreaming?: boolean;
  useCache?: boolean;
  processAllChunks?: boolean;
  className?: string;
}

export function EnhancedFilingSummary({
  ticker,
  formType,
  useStreaming = true,
  useCache = true,
  processAllChunks = true,
  className = ''
}: EnhancedFilingSummaryProps) {
  // Track progress events for debugging - currently unused
  // const [progressEvents, setProgressEvents] = useState<unknown[]>([]);
  
  // Use the enhanced filing summary hook
  const {
    data,
    partialData,
    // status, // Unused variable - tracking via hook state
    progress,
    error,
    isPartial,
    isLoading,
    isSuccess,
    isError,
    refetch
  } = useEnhancedFilingSummary(ticker, formType, {
    useStreaming,
    useCache,
    processAllChunks,
    onProgress: (event) => {
      // Add progress event to history (for debugging)
      setProgressEvents(prev => [...prev, { 
        timestamp: new Date().toISOString(),
        type: event.type,
        ...event
      }]);
    }
  });
  
  // Get form metadata
  const formMetadata = getFormMetadata(formType);
  const formName = formMetadata?.displayName || formType;
  
  // Get the current summary data (either partial or complete)
  const summaryData = data || partialData;
  
  // Render loading state
  if (isLoading && !summaryData) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader>
          <CardTitle>Loading {ticker} {formName} Summary</CardTitle>
          <CardDescription>
            Retrieving filing information...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-6">
          <Spinner size="lg" />
          <Progress value={progress} className="w-full mt-4" />
          <p className="text-sm text-muted-foreground mt-2">
            {progress}% complete
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // Render error state
  if (isError) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader>
          <CardTitle className="text-destructive flex items-center">
            <AlertTriangle className="mr-2" />
            Error Loading Summary
          </CardTitle>
          <CardDescription>
            Failed to load {ticker} {formName} summary
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button onClick={refetch} variant="outline" className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" /> Try Again
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  // If we have no data at all
  if (!summaryData) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader>
          <CardTitle>{ticker} {formName} Summary</CardTitle>
          <CardDescription>
            No summary data available
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>No Data</AlertTitle>
            <AlertDescription>
              No filing summary data is available for {ticker} {formName}.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button onClick={refetch} variant="outline" className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  // Render summary content
  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{summaryData.companyName} ({summaryData.ticker})</CardTitle>
            <CardDescription>
              {formName} filed on {new Date(summaryData.filingDate).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex items-center">
            {isPartial ? (
              <Badge variant="outline" className="bg-amber-100 text-amber-800">
                Partial Results
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-green-100 text-green-800">
                <CheckCircle className="mr-1 h-3 w-3" /> Complete
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      {isPartial && (
        <div className="px-6">
          <Progress value={progress} className="w-full" />
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {progress}% complete - Showing partial results
          </p>
        </div>
      )}
      
      <CardContent>
        <div className="prose max-w-none">
          <h3>Summary</h3>
          <div className="whitespace-pre-wrap">
            {summaryData.summaryText}
          </div>
          
          {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
            <>
              <h3>Key Points</h3>
              <ul>
                {summaryData.keyPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </>
          )}
          
          {summaryData.model && (
            <div className="text-xs text-muted-foreground mt-6">
              <p>Generated using {summaryData.model}</p>
              <p>Tokens: {summaryData.inputTokens} input / {summaryData.outputTokens} output</p>
              {summaryData.processingTimeMs && (
                <p>Processing time: {(summaryData.processingTimeMs / 1000).toFixed(2)}s</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={refetch}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
        
        {summaryData.url && (
          <Button variant="outline" asChild>
            <a href={summaryData.url} target="_blank" rel="noopener noreferrer">
              View on SEC <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
