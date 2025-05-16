/**
 * Test file for the SEC EDGAR Ticker Resolver and Filter services.
 * 
 * This script is intended to be run manually to verify functionality.
 * Run with: npx ts-node lib/sec-edgar/ticker-service/test-ticker-resolver.ts
 */

import { PrismaClient } from '@prisma/client';
import { 
  SECDataClient, 
  TickerResolver,
  FilingFilterBuilder,
  FilingWithAllProperties
} from './index';
import { ParsedFiling } from '../types';

// Mock filings for testing filters
const mockFilings: (ParsedFiling & FilingWithAllProperties)[] = [
  {
    id: '1',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    cik: '0000320193',
    filingType: '10-K',
    filingDate: new Date('2023-10-27'),
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm',
    description: 'Annual Report'
  },
  {
    id: '2',
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    cik: '0000320193',
    filingType: '10-Q',
    filingDate: new Date('2023-07-28'),
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019323000077/aapl-20230701.htm',
    description: 'Quarterly Report'
  },
  {
    id: '3',
    companyName: 'Microsoft Corporation',
    ticker: 'MSFT',
    cik: '0000789019',
    filingType: '8-K',
    filingDate: new Date('2023-11-01'),
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/789019/000095017023080511/msft-20231101.htm',
    description: 'Current Report'
  },
  {
    id: '4',
    companyName: 'Microsoft Corporation',
    ticker: 'MSFT',
    cik: '0000789019',
    filingType: '10-K',
    filingDate: new Date('2023-07-27'),
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/789019/000156459023030735/msft-10k_20230630.htm',
    description: 'Annual Report'
  },
  {
    id: '5',
    companyName: 'Amazon.com, Inc.',
    ticker: 'AMZN',
    cik: '0001018724',
    filingType: 'Form4',
    filingDate: new Date('2023-11-02'),
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/1018724/000112760223025392/xslF345X02/form4.xml',
    description: 'Statement of Changes in Beneficial Ownership'
  },
];

/**
 * Test filter functionality
 */
async function testFilters() {
  console.log('=== Testing Filing Filters ===');
  
  // Test form type filter
  const formTypeFilter = new FilingFilterBuilder<typeof mockFilings[0]>()
    .withFormTypes(['10-K'])
    .build();
  
  const annualReports = formTypeFilter.apply(mockFilings);
  console.log(`\nAnnual Reports (10-K) - ${annualReports.length} results:`);
  annualReports.forEach(filing => console.log(`- ${filing.companyName} (${filing.ticker}): ${filing.filingDate.toISOString().split('T')[0]}`));
  
  // Test date range filter
  const dateFilter = new FilingFilterBuilder<typeof mockFilings[0]>()
    .withDateRange({
      startDate: '2023-10-01',
      endDate: '2023-11-15'
    })
    .build();
  
  const recentFilings = dateFilter.apply(mockFilings);
  console.log(`\nRecent Filings (Oct-Nov 2023) - ${recentFilings.length} results:`);
  recentFilings.forEach(filing => console.log(`- ${filing.companyName} (${filing.ticker}): ${filing.filingType} on ${filing.filingDate.toISOString().split('T')[0]}`));
  
  // Test ticker filter
  const tickerFilter = new FilingFilterBuilder<typeof mockFilings[0]>()
    .withTickers(['AAPL'])
    .build();
  
  const appleFilings = tickerFilter.apply(mockFilings);
  console.log(`\nApple Filings - ${appleFilings.length} results:`);
  appleFilings.forEach(filing => console.log(`- ${filing.filingType}: ${filing.filingDate.toISOString().split('T')[0]} - ${filing.description}`));
  
  // Test composite filter
  const compositeFilter = new FilingFilterBuilder<typeof mockFilings[0]>()
    .withFormTypes(['10-K', '10-Q'])
    .withDateRange({ startDate: '2023-01-01' })
    .build();
  
  const annualAndQuarterlyReports = compositeFilter.apply(mockFilings);
  console.log(`\nAnnual and Quarterly Reports from 2023 - ${annualAndQuarterlyReports.length} results:`);
  annualAndQuarterlyReports.forEach(filing => console.log(`- ${filing.companyName} (${filing.ticker}): ${filing.filingType} on ${filing.filingDate.toISOString().split('T')[0]}`));
}

/**
 * Test the ticker resolver functionality
 */
async function testTickerResolver() {
  console.log('\n=== Testing Ticker Resolver ===');
  
  // Create a new prisma client
  const prisma = new PrismaClient();
  
  // Create SEC client and ticker resolver
  const secClient = new SECDataClient({
    userAgent: 'TLDRSec-AI-Testing contact@example.com'
  });
  
  const tickerResolver = new TickerResolver({
    prisma,
    secClient
  });
  
  try {
    // Test known CIK (Apple)
    // NOTE: This is a simplified test - in a real app we would use a proper
    // ticker-to-CIK database or API. Here we're using a direct CIK we know.
    console.log('\nAttempting to resolve ticker: AAPL');
    const appleResult = await tickerResolver.resolveTicker('AAPL', {
      createIfNotExists: true
    });
    console.log('Result:', JSON.stringify(appleResult, null, 2));
    
    // Test ticker normalization
    console.log('\nTesting ticker normalization:');
    console.log(`'  aapl  ' -> '${tickerResolver.normalizeTicker('  aapl  ')}'`);
    console.log(`'MSFT.US' -> '${tickerResolver.normalizeTicker('MSFT.US')}'`);
    
    // Test batch resolution
    console.log('\nTesting batch resolution for: AAPL, MSFT, AMZN');
    const batchResults = await tickerResolver.batchResolveTickers(['AAPL', 'MSFT', 'AMZN'], {
      createIfNotExists: true
    });
    console.log('Batch results:', JSON.stringify(batchResults, null, 2));
    
  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    // Close prisma client
    await prisma.$disconnect();
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('Starting ticker service tests...\n');
  
  // Test filter functionality
  await testFilters();
  
  // Test ticker resolver functionality
  // Note: This will make real API calls and database operations
  // Uncomment to run when ready for live testing
  // await testTickerResolver();
  
  console.log('\nTests completed.');
}

// Run the tests
runTests().catch(console.error); 