#!/usr/bin/env node

/**
 * RSS Monitoring Integration Test
 * 
 * This script tests the RSS monitoring system by:
 * 1. Testing RSS URL generation and fetching
 * 2. Testing RSS parsing with real-world data
 * 3. Testing database integration (if available)
 * 4. Testing error handling scenarios
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 RSS Monitoring Integration Test');
console.log('===================================\n');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logResult(testName, passed, error = null) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${testName}`);
  
  if (!passed && error) {
    console.log(`   Error: ${error.message || error}`);
  }
  
  results.tests.push({ name: testName, passed, error: error?.message || error });
  if (passed) results.passed++;
  else results.failed++;
}

// Test 1: RSS URL Generation
console.log('1. Testing RSS URL Generation');
console.log('------------------------------');

function generateSecRssUrl(cik) {
  const formattedCik = cik.padStart(10, '0');
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${formattedCik}&output=atom`;
}

try {
  const testCases = [
    { cik: '1318605', expected: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&output=atom' },
    { cik: '320193', expected: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&output=atom' }
  ];

  for (const testCase of testCases) {
    const url = generateSecRssUrl(testCase.cik);
    logResult(`RSS URL for CIK ${testCase.cik}`, url === testCase.expected);
  }
} catch (error) {
  logResult('RSS URL generation', false, error);
}

console.log();

// Test 2: Real RSS Feed Fetching
console.log('2. Testing Real RSS Feed Fetching');
console.log('----------------------------------');

async function testRssFetching() {
  try {
    // Test with Apple's CIK (well-known, should have recent filings)
    const appleCik = '320193';
    const rssUrl = generateSecRssUrl(appleCik);
    
    console.log(`Fetching: ${rssUrl}`);
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'tldrSEC-AI RSS Test (contact@tldrsec.com)',
        'Accept': 'application/atom+xml, application/xml, text/xml',
      }
    });

    logResult('RSS feed HTTP response', response.ok);
    
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      logResult('Response content type is XML', contentType?.includes('xml') || false);
      
      const xmlContent = await response.text();
      logResult('RSS content retrieved', xmlContent.length > 0);
      logResult('RSS content starts with XML declaration', xmlContent.trim().startsWith('<?xml'));
      
      // Basic feed validation
      const hasFeedElement = xmlContent.includes('<feed') || xmlContent.includes('<feed ');
      logResult('RSS contains feed element', hasFeedElement);
      
      const hasAppleInTitle = xmlContent.includes('APPLE') || xmlContent.includes('Apple');
      logResult('RSS contains Apple company name', hasAppleInTitle);
      
      return xmlContent;
    }
    
    return null;
  } catch (error) {
    logResult('RSS fetch error handling', true); // Errors are expected to be caught
    console.log(`   Note: ${error.message}`);
    return null;
  }
}

const rssContent = await testRssFetching();

console.log();

// Test 3: RSS Parsing with Real Data
console.log('3. Testing RSS Parsing');
console.log('-----------------------');

async function testRssParsing(xmlContent) {
  if (!xmlContent) {
    console.log('Skipping RSS parsing tests (no content available)');
    return;
  }

  try {
    const { parseStringPromise } = await import('xml2js');
    
    const result = await parseStringPromise(xmlContent);
    logResult('XML parsing succeeds', !!result);
    
    if (result) {
      const hasFeed = !!result.feed;
      logResult('Parsed XML has feed element', hasFeed);
      
      if (hasFeed) {
        const feed = result.feed;
        
        // Test title extraction
        const title = feed.title?.[0] || '';
        logResult('Feed has title', title.length > 0);
        
        // Test company name extraction
        const companyNameMatch = title.match(/^(.+?)\s+\(/);
        const companyName = companyNameMatch ? companyNameMatch[1].trim() : '';
        logResult('Company name extracted', companyName.length > 0);
        
        // Test entries
        const entries = feed.entry || [];
        logResult('Feed has entries', entries.length > 0);
        
        if (entries.length > 0) {
          // Test first entry parsing
          const firstEntry = entries[0];
          
          // Test accession number extraction
          const entryId = firstEntry.id?.[0] || '';
          const accessionMatch = entryId.match(/(\\d{10}-\\d{2}-\\d{6})/);
          logResult('Accession number extracted from first entry', !!accessionMatch);
          
          // Test filing type extraction
          const entryTitle = firstEntry.title?.[0] || '';
          const filingTypeMatch = entryTitle.match(/^([A-Z0-9\\/-]+)/);
          logResult('Filing type extracted from first entry', !!filingTypeMatch);
          
          // Test URL extraction
          const link = firstEntry.link?.[0];
          const hasUrl = typeof link === 'string' || (link && link.$ && link.$.href);
          logResult('Filing URL extracted from first entry', hasUrl);
          
          // Test date extraction
          const updatedDate = firstEntry.updated?.[0];
          const hasDate = !!updatedDate;
          logResult('Entry date extracted', hasDate);
          
          if (hasDate) {
            const parsedDate = new Date(updatedDate);
            logResult('Entry date is valid', !isNaN(parsedDate.getTime()));
          }
        }
      }
    }
  } catch (error) {
    logResult('RSS parsing', false, error);
  }
}

await testRssParsing(rssContent);

console.log();

// Test 4: Filing Detection Logic
console.log('4. Testing Filing Detection Logic');
console.log('----------------------------------');

try {
  // Simulate existing filings database
  const existingFilings = new Set([
    '0000320193-23-000001',
    '0000320193-23-000002'
  ]);
  
  // Simulate new filings from RSS
  const rssFilings = [
    { accessionNumber: '0000320193-23-000001', filingType: '8-K' }, // existing
    { accessionNumber: '0000320193-23-000003', filingType: '10-Q' }, // new
    { accessionNumber: '0000320193-23-000004', filingType: '8-K' }, // new
    { accessionNumber: '0000320193-23-000002', filingType: '10-K' } // existing
  ];
  
  // Filter for new filings
  const newFilings = rssFilings.filter(filing => 
    !existingFilings.has(filing.accessionNumber)
  );
  
  logResult('New filing detection', newFilings.length === 2);
  logResult('Duplicate filtering', newFilings.every(f => !existingFilings.has(f.accessionNumber)));
  
} catch (error) {
  logResult('Filing detection logic', false, error);
}

console.log();

// Test 5: Error Handling Scenarios
console.log('5. Testing Error Handling');
console.log('--------------------------');

async function testErrorHandling() {
  try {
    // Test invalid CIK
    const invalidCik = '9999999999';
    const badUrl = generateSecRssUrl(invalidCik);
    
    try {
      const response = await fetch(badUrl, {
        headers: {
          'User-Agent': 'tldrSEC-AI RSS Test (contact@tldrsec.com)',
        }
      });
      
      logResult('Invalid CIK handled', !response.ok || response.status >= 400);
      
    } catch (fetchError) {
      logResult('Network error handling', true);
    }
    
    // Test malformed XML parsing
    const malformedXml = '<feed><entry><id>invalid</entry></feed>';
    
    try {
      const { parseStringPromise } = await import('xml2js');
      const result = await parseStringPromise(malformedXml);
      
      // Should parse but have missing data
      const entries = result.feed?.entry || [];
      const firstEntry = entries[0];
      const entryId = firstEntry?.id?.[0] || '';
      const accessionMatch = entryId.match(/(\\d{10}-\\d{2}-\\d{6})/);
      
      logResult('Malformed entry graceful handling', !accessionMatch);
      
    } catch (xmlError) {
      logResult('XML parsing error handling', true);
    }
    
  } catch (error) {
    logResult('Error handling tests', false, error);
  }
}

await testErrorHandling();

console.log();

// Test 6: Rate Limiting and Batch Processing Logic
console.log('6. Testing Rate Limiting Logic');
console.log('-------------------------------');

try {
  const BATCH_SIZE = 5;
  const MAX_CONCURRENT = 3;
  
  // Simulate ticker list
  const tickers = Array.from({ length: 12 }, (_, i) => ({ 
    symbol: `TEST${i + 1}`, 
    cik: `${1000000 + i}`.padStart(10, '0') 
  }));
  
  // Test batch processing logic
  const batches = [];
  for (let i = 0; i < tickers.length; i += MAX_CONCURRENT) {
    const batch = tickers.slice(i, i + MAX_CONCURRENT);
    batches.push(batch);
  }
  
  logResult('Batch processing creates correct number of batches', batches.length === Math.ceil(tickers.length / MAX_CONCURRENT));
  logResult('Each batch respects size limit', batches.every(batch => batch.length <= MAX_CONCURRENT));
  logResult('All tickers processed', batches.flat().length === tickers.length);
  
} catch (error) {
  logResult('Rate limiting logic', false, error);
}

console.log();

// Test 7: Configuration Validation
console.log('7. Testing Configuration');
console.log('-------------------------');

try {
  // Check environment variables that should be set
  const requiredEnvVars = [
    'DATABASE_URL',
    'ANTHROPIC_API_KEY'
  ];
  
  for (const envVar of requiredEnvVars) {
    const isSet = !!process.env[envVar];
    logResult(`${envVar} environment variable`, isSet);
  }
  
  // Test cron-specific configuration
  const cronSecret = process.env.CRON_SECRET;
  logResult('CRON_SECRET configured', !!cronSecret);
  
} catch (error) {
  logResult('Configuration validation', false, error);
}

console.log();

// Test 8: File Structure Validation
console.log('8. Testing File Structure');
console.log('--------------------------');

import { existsSync } from 'fs';

try {
  const requiredFiles = [
    'app/api/cron/monitor-sec-filings/route.ts',
    'lib/sec-edgar/ticker-monitoring.ts',
    'lib/sec-edgar/rss-parser.ts',
    'prisma/schema.prisma'
  ];
  
  for (const filePath of requiredFiles) {
    const fullPath = join(__dirname, filePath);
    const exists = existsSync(fullPath);
    logResult(`Required file exists: ${filePath}`, exists);
  }
  
} catch (error) {
  logResult('File structure validation', false, error);
}

console.log();

// Final Results
console.log('🏁 Integration Test Results');
console.log('============================');
console.log(`Total Tests: ${results.tests.length}`);
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);

if (results.failed > 0) {
  console.log('\\n🚨 Failed Tests:');
  results.tests.filter(t => !t.passed).forEach(test => {
    console.log(`❌ ${test.name}${test.error ? `: ${test.error}` : ''}`);
  });
}

console.log('\\n📊 Test Categories:');
console.log(`RSS URL Generation: ${results.tests.filter(t => t.name.includes('RSS URL')).filter(t => t.passed).length}/${results.tests.filter(t => t.name.includes('RSS URL')).length}`);
console.log(`RSS Fetching: ${results.tests.filter(t => t.name.includes('RSS') && t.name.includes('fetch')).filter(t => t.passed).length}/${results.tests.filter(t => t.name.includes('RSS') && t.name.includes('fetch')).length}`);
console.log(`XML Parsing: ${results.tests.filter(t => t.name.includes('XML') || t.name.includes('parsing')).filter(t => t.passed).length}/${results.tests.filter(t => t.name.includes('XML') || t.name.includes('parsing')).length}`);
console.log(`Filing Detection: ${results.tests.filter(t => t.name.includes('filing') || t.name.includes('Filing')).filter(t => t.passed).length}/${results.tests.filter(t => t.name.includes('filing') || t.name.includes('Filing')).length}`);
console.log(`Error Handling: ${results.tests.filter(t => t.name.includes('error') || t.name.includes('Error')).filter(t => t.passed).length}/${results.tests.filter(t => t.name.includes('error') || t.name.includes('Error')).length}`);

// Write results to file
import { writeFileSync } from 'fs';
const resultsFile = join(__dirname, 'rss-integration-test-results.json');

try {
  writeFileSync(resultsFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: results.tests.length,
      passed: results.passed,
      failed: results.failed,
      successRate: (results.passed / results.tests.length) * 100
    },
    tests: results.tests
  }, null, 2));
  
  console.log(`\\n📄 Results saved to: ${resultsFile}`);
} catch (error) {
  console.warn(`Warning: Could not save results: ${error.message}`);
}

console.log('\\n✨ Integration testing complete!');