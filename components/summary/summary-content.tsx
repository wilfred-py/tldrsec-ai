'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Summary } from '@/lib/generated/prisma';

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
}

function FormattedSummary({ summaryData, filingType, summaryText }: FormattedSummaryProps) {
  // For demonstration purposes, using placeholder rendering based on filing type
  // In a real implementation, this would be tailored to the actual structure of your JSON data
  
  if (filingType === '10-K' || filingType === '10-Q') {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{summaryData.company || 'Company Financial Report'}</CardTitle>
            <CardDescription>Period: {summaryData.period || 'Current Reporting Period'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summaryData.financials && summaryData.financials.length > 0 && (
              <>
                <h3 className="text-lg font-semibold">Key Financials</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {summaryData.financials.map((item: any, index: number) => (
                    <div key={index} className="bg-muted/50 p-4 rounded">
                      <div className="text-sm text-muted-foreground">{item.label}</div>
                      <div className="text-xl font-bold">{item.value}</div>
                      {item.growth && (
                        <div className={`text-sm ${item.growth.startsWith('-') ? 'text-red-500' : 'text-green-500'}`}>
                          {item.growth} {item.unit || '%'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {summaryData.insights && summaryData.insights.length > 0 && (
              <>
                <h3 className="text-lg font-semibold mt-6">Key Insights</h3>
                <ul className="list-disc pl-5 space-y-2">
                  {summaryData.insights.map((insight: string, index: number) => (
                    <li key={index}>{insight}</li>
                  ))}
                </ul>
              </>
            )}

            {summaryData.risks && summaryData.risks.length > 0 && (
              <>
                <h3 className="text-lg font-semibold mt-6">Risk Factors</h3>
                <ul className="list-disc pl-5 space-y-2">
                  {summaryData.risks.map((risk: string, index: number) => (
                    <li key={index}>{risk}</li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  } else if (filingType === '8-K') {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{summaryData.company || 'Company Event Report'}</CardTitle>
            <CardDescription>Report Date: {summaryData.reportDate || 'Recent Event Date'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summaryData.eventType && (
              <div className="mb-4">
                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                  {summaryData.eventType}
                </span>
              </div>
            )}

            <h3 className="text-lg font-semibold">Summary</h3>
            <p className="mb-4">{summaryData.summary || summaryData.description || 'Event summary not available'}</p>

            {summaryData.positiveDevelopments && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Positive Developments</h3>
                <div className="bg-green-50 border-l-4 border-green-500 p-4">
                  {summaryData.positiveDevelopments}
                </div>
              </div>
            )}

            {summaryData.potentialConcerns && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Potential Concerns</h3>
                <div className="bg-red-50 border-l-4 border-red-500 p-4">
                  {summaryData.potentialConcerns}
                </div>
              </div>
            )}

            {summaryData.additionalNotes && (
              <div>
                <h3 className="text-lg font-semibold">Additional Notes</h3>
                <p>{summaryData.additionalNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback for unknown filing types or simple data structure
  return (
    <div className="prose dark:prose-invert max-w-none">
      <div className="whitespace-pre-wrap">{summaryText}</div>
    </div>
  );
} 