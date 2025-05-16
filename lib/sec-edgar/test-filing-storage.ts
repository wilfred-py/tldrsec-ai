/**
 * Test file for the SEC EDGAR Filing Storage service.
 * 
 * This script is intended to be run manually to verify functionality.
 * Run with: npx ts-node lib/sec-edgar/test-filing-storage.ts
 */

import { PrismaClient } from '@prisma/client';
import { FilingStorage } from './filing-storage';
import { ParsedFiling, FilingType } from './types';
import { TickerResolver } from './ticker-service';

// Mock filing for testing
const mockFiling: ParsedFiling = {
  id: 'test-filing-id',
  companyName: 'Apple Inc.',
  ticker: 'AAPL',
  cik: '0000320193',
  filingType: '10-K' as FilingType,
  filingDate: new Date('2023-10-27'),
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm',
  description: 'Annual Report for Apple Inc.'
};

// Create a batch of mock filings
const createMockFilings = (count: number): ParsedFiling[] => {
  const filings: ParsedFiling[] = [];
  const companies = [
    { name: 'Apple Inc.', ticker: 'AAPL', cik: '0000320193' },
    { name: 'Microsoft Corporation', ticker: 'MSFT', cik: '0000789019' },
    { name: 'Amazon.com, Inc.', ticker: 'AMZN', cik: '0001018724' },
    { name: 'Alphabet Inc.', ticker: 'GOOGL', cik: '0001652044' },
    { name: 'Meta Platforms, Inc.', ticker: 'META', cik: '0001326801' }
  ];
  
  const filingTypes: FilingType[] = ['10-K', '10-Q', '8-K', 'Form4'];
  
  for (let i = 0; i < count; i++) {
    const company = companies[i % companies.length];
    const filingType = filingTypes[i % filingTypes.length];
    const date = new Date();
    date.setDate(date.getDate() - i * 15); // Spread filings over time
    
    filings.push({
      id: `test-filing-${i}`,
      companyName: company.name,
      ticker: company.ticker,
      cik: company.cik,
      filingType,
      filingDate: date,
      filingUrl: `https://www.sec.gov/example/${company.ticker.toLowerCase()}-${filingType.toLowerCase()}-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}.htm`,
      description: `${filingType} filing for ${company.name}`
    });
  }
  
  return filings;
};

/**
 * Test the filing storage functionality
 */
async function testFilingStorage() {
  console.log('=== Testing SEC Filing Storage ===');
  
  // Create a new prisma client
  const prisma = new PrismaClient();
  
  // Create ticker resolver and filing storage
  const tickerResolver = new TickerResolver({ prisma });
  const filingStorage = new FilingStorage({
    prisma,
    tickerResolver,
    defaultOptions: {
      deduplicateByUrl: true,
      updateExisting: true,
      archiveThresholdDays: 90, // 3 months for testing
      batchSize: 10
    }
  });
  
  try {
    // First, make sure we have a ticker for AAPL in the database
    console.log('\nEnsuring test ticker (AAPL) exists in database...');
    // This is just for testing purposes - typically tickers would be added by users
    const existingTicker = await prisma.ticker.findFirst({
      where: {
        symbol: 'AAPL'
      }
    });
    
    if (!existingTicker) {
      console.log('Creating test ticker (AAPL) in database...');
      
      // First, make sure we have a test user
      const testUser = await prisma.user.findFirst();
      
      if (!testUser) {
        console.error('No test user found in database. Please create a user first.');
        return;
      }
      
      // Create a ticker for the test user
      await prisma.ticker.create({
        data: {
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          userId: testUser.id
        }
      });
      console.log('Test ticker created.');
    } else {
      console.log('Test ticker already exists.');
    }
    
    // Test storing a single filing
    console.log('\nStoring a single filing...');
    const storedFiling = await filingStorage.storeFiling(mockFiling);
    console.log('Filing stored successfully:', storedFiling.id);
    
    // Test finding by URL
    console.log('\nFinding filing by URL...');
    const foundFiling = await filingStorage.findFilingByUrl(mockFiling.filingUrl);
    console.log('Found filing:', foundFiling ? 'Yes' : 'No');
    
    // Test finding by ticker
    console.log('\nFinding filings for AAPL...');
    const appleFilings = await filingStorage.findFilingsByTicker('AAPL', 5);
    console.log(`Found ${appleFilings.length} filings for AAPL`);
    if (appleFilings.length > 0) {
      console.log('First filing:', {
        id: appleFilings[0].id,
        type: appleFilings[0].filingType,
        date: appleFilings[0].filingDate,
        url: appleFilings[0].filingUrl
      });
    }
    
    // Test batch storage (only run occasionally - comment out when not needed)
    /*
    console.log('\nTesting batch storage with 20 mock filings...');
    const mockFilings = createMockFilings(20);
    const batchResults = await filingStorage.storeFilingsBatch(mockFilings);
    console.log(`Stored ${batchResults.length} filings in batch`);
    */
    
    // Test finding by date range
    console.log('\nFinding filings from the last 30 days...');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const recentFilings = await filingStorage.findFilingsByDateRange({
      startDate,
      limit: 10
    });
    console.log(`Found ${recentFilings.length} filings from the last 30 days`);
    
    // Test marking filings as sent
    if (appleFilings.length > 0) {
      console.log('\nMarking a filing as sent...');
      const markedCount = await filingStorage.markFilingsAsSent([appleFilings[0].id]);
      console.log(`Marked ${markedCount} filings as sent`);
    }
    
    // Test archiving (only run occasionally - comment out when not needed)
    /*
    console.log('\nTesting archive functionality...');
    const archivedCount = await filingStorage.archiveOldFilings({
      olderThanDays: 90
    });
    console.log(`Archived ${archivedCount} old filings`);
    */
    
  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    // Close prisma client
    await prisma.$disconnect();
  }
}

// Run the tests
testFilingStorage().catch(console.error); 