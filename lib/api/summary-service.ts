import { prisma } from '@/lib/db';

// Type for Summary with Ticker information
export interface SummaryWithTicker {
  id: string;
  tickerId: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  summaryText: string;
  summaryJSON?: any;
  createdAt: Date;
  sentToUser: boolean;
  ticker: {
    id: string;
    symbol: string;
    companyName: string;
    userId: string;
  };
}

/**
 * Get recent summaries for the current user's tracked tickers
 * This function simulates fetching summaries, but would be 
 * implemented properly with a real API or database query in production
 * @returns Array of summaries with ticker details
 */
export async function getRecentSummaries(): Promise<SummaryWithTicker[]> {
  try {
    // In a real implementation, we would use the current user's ID 
    // and fetch from a real API or database
    return getMockSummaries();
  } catch (error) {
    console.error('Error fetching recent summaries:', error);
    return [];
  }
}

/**
 * Get a specific summary by ID
 * @param id Summary ID
 * @returns Summary with ticker details
 */
export async function getSummaryById(id: string): Promise<SummaryWithTicker | null> {
  try {
    // In a real implementation, we would call an API endpoint
    // For now, we'll filter the mock data
    const summaries = getMockSummaries();
    return summaries.find(summary => summary.id === id) || null;
  } catch (error) {
    console.error(`Error fetching summary ${id}:`, error);
    return null;
  }
}

// Helper to generate mock data - this would be replaced with actual API calls in production
export function getMockSummaries(): SummaryWithTicker[] {
  return [
    {
      id: 'sum1',
      tickerId: 'tick1',
      filingType: '10-K',
      filingDate: new Date('2023-03-15'),
      filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019323000077/aapl-20230930.htm',
      summaryText: 'Apple Inc. reported strong financial results for fiscal year 2023. Revenue increased by 8% to $394.3 billion, primarily driven by growth in the Services segment and iPhone sales. The company continues to face supply chain challenges but has managed to mitigate their impact through operational improvements.',
      createdAt: new Date('2023-03-16'),
      sentToUser: true,
      ticker: {
        id: 'tick1',
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        userId: 'user1'
      }
    },
    {
      id: 'sum2',
      tickerId: 'tick2',
      filingType: '8-K',
      filingDate: new Date('2023-04-20'),
      filingUrl: 'https://www.sec.gov/Archives/edgar/data/1018724/000101872423000004/amzn-20230202.htm',
      summaryText: 'Amazon announced significant layoffs across multiple divisions as part of a cost-cutting initiative. The company plans to reduce its workforce by approximately 18,000 positions, primarily in the retail and Devices & Services organizations. This move is expected to save the company over $1 billion annually.',
      createdAt: new Date('2023-04-21'),
      sentToUser: true,
      ticker: {
        id: 'tick2',
        symbol: 'AMZN',
        companyName: 'Amazon.com, Inc.',
        userId: 'user1'
      }
    },
    {
      id: 'sum3',
      tickerId: 'tick3',
      filingType: 'Form4',
      filingDate: new Date('2023-05-10'),
      filingUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000089924323000735/xslF345X03/doc4.xml',
      summaryText: 'Elon Musk, CEO of Tesla, sold 8.5 million shares of Tesla stock valued at approximately $6.9 billion. This transaction reduces his total holdings by about 4%. The sales were executed over three days at an average price of $812 per share.',
      summaryJSON: {
        filerName: 'Elon Musk',
        relationship: 'CEO',
        company: 'Tesla, Inc.',
        ownershipType: 'Direct',
        totalValue: '$6.9 billion',
        percentageChange: '-4%',
        previousStake: '173.2 million shares',
        newStake: '164.7 million shares',
        summary: 'CEO Elon Musk sold 8.5 million shares of Tesla stock valued at approximately $6.9 billion, reducing his total holdings by about 4%.'
      },
      createdAt: new Date('2023-05-11'),
      sentToUser: false,
      ticker: {
        id: 'tick3',
        symbol: 'TSLA',
        companyName: 'Tesla, Inc.',
        userId: 'user1'
      }
    }
  ];
} 