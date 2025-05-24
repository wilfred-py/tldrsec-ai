'use client';

import { useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Summary } from '@/lib/generated/prisma';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, Info, AlertTriangle, BarChart, Briefcase, Calendar, DollarSign, FileText, TrendingUp, Search, Copy, Download, Check, ChevronDown, ChevronRight, X, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { coldarkDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { JSONTree } from 'react-json-tree';
import CopyToClipboard from 'react-copy-to-clipboard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// Extend the Summary type to include redacted properties
interface RedactedSummary {
  id: string;
  filingType: string;
  filingDate: Date;
  ticker: {
    symbol: string;
    companyName: string;
  };
  summaryText: string;
  summaryJSON: null;
  accessDeniedReason: string;
  isRedacted: boolean;
}

interface SummaryContentProps {
  summary: (Summary & {
    ticker: {
      symbol: string;
      companyName: string;
    }
  }) | RedactedSummary;
}

export function SummaryContent({ summary }: SummaryContentProps) {
  const [activeTab, setActiveTab] = useState('formatted');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);
  const rawTextRef = useRef<HTMLDivElement>(null);
  const jsonRef = useRef<HTMLDivElement>(null);

  // Check if the summary is redacted due to access restrictions
  if ('isRedacted' in summary && summary.isRedacted) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <div className="flex items-center space-x-2 mb-4">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold">Access Restricted</h2>
        </div>
        <p className="mb-4 text-gray-700">{summary.summaryText}</p>
        <p className="text-sm text-gray-500">{summary.accessDeniedReason}</p>
        <div className="mt-4">
          <Link href="/dashboard/settings">
            <Button>Add to Watchlist</Button>
          </Link>
        </div>
      </div>
    );
  }
  
  // Parse the JSON summary if available
  let parsedSummary = null;
  try {
    if (summary.summaryJSON) {
      parsedSummary = typeof summary.summaryJSON === 'string'
        ? JSON.parse(summary.summaryJSON as string)
        : summary.summaryJSON;
    }
  } catch (error) {
    console.error('Error parsing summary JSON:', error);
  }

  // Copy success handler
  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download function
  const downloadContent = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Highlighted search in text
  const highlightSearchText = (text: string) => {
    if (!searchQuery || searchQuery.trim() === '') return text;
    
    const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === searchQuery.toLowerCase() ? 
            <span key={i} className="bg-yellow-200 text-black font-medium">{part}</span> : 
            part
        )}
      </>
    );
  };

  // JSON search handler
  const handleSearchInJson = () => {
    if (!jsonRef.current || !searchQuery) return;
    
    const allElements = jsonRef.current.querySelectorAll('span');
    let foundMatch = false;
    
    // Remove previous highlights
    allElements.forEach(el => {
      el.classList.remove('bg-yellow-200', 'text-black', 'font-medium');
    });
    
    // Add new highlights
    allElements.forEach(el => {
      if (el.textContent?.toLowerCase().includes(searchQuery.toLowerCase())) {
        el.classList.add('bg-yellow-200', 'text-black', 'font-medium');
        if (!foundMatch) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          foundMatch = true;
        }
      }
    });
  };

  // Raw text search handler
  const handleSearchInRaw = () => {
    if (!rawTextRef.current || !searchQuery) return;
    
    const textContent = rawTextRef.current.textContent || '';
    const index = textContent.toLowerCase().indexOf(searchQuery.toLowerCase());
    
    if (index !== -1) {
      const lineHeight = 20; // Approximate line height in pixels
      const linesBeforeTarget = textContent.substring(0, index).split('\n').length - 1;
      const scrollPosition = linesBeforeTarget * lineHeight;
      
      rawTextRef.current.scrollTop = scrollPosition;
    }
  };

  // Handle search when user presses Enter
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (activeTab === 'raw') {
        handleSearchInRaw();
      } else if (activeTab === 'json') {
        handleSearchInJson();
      }
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
    if (jsonRef.current) {
      const allElements = jsonRef.current.querySelectorAll('span');
      allElements.forEach(el => {
        el.classList.remove('bg-yellow-200', 'text-black', 'font-medium');
      });
    }
  };

  // Custom JSON theme that matches the UI
  const jsonTheme = {
    scheme: 'atelierDune',
    base00: 'hsl(var(--muted))',
    base01: '#292e34',
    base02: '#3e4451',
    base03: '#565c64',
    base04: '#9196a1',
    base05: '#abb2bf',
    base06: '#c8ccd4',
    base07: '#e6e6e6',
    base08: 'hsl(var(--destructive))',
    base09: '#e5c07b',
    base0A: '#e5c07b',
    base0B: 'hsl(var(--primary))',
    base0C: '#56b6c2',
    base0D: '#61afef',
    base0E: '#c678dd',
    base0F: '#be5046',
  };

  // Update this section only:
  // Fix the ref type issue in the SyntaxHighlighter
  const customSyntaxHighlighterRef = (el: any) => {
    if (rawTextRef.current && el) {
      // @ts-ignore - We're just using this ref to get access to the DOM node
      rawTextRef.current = el;
    }
  };

  return (
    <Tabs defaultValue="formatted" onValueChange={setActiveTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="formatted">Formatted</TabsTrigger>
        <TabsTrigger value="raw">Raw Text</TabsTrigger>
        {parsedSummary && <TabsTrigger value="json">JSON</TabsTrigger>}
      </TabsList>

      <TabsContent value="formatted">
        {parsedSummary ? (
          <FormattedSummary
            summaryData={parsedSummary}
            filingType={summary.filingType}
            summaryText={summary.summaryText}
            ticker={summary.ticker}
            filingDate={summary.filingDate}
          />
        ) : (
          <div className="whitespace-pre-wrap">{summary.summaryText}</div>
        )}
      </TabsContent>

      <TabsContent value="raw">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <CardTitle className="text-xl">Raw Filing Text</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Input
                    type="text"
                    placeholder="Search in text..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="pr-8"
                  />
                  {searchQuery && (
                    <button 
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={clearSearch}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={handleSearchInRaw}
                  disabled={!searchQuery}>
                  <Search className="h-4 w-4" />
                </Button>
                <CopyToClipboard text={summary.summaryText} onCopy={handleCopy}>
                  <Button variant="outline" size="icon">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </CopyToClipboard>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => downloadContent(
                    summary.summaryText, 
                    `${summary.ticker.symbol}_${summary.filingType}_raw.txt`, 
                    'text/plain'
                  )}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <SyntaxHighlighter
                language="plaintext"
                style={coldarkDark}
                showLineNumbers={true}
                wrapLines={true}
                customStyle={{
                  maxHeight: '500px',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                }}
                ref={customSyntaxHighlighterRef}
              >
                {summary.summaryText}
              </SyntaxHighlighter>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {parsedSummary && (
        <TabsContent value="json">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <CardTitle className="text-xl">JSON Structure</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-full md:w-64">
                    <Input
                      type="text"
                      placeholder="Search in JSON..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      className="pr-8"
                    />
                    {searchQuery && (
                      <button 
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={clearSearch}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleSearchInJson}
                    disabled={!searchQuery}>
                    <Search className="h-4 w-4" />
                  </Button>
                  <CopyToClipboard text={JSON.stringify(parsedSummary, null, 2)} onCopy={handleCopy}>
                    <Button variant="outline" size="icon">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </CopyToClipboard>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => downloadContent(
                      JSON.stringify(parsedSummary, null, 2), 
                      `${summary.ticker.symbol}_${summary.filingType}.json`, 
                      'application/json'
                    )}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div 
                className="bg-muted rounded-lg p-4 overflow-auto max-h-[500px]" 
                ref={jsonRef}
              >
                <JSONTree 
                  data={parsedSummary} 
                  theme={jsonTheme}
                  invertTheme={false}
                  hideRoot={false}
                  shouldExpandNodeInitially={() => false}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
}

interface FormattedSummaryProps {
  summaryData: any;
  filingType: string;
  summaryText: string;
  ticker: {
    symbol: string;
    companyName: string;
  };
  filingDate: Date;
}

function FormattedSummary({ summaryData, filingType, summaryText, ticker, filingDate }: FormattedSummaryProps) {
  // Render Annual/Quarterly Reports (10-K and 10-Q)
  if (filingType === '10-K' || filingType === '10-Q') {
    return <FinancialReportSummary summaryData={summaryData} filingType={filingType} ticker={ticker} filingDate={filingDate} />;
  } 
  
  // Render Current Reports (8-K)
  else if (filingType === '8-K') {
    return <CurrentReportSummary summaryData={summaryData} ticker={ticker} filingDate={filingDate} />;
  } 
  
  // Render Insider Trading Reports (Form 4)
  else if (filingType === 'Form4') {
    return <InsiderTradingSummary summaryData={summaryData} ticker={ticker} filingDate={filingDate} />;
  }
  
  // Fallback for unknown filing types
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ticker.companyName} ({ticker.symbol})</CardTitle>
        <CardDescription>Filing Date: {format(new Date(filingDate), 'PPP')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="prose dark:prose-invert max-w-none">
          <div className="whitespace-pre-wrap">{summaryText}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// Specialized component for 10-K and 10-Q reports
function FinancialReportSummary({ summaryData, filingType, ticker, filingDate }: Omit<FormattedSummaryProps, 'summaryText'>) {
  const period = summaryData.period || `${filingType === '10-K' ? 'Annual' : 'Quarterly'} Report`;
  const financials = summaryData.financials || [];
  const insights = summaryData.insights || [];
  const risks = summaryData.risks || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{summaryData.company || ticker.companyName}</CardTitle>
              <CardDescription>
                {filingType} Report • Period: {period} • Filed on {format(new Date(filingDate), 'PPP')}
              </CardDescription>
            </div>
            <Badge variant={filingType === '10-K' ? 'default' : 'secondary'} className="ml-2">
              {filingType === '10-K' ? 'Annual Report' : 'Quarterly Report'}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Key Financials Section */}
          {financials.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <BarChart className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Key Financials</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {financials.map((item: any, index: number) => (
                  <div key={index} className="bg-muted/50 p-4 rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">{item.label}</div>
                    <div className="text-xl font-bold">{item.value}</div>
                    {item.growth && (
                      <div className="flex items-center mt-1">
                        {item.growth.startsWith('-') ? (
                          <ArrowDown className="h-4 w-4 text-destructive mr-1" />
                        ) : (
                          <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                        )}
                        <span className={`text-sm ${item.growth.startsWith('-') ? 'text-destructive' : 'text-green-500'}`}>
                          {item.growth} {item.unit || '%'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          
          {/* Key Insights Section */}
          {insights.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Info className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Key Insights</h3>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4">
                <ul className="list-disc pl-5 space-y-2">
                  {insights.map((insight: string, index: number) => (
                    <li key={index}>{insight}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          
          {/* Risk Factors Section */}
          {risks.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <h3 className="text-lg font-semibold">Risk Factors</h3>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4">
                <ul className="list-disc pl-5 space-y-2">
                  {risks.map((risk: string, index: number) => (
                    <li key={index}>{risk}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          
          {/* Outlook Section - optional */}
          {summaryData.outlook && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Future Outlook</h3>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4">
                <p>{summaryData.outlook}</p>
              </div>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Specialized component for 8-K reports
function CurrentReportSummary({ summaryData, ticker, filingDate }: Omit<FormattedSummaryProps, 'filingType' | 'summaryText'>) {
  const reportDate = summaryData.reportDate || format(new Date(filingDate), 'PPP');
  const eventType = summaryData.eventType || 'Material Event';
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{summaryData.company || ticker.companyName}</CardTitle>
              <CardDescription>
                8-K Report • Filed on {format(new Date(filingDate), 'PPP')}
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-200 ml-2">
              {eventType}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Summary Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Event Summary</h3>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-4">
              <p>{summaryData.summary || summaryData.description || 'No summary available'}</p>
            </div>
          </section>
          
          {/* Positive Developments Section - optional */}
          {summaryData.positiveDevelopments && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <ArrowUp className="h-5 w-5 text-green-500" />
                <h3 className="text-lg font-semibold">Positive Developments</h3>
              </div>
              
              <div className="bg-green-50 border-l-4 border-green-500 rounded-r-lg p-4">
                <p>{summaryData.positiveDevelopments}</p>
              </div>
            </section>
          )}
          
          {/* Potential Concerns Section - optional */}
          {summaryData.potentialConcerns && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h3 className="text-lg font-semibold">Potential Concerns</h3>
              </div>
              
              <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-4">
                <p>{summaryData.potentialConcerns}</p>
              </div>
            </section>
          )}
          
          {/* Structural Changes Section - optional */}
          {summaryData.structuralChanges && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-5 w-5 text-amber-500" />
                <h3 className="text-lg font-semibold">Structural Changes</h3>
              </div>
              
              <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg p-4">
                <p>{summaryData.structuralChanges}</p>
              </div>
            </section>
          )}
          
          {/* Additional Notes Section - optional */}
          {summaryData.additionalNotes && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Info className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Additional Notes</h3>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4">
                <p>{summaryData.additionalNotes}</p>
              </div>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Specialized component for Form 4 (Insider Trading) reports
function InsiderTradingSummary({ summaryData, ticker, filingDate }: Omit<FormattedSummaryProps, 'filingType' | 'summaryText'>) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{summaryData.company || ticker.companyName}</CardTitle>
              <CardDescription>
                Form 4 • Filed on {format(new Date(filingDate), 'PPP')}
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-purple-100 text-purple-800 hover:bg-purple-200 ml-2">
              Insider Trading
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Insider Information Section */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Insider</h3>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="mb-3">
                  <span className="text-sm text-muted-foreground">Name</span>
                  <p className="text-lg font-medium">{summaryData.filerName}</p>
                </div>
                
                <div>
                  <span className="text-sm text-muted-foreground">Position</span>
                  <p>{summaryData.relationship}</p>
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Transaction Details</h3>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="mb-3">
                  <span className="text-sm text-muted-foreground">Ownership Type</span>
                  <p className="font-medium">{summaryData.ownershipType}</p>
                </div>
                
                <div>
                  <span className="text-sm text-muted-foreground">Transaction Date</span>
                  <p>{summaryData.transactionDate || format(new Date(filingDate), 'PPP')}</p>
                </div>
              </div>
            </div>
          </section>
          
          {/* Transaction Value Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-5 w-5 text-green-500" />
              <h3 className="text-lg font-semibold">Transaction Value</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Total Value</div>
                <div className="text-2xl font-bold">{summaryData.totalValue}</div>
              </div>
              
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Percentage Change</div>
                <div className={`text-2xl font-bold flex items-center ${summaryData.percentageChange?.startsWith('-') ? 'text-destructive' : 'text-green-500'}`}>
                  {summaryData.percentageChange?.startsWith('-') ? (
                    <ArrowDown className="h-5 w-5 mr-1" />
                  ) : (
                    <ArrowUp className="h-5 w-5 mr-1" />
                  )}
                  {summaryData.percentageChange}
                </div>
              </div>
            </div>
          </section>
          
          {/* Stake Changes Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Ownership Changes</h3>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <span className="text-sm text-muted-foreground">Previous Stake</span>
                  <p className="text-lg font-medium">{summaryData.previousStake}</p>
                </div>
                
                <div>
                  <span className="text-sm text-muted-foreground">New Stake</span>
                  <p className="text-lg font-medium">{summaryData.newStake}</p>
                </div>
              </div>
            </div>
          </section>
          
          {/* Summary Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Summary</h3>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-4">
              <p>{summaryData.summary}</p>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
} 