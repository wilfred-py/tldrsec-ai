'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Summary } from '@/lib/generated/prisma';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, Info, AlertTriangle, BarChart, Briefcase, Calendar, DollarSign, FileText, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface SummaryContentProps {
  summary: Summary & {
    ticker: {
      symbol: string;
      companyName: string;
    }
  };
}

export function SummaryContent({ summary }: SummaryContentProps) {
  const [activeTab, setActiveTab] = useState('formatted');

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
        <pre className="bg-muted p-4 rounded overflow-auto max-h-[600px] text-sm">
          {summary.summaryText}
        </pre>
      </TabsContent>

      {parsedSummary && (
        <TabsContent value="json">
          <pre className="bg-muted p-4 rounded overflow-auto max-h-[600px] text-sm">
            {JSON.stringify(parsedSummary, null, 2)}
          </pre>
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