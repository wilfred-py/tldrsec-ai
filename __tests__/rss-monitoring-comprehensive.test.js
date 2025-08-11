// Comprehensive test suite for RSS monitoring and filing detection
// Using plain Node.js testing approach to avoid Jest configuration issues

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  fetchSecCompanyRSS, 
  parseSecCompanyRSS, 
  generateSecRssUrl 
} from '../lib/sec-edgar/rss-parser.js';
import { 
  getActiveTickersForMonitoring,
  checkTickerForNewFilings,
  getUnprocessedFilings,
  markFilingAsProcessed,
  cleanupOldMonitoringData 
} from '../lib/sec-edgar/ticker-monitoring.js';
import { getPrismaClient } from '../lib/db/prisma.js';

// Mock RSS XML response for testing
const MOCK_RSS_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.w3.org/2005/Atom http://www.sec.gov/Archives/edgar/xsd/atom.xsd">
  <id>https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001318605&amp;owner=exclude&amp;count=10&amp;hidefilings=0&amp;output=atom</id>
  <title>TESLA, INC. (0001318605) (CIK=0001318605)</title>
  <link href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001318605&amp;owner=exclude&amp;count=10&amp;hidefilings=0&amp;output=atom" rel="alternate" type="text/html"/>
  <updated>2023-12-01T10:00:00-05:00</updated>
  <author>
    <name>SEC EDGAR</name>
  </author>
  
  <entry>
    <id>urn:tag:sec.gov,2023:accession-number=0001318605-23-000001</id>
    <title>8-K - Current report filing</title>
    <link href="https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000131860523000001/tsla-20231201.htm" rel="alternate" type="text/html"/>
    <summary type="html">Filed: 2023-12-01 AccNo: 0001318605-23-000001 Size: 12 KB</summary>
    <updated>2023-12-01T16:00:00-05:00</updated>
    <category scheme="https://www.sec.gov/" term="form-type" label="8-K"/>
  </entry>
  
  <entry>
    <id>urn:tag:sec.gov,2023:accession-number=0001318605-23-000002</id>
    <title>10-Q - Quarterly report filing</title>
    <link href="https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000131860523000002/tsla-20231130.htm" rel="alternate" type="text/html"/>
    <summary type="html">Filed: 2023-11-30 AccNo: 0001318605-23-000002 Size: 450 KB</summary>
    <updated>2023-11-30T20:00:00-05:00</updated>
    <category scheme="https://www.sec.gov/" term="form-type" label="10-Q"/>
  </entry>
</feed>`;

const EMPTY_RSS_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://www.sec.gov/test</id>
  <title>TEST COMPANY (0000000000) (CIK=0000000000)</title>
  <updated>2023-12-01T10:00:00-05:00</updated>
</feed>`;

