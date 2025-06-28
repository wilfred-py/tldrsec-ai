/**
 * XML Logging Validation Tests
 * 
 * Tests the structured XML logging functionality for SEC filing fetch monitoring
 */

import { describe, expect, test, jest, beforeAll, afterAll } from '@jest/globals';
import { generateXmlSummary, formatXmlSummary, visualizeContextReferences } from '../../lib/xmlLogging';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { logger } from '../../lib/logging';

// Sample XML content for testing
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" 
      xmlns:link="http://www.xbrl.org/2003/linkbase" 
      xmlns:xlink="http://www.w3.org/1999/xlink">
  <link:schemaRef xlink:href="http://example.com/schema.xsd" />
  <context id="AsOf2023Q1">
    <entity>
      <identifier scheme="http://www.sec.gov/CIK">0000123456</identifier>
    </entity>
    <period>
      <instant>2023-03-31</instant>
    </period>
  </context>
  <context id="AsOf2023Q2">
    <entity>
      <identifier scheme="http://www.sec.gov/CIK">0000123456</identifier>
    </entity>
    <period>
      <instant>2023-06-30</instant>
    </period>
  </context>
  <us-gaap:Assets contextRef="AsOf2023Q1" decimals="-6" unitRef="USD">1000000</us-gaap:Assets>
  <us-gaap:Assets contextRef="AsOf2023Q2" decimals="-6" unitRef="USD">1200000</us-gaap:Assets>
  <us-gaap:Liabilities contextRef="AsOf2023Q1" decimals="-6" unitRef="USD">500000</us-gaap:Liabilities>
  <us-gaap:Liabilities contextRef="AsOf2023Q2" decimals="-6" unitRef="USD">600000</us-gaap:Liabilities>
  <div xmlns="http://www.w3.org/1999/xhtml">
    <p>This is embedded HTML content</p>
  </div>
</xbrl>`;

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    secFetchAttempt: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null)
    },
    $disconnect: jest.fn().mockResolvedValue(undefined)
  };
  return {
    PrismaClient: jest.fn(() => mockPrismaClient)
  };
});

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn()
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
jest.mock('../../lib/logging', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('XML Logging and Monitoring', () => {
  let prisma: any;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('generateXmlSummary should extract correct information', () => {
    const summary = generateXmlSummary(sampleXml);
    
    // Check basic properties
    expect(summary.totalElements).toBeGreaterThan(0);
    expect(summary.totalAttributes).toBeGreaterThan(0);
    expect(summary.depth).toBeGreaterThan(0);
    
    // Check namespaces
    expect(Object.keys(summary.namespaces)).toContain('us-gaap');
    expect(Object.keys(summary.namespaces)).toContain('xlink');
    
    // Check context references
    expect(summary.contextRefs).toBeDefined();
    expect(Object.keys(summary.contextRefs!).length).toBe(2);
    expect(summary.contextRefs!['AsOf2023Q1']).toBe(true);
    expect(summary.contextRefs!['AsOf2023Q2']).toBe(true);
    
    // Check embedded HTML detection
    expect(summary.hasEmbeddedHtml).toBe(true);
    
    // Check size categorization
    expect(summary.size.category).toBe('small');
  });

  test('formatXmlSummary should create readable output', () => {
    const summary = generateXmlSummary(sampleXml);
    const formatted = formatXmlSummary(summary);
    
    // Check that the formatted output contains key information
    expect(formatted).toContain('XML Summary');
    expect(formatted).toContain('Elements:');
    expect(formatted).toContain('Attributes:');
    expect(formatted).toContain('Namespaces');
    expect(formatted).toContain('Context References:');
    expect(formatted).toContain('Embedded HTML: Yes');
  });

  test('visualizeContextReferences should create visual representation', () => {
    const summary = generateXmlSummary(sampleXml);
    const visualization = visualizeContextReferences(summary.contextRefs!);
    
    // Check that the visualization contains expected content
    expect(visualization).toContain('Context References:');
    expect(visualization).toContain('AsOf');
    expect(visualization).toMatch(/•/); // Contains dot symbols
  });

  test('XML monitoring integration with SEC fetch monitoring', async () => {
    // Mock the response for a filing fetch
    (mockedAxios.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('index.json')) {
        return Promise.resolve({
          status: 200,
          data: {
            cik: '0000123456',
            ticker: 'TEST',
            formType: '10-K'
          }
        });
      } else {
        return Promise.resolve({
          status: 200,
          headers: {
            'content-type': 'application/xml'
          },
          data: sampleXml
        });
      }
    });

    // Import the getFilingById function
    const { getFilingById } = await import('../../services/filing/getFilingById');
    
    // Call the function to test XML monitoring
    await getFilingById('0000123456-23-000001');
    
    // Verify that the logger was called with XML parsing indicators
    expect(logger.debug).toHaveBeenCalledWith(expect.stringMatching(/Processing XML content/));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringMatching(/XML parsing complete/));
    
    // Verify that the Prisma client was called with XML data
    const createCall = prisma.secFetchAttempt.create.mock.calls[0]?.[0]?.data;
    expect(createCall).toBeDefined();
    
    if (createCall) {
      expect(createCall.hasXmlContent).toBe(true);
      expect(createCall.xmlSize).toBeGreaterThan(0);
    }
  });

  test('API endpoint should include XML monitoring data', async () => {
    // Mock the Prisma findMany to return data with XML monitoring
    (prisma.secFetchAttempt.findMany as jest.Mock).mockResolvedValue([
      {
        id: '1',
        filingId: '0000123456-23-000001',
        ticker: 'TEST',
        formType: '10-K',
        urlAttempts: JSON.stringify([
          {
            url: 'https://www.sec.gov/Archives/edgar/data/123456/000012345623000001/index.json',
            success: true,
            statusCode: 200,
            timestamp: Date.now(),
            xmlSummary: {
              totalElements: 15,
              totalAttributes: 10,
              depth: 5,
              namespaces: { 'us-gaap': 4, xlink: 1 },
              elementCounts: { context: 2, 'us-gaap:Assets': 2 },
              contextRefs: { AsOf2023Q1: true, AsOf2023Q2: true },
              hasEmbeddedHtml: true,
              size: { bytes: 1024, category: 'small' },
              truncated: false
            },
            parsingStages: {
              fetchComplete: true,
              xmlParsed: true,
              namespacesResolved: true,
              contextRefsValid: true
            }
          }
        ]),
        successful: true,
        attemptCount: 1,
        successCount: 1,
        timestamp: new Date(),
        hasXmlContent: true,
        xmlSize: 1024,
        hasEmbeddedHtml: true,
        namespaceCount: 2,
        contextRefCount: 2
      }
    ]);

    // Import the API route handler
    const { GET } = await import('../../app/api/monitoring/sec-fetch/route');
    
    // Create a mock request
    const request = {
      nextUrl: {
        searchParams: new URLSearchParams('days=7')
      }
    } as any;
    
    // Call the API handler
    const response = await GET(request);
    const data = await response.json();
    
    // Verify that the response includes XML analysis
    expect(data.xmlAnalysis).toBeDefined();
    expect(data.xmlAnalysis.totalXmlFiles).toBe(1);
    expect(data.xmlAnalysis.hasEmbeddedHtml).toBe(1);
  });
});
