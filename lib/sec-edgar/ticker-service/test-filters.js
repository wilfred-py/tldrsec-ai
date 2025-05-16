/**
 * Simple test script for filter functionality.
 * Run with: node lib/sec-edgar/ticker-service/test-filters.js
 */

// Mock filings for testing filters
const mockFilings = [
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

// === Simple filter implementations for demonstration ===
class FormTypeFilter {
  constructor(formTypes) {
    this.formTypes = Array.isArray(formTypes) ? formTypes : [formTypes];
  }
  
  apply(filings) {
    return filings.filter(filing => 
      filing.filingType && this.formTypes.includes(filing.filingType)
    );
  }
  
  getDescription() {
    return `Form types: ${this.formTypes.join(', ')}`;
  }
}

class DateRangeFilter {
  constructor(options = {}) {
    this.startDate = options.startDate ? new Date(options.startDate) : undefined;
    this.endDate = options.endDate ? new Date(options.endDate) : undefined;
  }
  
  apply(filings) {
    return filings.filter(filing => {
      if (!filing.filingDate) return false;
      
      const filingDate = filing.filingDate instanceof Date 
        ? filing.filingDate 
        : new Date(filing.filingDate);
      
      if (this.startDate && filingDate < this.startDate) return false;
      if (this.endDate && filingDate > this.endDate) return false;
      
      return true;
    });
  }
  
  getDescription() {
    const start = this.startDate ? this.startDate.toISOString().substring(0, 10) : 'any';
    const end = this.endDate ? this.endDate.toISOString().substring(0, 10) : 'any';
    return `Date range: ${start} to ${end}`;
  }
}

class TickerFilter {
  constructor(tickers) {
    this.tickers = Array.isArray(tickers) ? tickers : [tickers];
    // Normalize tickers
    this.tickers = this.tickers.map(ticker => ticker.trim().toUpperCase());
  }
  
  apply(filings) {
    return filings.filter(filing => 
      filing.ticker && this.tickers.includes(filing.ticker.toUpperCase())
    );
  }
  
  getDescription() {
    return `Tickers: ${this.tickers.join(', ')}`;
  }
}

class CompositeFilter {
  constructor(filters) {
    this.filters = filters;
  }
  
  apply(filings) {
    // Apply each filter in sequence
    let result = filings;
    for (const filter of this.filters) {
      result = filter.apply(result);
    }
    return result;
  }
  
  getDescription() {
    return this.filters.map(filter => filter.getDescription()).join(' AND ');
  }
}

// Simple builder pattern
class FilingFilterBuilder {
  constructor() {
    this.filters = [];
  }
  
  withFormTypes(formTypes) {
    this.filters.push(new FormTypeFilter(formTypes));
    return this;
  }
  
  withDateRange(options) {
    this.filters.push(new DateRangeFilter(options));
    return this;
  }
  
  withTickers(tickers) {
    this.filters.push(new TickerFilter(tickers));
    return this;
  }
  
  build() {
    if (this.filters.length === 0) {
      throw new Error('No filters added to builder');
    }
    
    if (this.filters.length === 1) {
      return this.filters[0];
    }
    
    return new CompositeFilter(this.filters);
  }
}

// === Run the tests ===
function testFilters() {
  console.log('=== Testing Filing Filters ===');
  
  // Test form type filter
  const formTypeFilter = new FilingFilterBuilder()
    .withFormTypes(['10-K'])
    .build();
  
  const annualReports = formTypeFilter.apply(mockFilings);
  console.log(`\nAnnual Reports (10-K) - ${annualReports.length} results:`);
  annualReports.forEach(filing => console.log(`- ${filing.companyName} (${filing.ticker}): ${filing.filingDate.toISOString().split('T')[0]}`));
  
  // Test date range filter
  const dateFilter = new FilingFilterBuilder()
    .withDateRange({
      startDate: '2023-10-01',
      endDate: '2023-11-15'
    })
    .build();
  
  const recentFilings = dateFilter.apply(mockFilings);
  console.log(`\nRecent Filings (Oct-Nov 2023) - ${recentFilings.length} results:`);
  recentFilings.forEach(filing => console.log(`- ${filing.companyName} (${filing.ticker}): ${filing.filingType} on ${filing.filingDate.toISOString().split('T')[0]}`));
  
  // Test ticker filter
  const tickerFilter = new FilingFilterBuilder()
    .withTickers(['AAPL'])
    .build();
  
  const appleFilings = tickerFilter.apply(mockFilings);
  console.log(`\nApple Filings - ${appleFilings.length} results:`);
  appleFilings.forEach(filing => console.log(`- ${filing.filingType}: ${filing.filingDate.toISOString().split('T')[0]} - ${filing.description}`));
  
  // Test composite filter
  const compositeFilter = new FilingFilterBuilder()
    .withFormTypes(['10-K', '10-Q'])
    .withDateRange({ startDate: '2023-01-01' })
    .build();
  
  const annualAndQuarterlyReports = compositeFilter.apply(mockFilings);
  console.log(`\nAnnual and Quarterly Reports from 2023 - ${annualAndQuarterlyReports.length} results:`);
  annualAndQuarterlyReports.forEach(filing => console.log(`- ${filing.companyName} (${filing.ticker}): ${filing.filingType} on ${filing.filingDate.toISOString().split('T')[0]}`));
  
  // Test a more complex composite filter
  const complexFilter = new FilingFilterBuilder()
    .withFormTypes(['10-K'])
    .withTickers(['MSFT', 'AAPL'])
    .build();
  
  const msftAndApplAnnualReports = complexFilter.apply(mockFilings);
  console.log(`\nMicrosoft and Apple Annual Reports - ${msftAndApplAnnualReports.length} results:`);
  msftAndApplAnnualReports.forEach(filing => console.log(`- ${filing.companyName} (${filing.ticker}): ${filing.filingDate.toISOString().split('T')[0]}`));
}

// Run the tests
testFilters(); 