describe('RSS Parser Tests', () => {
  describe('generateSecRssUrl', () => {
    it('should generate correct RSS URL for CIK', () => {
      const cik = '1318605';
      const expectedUrl = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&output=atom';
      const actualUrl = generateSecRssUrl(cik);
      assert.strictEqual(actualUrl, expectedUrl);
    });

    it('should pad CIK with leading zeros', () => {
      const cik = '123';
      const expectedUrl = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000000123&output=atom';
      const actualUrl = generateSecRssUrl(cik);
      assert.strictEqual(actualUrl, expectedUrl);
    });
  });

  describe('parseSecCompanyRSS', () => {
    it('should parse valid RSS XML correctly', async () => {
      const cik = '1318605';
      const result = await parseSecCompanyRSS(MOCK_RSS_XML, cik);

      assert.strictEqual(result.cik, cik);
      assert.strictEqual(result.companyName, 'TESLA, INC.');
      assert.strictEqual(result.entries.length, 2);

      const firstEntry = result.entries[0];
      assert.strictEqual(firstEntry.accessionNumber, '0001318605-23-000001');
      assert.strictEqual(firstEntry.filingType, '8-K');
      assert.strictEqual(firstEntry.filingUrl, 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000131860523000001/tsla-20231201.htm');
    });

    it('should handle empty RSS feed', async () => {
      const cik = '0000000000';
      const result = await parseSecCompanyRSS(EMPTY_RSS_XML, cik);

      assert.strictEqual(result.cik, cik);
      assert.strictEqual(result.entries.length, 0);
    });

    it('should throw error for invalid XML', async () => {
      const cik = '1318605';
      const invalidXml = 'invalid xml content';

      await assert.rejects(
        () => parseSecCompanyRSS(invalidXml, cik),
        /RSS parsing failed/
      );
    });
  });

  describe('fetchSecCompanyRSS', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should fetch and parse RSS feed successfully', async () => {
      // Mock successful fetch response
      global.fetch = async (url) => ({
        ok: true,
        status: 200,
        text: async () => MOCK_RSS_XML
      });

      const cik = '1318605';
      const result = await fetchSecCompanyRSS(cik);

      assert.strictEqual(result.cik, cik);
      assert.strictEqual(result.companyName, 'TESLA, INC.');
      assert.strictEqual(result.entries.length, 2);
    });

    it('should handle HTTP errors', async () => {
      // Mock failed fetch response
      global.fetch = async (url) => ({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const cik = '1318605';
      
      await assert.rejects(
        () => fetchSecCompanyRSS(cik),
        /HTTP 404: Not Found/
      );
    });

    it('should handle network errors', async () => {
      // Mock network error
      global.fetch = async (url) => {
        throw new Error('Network error');
      };

      const cik = '1318605';
      
      await assert.rejects(
        () => fetchSecCompanyRSS(cik),
        /Network error/
      );
    });
  });
});

