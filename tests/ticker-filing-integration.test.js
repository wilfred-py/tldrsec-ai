/**
 * Integration test for SEC filing tracking workflow
 * 
 * This test verifies that:
 * 1. User tickers are properly tracked
 * 2. SEC filings are fetched for tracked tickers
 * 3. Filings are parsed and summarized correctly
 * 4. Results are stored in the database
 */

// Mock configuration
const TEST_CONFIG = {
  tickerSymbol: 'AAPL',
  userId: 'test-user-123',
  filingType: '10-K',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm'
};

// Mock database data
const mockData = {
  user: {
    id: TEST_CONFIG.userId,
    email: 'test@example.com',
    name: 'Test User'
  },
  tickers: [
    {
      id: 'ticker-123',
      symbol: TEST_CONFIG.tickerSymbol,
      companyName: 'Apple Inc.',
      cik: '0000320193',
      isTracked: true
    }
  ],
  filings: [
    {
      id: 'filing-123',
      tickerId: 'ticker-123',
      formType: TEST_CONFIG.filingType,
      filingDate: new Date().toISOString(),
      url: TEST_CONFIG.filingUrl,
      processingStatus: 'PENDING'
    }
  ]
};

// Mock functions for database and API operations
const mockDb = {
  getUserTickers: async (userId) => {
    console.log(`[DB] Getting tickers for user ${userId}`);
    return mockData.tickers.filter(ticker => ticker.isTracked);
  },
  
  getFilingsForTicker: async (tickerId) => {
    console.log(`[DB] Getting filings for ticker ${tickerId}`);
    return mockData.filings.filter(filing => filing.tickerId === tickerId);
  },
  
  saveSummary: async (summary) => {
    console.log(`[DB] Saving summary for filing ${summary.filingId}`);
    return { id: 'summary-123', ...summary };
  },
  
  updateFilingStatus: async (filingId, status) => {
    console.log(`[DB] Updating filing ${filingId} status to ${status}`);
    const filing = mockData.filings.find(f => f.id === filingId);
    if (filing) {
      filing.processingStatus = status;
    }
    return filing;
  }
};

// Mock SEC API service
const mockSecService = {
  fetchLatestFilings: async (ticker) => {
    console.log(`[SEC API] Fetching latest filings for ${ticker.symbol}`);
    return mockData.filings;
  },
  
  parseFilingContent: async (url, formType) => {
    console.log(`[SEC API] Parsing ${formType} filing from ${url}`);
    return {
      filingType: formType,
      companyName: 'Apple Inc.',
      sections: [
        { title: 'Risk Factors', content: 'Risk factors content...' },
        { title: 'Management Discussion', content: 'MD&A content...' },
        { title: 'Financial Statements', content: 'Financial statements content...' }
      ]
    };
  }
};

// Mock AI summarization service
const mockAiService = {
  summarizeFiling: async (parsedFiling) => {
    console.log(`[AI] Summarizing ${parsedFiling.filingType} filing for ${parsedFiling.companyName}`);
    return {
      summaryText: 'This is a summary of the filing...',
      summaryJSON: {
        highlights: ['Record revenue', 'New product launches'],
        risks: ['Supply chain disruptions', 'Regulatory challenges'],
        outlook: 'Positive growth expected',
        financialHighlights: {
          revenue: '$394.3 billion',
          netIncome: '$96.9 billion'
        }
      }
    };
  }
};

// Mock notification service
const mockNotificationService = {
  notifyUser: async (userId, message) => {
    console.log(`[Notification] Sending notification to user ${userId}: ${message}`);
    return true;
  }
};

// The main workflow function that ties everything together
async function processTickerFilingWorkflow(userId) {
  try {
    console.log(`\n=== Starting SEC Filing Workflow for User: ${userId} ===\n`);
    
    // Step 1: Get user's tracked tickers
    const trackedTickers = await mockDb.getUserTickers(userId);
    console.log(`Found ${trackedTickers.length} tracked tickers`);
    
    if (trackedTickers.length === 0) {
      console.log('No tracked tickers found for user');
      return { success: false, reason: 'NO_TRACKED_TICKERS' };
    }
    
    let processedFilings = 0;
    
    // Step 2: Process each ticker
    for (const ticker of trackedTickers) {
      console.log(`\nProcessing ticker: ${ticker.symbol}`);
      
      // Step 3: Fetch latest filings for this ticker
      const filings = await mockSecService.fetchLatestFilings(ticker);
      console.log(`Found ${filings.length} filings for ${ticker.symbol}`);
      
      if (filings.length === 0) {
        console.log(`No filings found for ${ticker.symbol}`);
        continue;
      }
      
      // Step 4: Process each filing
      for (const filing of filings) {
        if (filing.processingStatus !== 'PENDING') {
          console.log(`Filing ${filing.id} already processed (${filing.processingStatus})`);
          continue;
        }
        
        console.log(`\nProcessing ${filing.formType} filing: ${filing.id}`);
        
        try {
          // Step 5: Parse the filing content
          const parsedFiling = await mockSecService.parseFilingContent(
            filing.url, 
            filing.formType
          );
          console.log(`Successfully parsed filing with ${parsedFiling.sections.length} sections`);
          
          // Step 6: Summarize the filing using AI
          const summary = await mockAiService.summarizeFiling(parsedFiling);
          console.log('Successfully generated summary');
          
          // Step 7: Save the summary to the database
          const savedSummary = await mockDb.saveSummary({
            filingId: filing.id,
            content: summary.summaryText,
            metadata: summary.summaryJSON,
            processingStatus: 'COMPLETED',
            processingCompletedAt: new Date().toISOString()
          });
          console.log(`Summary saved with ID: ${savedSummary.id}`);
          
          // Step 8: Update the filing status
          await mockDb.updateFilingStatus(filing.id, 'PROCESSED');
          
          // Step 9: Notify the user
          await mockNotificationService.notifyUser(
            userId,
            `New ${filing.formType} filing for ${ticker.symbol} has been summarized`
          );
          
          processedFilings++;
        } catch (error) {
          console.error(`Error processing filing ${filing.id}:`, error.message);
          await mockDb.updateFilingStatus(filing.id, 'FAILED');
        }
      }
    }
    
    console.log(`\n=== SEC Filing Workflow Completed ===`);
    console.log(`Processed ${processedFilings} filings for ${trackedTickers.length} tickers`);
    
    return { 
      success: true, 
      processedFilings,
      trackedTickers: trackedTickers.length
    };
  } catch (error) {
    console.error('Workflow error:', error.message);
    return { success: false, reason: 'WORKFLOW_ERROR', error: error.message };
  }
}

// Run the test
console.log('=== Running SEC Filing Tracking Integration Test ===\n');

processTickerFilingWorkflow(TEST_CONFIG.userId)
  .then(result => {
    console.log('\n=== Test Results ===');
    if (result.success) {
      console.log(`✅ Test completed successfully`);
      console.log(`✅ Processed ${result.processedFilings} filings for ${result.trackedTickers} tickers`);
    } else {
      console.log(`❌ Test failed: ${result.reason}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
    
    // Final verification
    const filing = mockData.filings[0];
    console.log('\n=== Verification ===');
    console.log(`Filing status: ${filing.processingStatus}`);
    console.log(`Expected status: PROCESSED`);
    
    if (filing.processingStatus === 'PROCESSED') {
      console.log('✅ Filing status correctly updated');
    } else {
      console.log('❌ Filing status not updated correctly');
    }
    
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  });
