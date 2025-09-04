import { NextResponse } from 'next/server';

/**
 * Demo API endpoint that returns sample SEC filing data
 * This endpoint doesn't require any API keys and is useful for testing
 */
export async function GET() {
  try {
    // Return a mock response
    return NextResponse.json({
      success: true,
      metadata: {
        ticker: "TSLA",
        cik: "0001318605",
        company: "Tesla, Inc.",
        requestTimestamp: new Date().toISOString(),
        filingCount: 2,
        processedCount: 2,
        aiProvider: "Claude (Mock)",
        aiModel: "claude-sonnet-4-20250514",
        cacheInfo: {
          size: 5,
          maxSize: 100,
          cacheHits: 2
        }
      },
      usage: {
        totalInputTokens: 2838,
        totalOutputTokens: 82,
        totalCost: 0.04872
      },
      results: [
        {
          filingType: "10-K",
          filingDate: "2023-01-31T00:00:00Z",
          title: "Annual Report - Form 10-K",
          documentUrl: "https://www.sec.gov/Archives/edgar/data/1318605/000095017023001409/tsla-20221231.htm",
          contentLength: 120500,
          analysis: {
            summary: "Tesla's 2022 10-K shows strong financial performance with record revenue of $81.5B (+51% YoY) and operating income of $13.7B. The company delivered 1.31M vehicles (+40% YoY) despite supply chain challenges and factory shutdowns. Key risks include intense competition, regulatory hurdles, and dependence on lithium-ion battery supplies.",
            keyMetrics: {
              revenue: "$81.5 billion",
              netIncome: "$12.6 billion",
              cashFlow: "$14.7 billion",
              vehicleDeliveries: "1.31 million"
            },
            riskFactors: [
              "Supply chain disruptions",
              "Increasing competition in EV market",
              "Regulatory challenges in multiple markets",
              "Battery supply constraints"
            ],
            sentiment: "Positive"
          }
        },
        {
          filingType: "10-Q",
          filingDate: "2023-04-24T00:00:00Z",
          title: "Quarterly Report - Form 10-Q",
          documentUrl: "https://www.sec.gov/Archives/edgar/data/1318605/000095017023001409/tsla-20230331.htm",
          contentLength: 75300,
          analysis: {
            summary: "Tesla's Q1 2023 10-Q shows quarterly revenue of $23.3B (+24% YoY) with automotive revenue of $19.9B. Operating income was $2.7B with an operating margin of 11.4%. The company reported $2.5B in net income and maintained strong liquidity with $22.4B in cash and cash equivalents.",
            keyMetrics: {
              revenue: "$23.3 billion",
              netIncome: "$2.5 billion",
              cashFlow: "$2.7 billion",
              vehicleDeliveries: "422,875"
            },
            riskFactors: [
              "Price competition",
              "Rising material costs",
              "Macroeconomic uncertainty"
            ],
            sentiment: "Neutral"
          }
        }
      ]
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