describe('Ticker Monitoring Tests', () => {
  let prisma;

  beforeEach(async () => {
    prisma = getPrismaClient();
    // Clean up test data
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  async function cleanupTestData() {
    try {
      // Clean up in correct order due to foreign key constraints
      await prisma.rssFilingCheck.deleteMany({});
      await prisma.tickerMonitoring.deleteMany({});
      await prisma.ticker.deleteMany({
        where: { symbol: { startsWith: 'TEST_' } }
      });
      await prisma.cikMapping.deleteMany({
        where: { ticker: { startsWith: 'TEST_' } }
      });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'test_' } }
      });
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  }

  async function setupTestData() {
    // Create test user
    const testUser = await prisma.user.create({
      data: {
        email: 'test_user@example.com',
        name: 'Test User',
        authProvider: 'test',
        authProviderId: 'test_123',
        onboardingCompleted: true
      }
    });

    // Create test CIK mapping
    const cikMapping = await prisma.cikMapping.create({
      data: {
        cik: '0001318605',
        ticker: 'TEST_TSLA',
        companyName: 'TEST TESLA INC',
        aliases: [],
        exchangeCodes: ['NASDAQ']
      }
    });

    // Create test ticker
    const ticker = await prisma.ticker.create({
      data: {
        symbol: 'TEST_TSLA',
        companyName: 'TEST TESLA INC',
        userId: testUser.id
      }
    });

    return { testUser, cikMapping, ticker };
  }

  describe('getActiveTickersForMonitoring', () => {
    it('should return empty array when no active tickers exist', async () => {
      const activeTickers = await getActiveTickersForMonitoring();
      assert.strictEqual(activeTickers.length, 0);
    });

    it('should return active tickers with subscriber counts', async () => {
      const { cikMapping } = await setupTestData();
      
      const activeTickers = await getActiveTickersForMonitoring();
      assert.strictEqual(activeTickers.length, 1);
      
      const ticker = activeTickers[0];
      assert.strictEqual(ticker.symbol, 'TEST_TSLA');
      assert.strictEqual(ticker.cik, '0001318605');
      assert.strictEqual(ticker.subscriberCount, 1);
      assert.strictEqual(ticker.rssUrl, 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&output=atom');
    });
  });

  describe('checkTickerForNewFilings', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should detect new filings and store them in database', async () => {
      const { cikMapping } = await setupTestData();
      
      // Get active ticker
      const activeTickers = await getActiveTickersForMonitoring();
      const ticker = activeTickers[0];

      // Mock RSS fetch
      global.fetch = async (url) => ({
        ok: true,
        status: 200,
        text: async () => MOCK_RSS_XML
      });

      const newFilings = await checkTickerForNewFilings(ticker);
      
      assert.strictEqual(newFilings.length, 2);
      assert.strictEqual(newFilings[0].accessionNumber, '0001318605-23-000001');
      assert.strictEqual(newFilings[0].filingType, '8-K');

      // Verify filings were stored in database
      const storedFilings = await prisma.rssFilingCheck.findMany({
        where: { tickerMonitoringId: ticker.id }
      });
      
      assert.strictEqual(storedFilings.length, 2);
      assert.strictEqual(storedFilings[0].processed, false);
    });

    it('should not create duplicates on subsequent checks', async () => {
      const { cikMapping } = await setupTestData();
      
      // Get active ticker
      const activeTickers = await getActiveTickersForMonitoring();
      const ticker = activeTickers[0];

      // Mock RSS fetch
      global.fetch = async (url) => ({
        ok: true,
        status: 200,
        text: async () => MOCK_RSS_XML
      });

      // First check - should find new filings
      const newFilings1 = await checkTickerForNewFilings(ticker);
      assert.strictEqual(newFilings1.length, 2);

      // Second check - should find no new filings
      const newFilings2 = await checkTickerForNewFilings(ticker);
      assert.strictEqual(newFilings2.length, 0);

      // Verify only 2 filings exist in database
      const storedFilings = await prisma.rssFilingCheck.findMany({
        where: { tickerMonitoringId: ticker.id }
      });
      
      assert.strictEqual(storedFilings.length, 2);
    });

    it('should handle RSS fetch errors gracefully', async () => {
      const { cikMapping } = await setupTestData();
      
      // Get active ticker
      const activeTickers = await getActiveTickersForMonitoring();
      const ticker = activeTickers[0];

      // Mock failed RSS fetch
      global.fetch = async (url) => {
        throw new Error('Network error');
      };

      await assert.rejects(
        () => checkTickerForNewFilings(ticker),
        /Network error/
      );

      // Verify lastChecked was still updated even on error
      const updatedMonitoring = await prisma.tickerMonitoring.findUnique({
        where: { id: ticker.id }
      });
      
      assert.ok(updatedMonitoring.lastChecked instanceof Date);
    });
  });

  describe('getUnprocessedFilings', () => {
    it('should return unprocessed filings in correct order', async () => {
      const { cikMapping } = await setupTestData();
      
      // Get active ticker
      const activeTickers = await getActiveTickersForMonitoring();
      const ticker = activeTickers[0];

      // Mock RSS fetch and add filings
      global.fetch = async (url) => ({
        ok: true,
        status: 200,
        text: async () => MOCK_RSS_XML
      });

      await checkTickerForNewFilings(ticker);

      // Get unprocessed filings
      const unprocessedFilings = await getUnprocessedFilings(10);
      
      assert.strictEqual(unprocessedFilings.length, 2);
      assert.strictEqual(unprocessedFilings[0].ticker.symbol, 'TEST_TSLA');
      assert.strictEqual(unprocessedFilings[0].ticker.cik, '0001318605');
    });

    it('should respect limit parameter', async () => {
      const { cikMapping } = await setupTestData();
      
      // Get active ticker
      const activeTickers = await getActiveTickersForMonitoring();
      const ticker = activeTickers[0];

      // Mock RSS fetch and add filings
      global.fetch = async (url) => ({
        ok: true,
        status: 200,
        text: async () => MOCK_RSS_XML
      });

      await checkTickerForNewFilings(ticker);

      // Get limited unprocessed filings
      const unprocessedFilings = await getUnprocessedFilings(1);
      
      assert.strictEqual(unprocessedFilings.length, 1);
    });
  });

  describe('markFilingAsProcessed', () => {
    it('should mark filing as processed', async () => {
      const { cikMapping } = await setupTestData();
      
      // Get active ticker and add filings
      const activeTickers = await getActiveTickersForMonitoring();
      const ticker = activeTickers[0];

      global.fetch = async (url) => ({
        ok: true,
        status: 200,
        text: async () => MOCK_RSS_XML
      });

      await checkTickerForNewFilings(ticker);

      // Get unprocessed filing
      const unprocessedFilings = await getUnprocessedFilings(1);
      const filing = unprocessedFilings[0];

      // Mark as processed
      await markFilingAsProcessed(filing.id);

      // Verify it's marked as processed
      const updatedFiling = await prisma.rssFilingCheck.findUnique({
        where: { id: filing.id }
      });
      
      assert.strictEqual(updatedFiling.processed, true);
    });
  });

  describe('cleanupOldMonitoringData', () => {
    it('should remove old processed filing checks', async () => {
      const { cikMapping } = await setupTestData();
      
      // Create old processed filing check
      const thirtyOneDaysAgo = new Date();
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

      const tickerMonitoring = await prisma.tickerMonitoring.findFirst();
      
      const oldFiling = await prisma.rssFilingCheck.create({
        data: {
          tickerMonitoringId: tickerMonitoring.id,
          accessionNumber: '0001318605-23-000999',
          filingType: '8-K',
          filingDate: thirtyOneDaysAgo,
          filingUrl: 'https://example.com/old-filing.htm',
          rssEntryDate: thirtyOneDaysAgo,
          processed: true,
          createdAt: thirtyOneDaysAgo
        }
      });

      // Run cleanup
      await cleanupOldMonitoringData();

      // Verify old filing was deleted
      const deletedFiling = await prisma.rssFilingCheck.findUnique({
        where: { id: oldFiling.id }
      });
      
      assert.strictEqual(deletedFiling, null);
    });

    it('should not remove recent or unprocessed filing checks', async () => {
      const { cikMapping } = await setupTestData();
      
      const tickerMonitoring = await prisma.tickerMonitoring.findFirst();
      
      // Create recent processed filing
      const recentFiling = await prisma.rssFilingCheck.create({
        data: {
          tickerMonitoringId: tickerMonitoring.id,
          accessionNumber: '0001318605-23-000888',
          filingType: '10-K',
          filingDate: new Date(),
          filingUrl: 'https://example.com/recent-filing.htm',
          rssEntryDate: new Date(),
          processed: true
        }
      });

      // Create old unprocessed filing
      const thirtyOneDaysAgo = new Date();
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

      const unprocessedFiling = await prisma.rssFilingCheck.create({
        data: {
          tickerMonitoringId: tickerMonitoring.id,
          accessionNumber: '0001318605-23-000777',
          filingType: '8-K',
          filingDate: thirtyOneDaysAgo,
          filingUrl: 'https://example.com/unprocessed-filing.htm',
          rssEntryDate: thirtyOneDaysAgo,
          processed: false,
          createdAt: thirtyOneDaysAgo
        }
      });

      // Run cleanup
      await cleanupOldMonitoringData();

      // Verify both filings still exist
      const recentFilingAfter = await prisma.rssFilingCheck.findUnique({
        where: { id: recentFiling.id }
      });
      const unprocessedFilingAfter = await prisma.rssFilingCheck.findUnique({
        where: { id: unprocessedFiling.id }
      });
      
      assert.ok(recentFilingAfter !== null);
      assert.ok(unprocessedFilingAfter !== null);
    });
  });
});

console.log('Starting comprehensive RSS monitoring tests...');