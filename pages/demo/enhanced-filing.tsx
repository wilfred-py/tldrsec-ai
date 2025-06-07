/**
 * Enhanced Filing Service Demo
 * 
 * Demonstrates the enhanced filing service with:
 * - Caching to prevent redundant API calls for the same filing
 * - Streaming support for real-time partial results
 * - Batch processing with concurrency control
 * - Enhanced error handling and recovery
 */

import React, { useState } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { EnhancedFilingSummary } from '../../components/EnhancedFilingSummary';
import { FilingType } from '../../lib/sec-edgar/types';
import { getFormsByCategory } from '../../lib/sec-edgar/form-registry';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent
} from '../../components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '../../components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { 
  AlertCircle, 
  RefreshCw, 
  Zap, 
  Database, 
  Layers
} from 'lucide-react';

// Demo page props
interface EnhancedFilingDemoProps {
  popularTickers: Array<{ symbol: string; name: string }>;
}

export default function EnhancedFilingDemo({ popularTickers }: EnhancedFilingDemoProps) {
  // State for single filing demo
  const [ticker, setTicker] = useState<string>('AAPL');
  const [formType, setFormType] = useState<FilingType>('10-K');
  const [useStreaming, setUseStreaming] = useState<boolean>(true);
  const [useCache, setUseCache] = useState<boolean>(true);
  const [processAllChunks, setProcessAllChunks] = useState<boolean>(true);
  const [showSummary, setShowSummary] = useState<boolean>(false);
  
  // State for batch filing demo
  const [batchTickers, setBatchTickers] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL']);
  const [batchFormType, setBatchFormType] = useState<FilingType>('10-Q');
  const [concurrencyLimit, setConcurrencyLimit] = useState<number>(2);
  const [batchResults, setBatchResults] = useState<any[]>([]);
  const [batchErrors, setBatchErrors] = useState<any[]>([]);
  const [isBatchLoading, setIsBatchLoading] = useState<boolean>(false);
  
  // State for cache demo
  const [cacheDemo1, setCacheDemo1] = useState<boolean>(false);
  const [cacheDemo2, setCacheDemo2] = useState<boolean>(false);
  
  // Get form types for dropdown
  const formTypes = getFormsByCategory('financial');
  
  // Handle form submission for single filing
  const handleSingleFilingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSummary(true);
  };
  
  // Handle batch processing
  const handleBatchProcessing = async () => {
    setIsBatchLoading(true);
    setBatchResults([]);
    setBatchErrors([]);
    
    try {
      const response = await fetch('/api/filings/batch-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: batchTickers.map(ticker => ({
            ticker,
            formType: batchFormType
          })),
          concurrencyLimit,
          useCache,
          processAllChunks
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setBatchResults(data.results);
        setBatchErrors(data.errors);
      } else {
        setBatchErrors([{ error: data.error || 'Failed to process batch' }]);
      }
    } catch (error) {
      setBatchErrors([{ 
        error: error instanceof Error ? error.message : 'Failed to process batch' 
      }]);
    } finally {
      setIsBatchLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto py-8 px-4">
      <Head>
        <title>Enhanced Filing Service Demo | tldrSEC</title>
      </Head>
      
      <h1 className="text-3xl font-bold mb-2">Enhanced Filing Service Demo</h1>
      <p className="text-gray-600 mb-8">
        Demonstrates advanced SEC filing summarization with caching, streaming, and batch processing
      </p>
      
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="single">Single Filing</TabsTrigger>
          <TabsTrigger value="batch">Batch Processing</TabsTrigger>
          <TabsTrigger value="cache">Cache Demo</TabsTrigger>
        </TabsList>
        
        {/* Single Filing Tab */}
        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle>Single Filing Summary</CardTitle>
              <CardDescription>
                Request a summary for a specific SEC filing with enhanced features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSingleFilingSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="ticker">Company Ticker</Label>
                    <Select
                      value={ticker}
                      onValueChange={setTicker}
                    >
                      <SelectTrigger id="ticker">
                        <SelectValue placeholder="Select ticker" />
                      </SelectTrigger>
                      <SelectContent>
                        {popularTickers.map((company) => (
                          <SelectItem key={company.symbol} value={company.symbol}>
                            {company.symbol} - {company.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                    {ticker === 'custom' && (
                      <Input
                        placeholder="Enter ticker symbol"
                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                        className="mt-2"
                      />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="formType">Form Type</Label>
                    <Select
                      value={formType}
                      onValueChange={(value) => setFormType(value as FilingType)}
                    >
                      <SelectTrigger id="formType">
                        <SelectValue placeholder="Select form type" />
                      </SelectTrigger>
                      <SelectContent>
                        {formTypes.map((form) => (
                          <SelectItem key={form.formType} value={form.formType}>
                            {form.displayName} ({form.formType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="useStreaming"
                      checked={useStreaming}
                      onCheckedChange={setUseStreaming}
                    />
                    <Label htmlFor="useStreaming" className="flex items-center">
                      <Zap className="w-4 h-4 mr-2" />
                      Enable streaming for partial results
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="useCache"
                      checked={useCache}
                      onCheckedChange={setUseCache}
                    />
                    <Label htmlFor="useCache" className="flex items-center">
                      <Database className="w-4 h-4 mr-2" />
                      Use cache (prevents redundant API calls)
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="processAllChunks"
                      checked={processAllChunks}
                      onCheckedChange={setProcessAllChunks}
                    />
                    <Label htmlFor="processAllChunks" className="flex items-center">
                      <Layers className="w-4 h-4 mr-2" />
                      Process all document chunks
                    </Label>
                  </div>
                </div>
                
                <Button type="submit" className="w-full">
                  Get Filing Summary
                </Button>
              </form>
              
              {showSummary && (
                <div className="mt-8">
                  <EnhancedFilingSummary
                    ticker={ticker}
                    formType={formType as FilingType}
                    useStreaming={useStreaming}
                    useCache={useCache}
                    processAllChunks={processAllChunks}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Batch Processing Tab */}
        <TabsContent value="batch">
          <Card>
            <CardHeader>
              <CardTitle>Batch Filing Summaries</CardTitle>
              <CardDescription>
                Process multiple filing summaries in parallel with concurrency control
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="batchTickers">Company Tickers (comma-separated)</Label>
                  <Input
                    id="batchTickers"
                    value={batchTickers.join(', ')}
                    onChange={(e) => setBatchTickers(
                      e.target.value.split(',').map(t => t.trim().toUpperCase())
                    )}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="batchFormType">Form Type</Label>
                  <Select
                    value={batchFormType}
                    onValueChange={(value) => setBatchFormType(value as FilingType)}
                  >
                    <SelectTrigger id="batchFormType">
                      <SelectValue placeholder="Select form type" />
                    </SelectTrigger>
                    <SelectContent>
                      {formTypes.map((form) => (
                        <SelectItem key={form.formType} value={form.formType}>
                          {form.displayName} ({form.formType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="concurrencyLimit">
                    Concurrency Limit: {concurrencyLimit}
                  </Label>
                  <Input
                    id="concurrencyLimit"
                    type="range"
                    min={1}
                    max={5}
                    value={concurrencyLimit}
                    onChange={(e) => setConcurrencyLimit(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-sm text-gray-500">
                    Number of filings to process in parallel
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="batchUseCache"
                    checked={useCache}
                    onCheckedChange={setUseCache}
                  />
                  <Label htmlFor="batchUseCache">Use cache</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="batchProcessAllChunks"
                    checked={processAllChunks}
                    onCheckedChange={setProcessAllChunks}
                  />
                  <Label htmlFor="batchProcessAllChunks">Process all chunks</Label>
                </div>
                
                <Button
                  onClick={handleBatchProcessing}
                  disabled={isBatchLoading}
                  className="w-full"
                >
                  {isBatchLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Process Batch'
                  )}
                </Button>
                
                {/* Results */}
                {batchResults.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Batch Results ({batchResults.length})
                    </h3>
                    <div className="space-y-4">
                      {batchResults.map((result, index) => (
                        <Card key={index}>
                          <CardHeader>
                            <CardTitle>
                              {result.companyName} ({result.ticker})
                            </CardTitle>
                            <CardDescription>
                              {result.filingType} filed on {new Date(result.filingDate).toLocaleDateString()}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <p className="whitespace-pre-wrap">{result.summaryText}</p>
                            
                            {result.processingTimeMs && (
                              <Badge variant="outline" className="mt-2">
                                Processed in {(result.processingTimeMs / 1000).toFixed(2)}s
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Errors */}
                {batchErrors.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold text-red-600 flex items-center mb-4">
                      <AlertCircle className="mr-2" />
                      Errors ({batchErrors.length})
                    </h3>
                    <div className="space-y-2">
                      {batchErrors.map((error, index) => (
                        <div key={index} className="p-4 bg-red-50 text-red-700 rounded-md">
                          {error.ticker && (
                            <strong>{error.ticker}: </strong>
                          )}
                          {error.error || 'Unknown error'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Cache Demo Tab */}
        <TabsContent value="cache">
          <Card>
            <CardHeader>
              <CardTitle>Cache Demonstration</CardTitle>
              <CardDescription>
                See how caching prevents redundant API calls when multiple users request the same filing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                <div className="bg-blue-50 p-4 rounded-md">
                  <h3 className="font-semibold text-blue-800 mb-2">How This Demo Works</h3>
                  <p className="text-blue-700">
                    This demonstration shows how our enhanced filing service prevents redundant API calls
                    when multiple users request the same filing summary. The first request will fetch the
                    data from the API, while subsequent requests will use the cached result.
                  </p>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">First User Request</h3>
                  <p className="text-gray-600 mb-4">
                    This simulates the first user requesting a filing summary. The system will need to
                    fetch the data from the API and cache the result.
                  </p>
                  
                  <Button
                    onClick={() => setCacheDemo1(true)}
                    disabled={cacheDemo1}
                    className="w-full"
                  >
                    {cacheDemo1 ? 'Request Sent' : 'Simulate First User Request'}
                  </Button>
                  
                  {cacheDemo1 && (
                    <div className="mt-4">
                      <EnhancedFilingSummary
                        ticker="TSLA"
                        formType="10-K"
                        useStreaming={false}
                        useCache={true}
                        processAllChunks={true}
                      />
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Second User Request (Uses Cache)</h3>
                  <p className="text-gray-600 mb-4">
                    This simulates a second user requesting the same filing summary. The system will
                    use the cached result instead of making another API call.
                  </p>
                  
                  <Button
                    onClick={() => setCacheDemo2(true)}
                    disabled={!cacheDemo1 || cacheDemo2}
                    className="w-full"
                  >
                    {!cacheDemo1 ? 'First request needed' : 
                      cacheDemo2 ? 'Request Sent' : 'Simulate Second User Request'}
                    }
                  </Button>
                  
                  {cacheDemo2 && (
                    <div className="mt-4">
                      <EnhancedFilingSummary
                        ticker="TSLA"
                        formType="10-K"
                        useStreaming={false}
                        useCache={true}
                        processAllChunks={true}
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Get server-side props
export const getServerSideProps: GetServerSideProps = async () => {
  // Popular tickers for the demo
  const popularTickers = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'META', name: 'Meta Platforms Inc.' },
    { symbol: 'TSLA', name: 'Tesla, Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
    { symbol: 'V', name: 'Visa Inc.' },
    { symbol: 'WMT', name: 'Walmart Inc.' }
  ];
  
  return {
    props: {
      popularTickers
    }
  };
};
