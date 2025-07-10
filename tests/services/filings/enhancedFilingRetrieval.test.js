/**
 * Enhanced Filing Retrieval Tests
 * 
 * Tests for the improved filing content retrieval system with specific focus on
 * Form 4 and Form 144 filings to ensure we never return directory listings
 */

const axios = require('axios');
const { jest } = require('@jest/globals');

// Mock dependencies
jest.mock('axios');
jest.mock('../../../lib/logging', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../../config/sec', () => ({
  SEC_CONFIG: {
    HEADERS: {
      'User-Agent': 'test-user-agent'
    }
  }
}));

// Mock the bottleneck limiter to execute immediately
jest.mock('bottleneck', () => {
  return function() {
    return {
      schedule: jest.fn((fn) => fn()),
      updateSettings: jest.fn()
    };
  };
});

// Mock the SEC Edgar client
jest.mock('../../../lib/sec-edgar/client', () => {
  return {
    SECEdgarClient: jest.fn().mockImplementation(() => {
      return {
        getFilingDocument: jest.fn().mockImplementation((url) => {
          if (url.includes('error')) {
            return Promise.reject(new Error('SEC client error'));
          }
          if (url.includes('form4.xml') || url.includes('xslF345X03')) {
            return Promise.resolve('<ownershipDocument>Form 4 content</ownershipDocument>');
          }
          if (url.includes('form144')) {
            return Promise.resolve('FORM 144 Notice of Proposed Sale of Securities');
          }
          if (url.includes('directory')) {
            return Promise.resolve('<title>Index of /Archives/edgar/data/</title>');
          }
          return Promise.resolve('Mock SEC client document content');
        })
      };
    })
  };
});

// Import the function under test
let documentScraper;
let getFilingContent;

describe('Enhanced Filing Content Retrieval', () => {
  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock document scraper functions
    documentScraper = {
      isDirectoryListing: jest.fn((content) => {
        return content.includes('Index of') || 
               content.includes('Directory Listing') ||
               content.includes('<title>Index of /Archives/edgar/data/');
      }),
      extractDocumentLinks: jest.fn((content, baseUrl) => {
        if (content.includes('form4.xml')) {
          return [`${baseUrl}/form4.xml`];
        }
        if (content.includes('form144.xml')) {
          return [`${baseUrl}/form144.xml`];
        }
        return [`${baseUrl}/document1.xml`, `${baseUrl}/document2.html`];
      })
    };
    
    // Mock dynamic import of document scraper
    jest.mock('../../../services/filings/extractors/documentScraper', () => documentScraper, { virtual: true });
    
    // Import the function under test after mocking dependencies
    const filingRetrieval = require('../../../services/filings/filingRetrieval');
    getFilingContent = filingRetrieval.getFilingContent;
  });

  test('should successfully retrieve Form 4 content on first pass', async () => {
    // Mock axios to return Form 4 content for the first URL pattern
    axios.get.mockResolvedValueOnce({
      data: '<ownershipDocument>Form 4 content</ownershipDocument>'
    });

    const result = await getFilingContent('0001234567-23-000123', '0001234567');
    
    expect(result).toBe('<ownershipDocument>Form 4 content</ownershipDocument>');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(documentScraper.isDirectoryListing).toHaveBeenCalledTimes(1);
    expect(documentScraper.isDirectoryListing).toHaveReturnedWith(false);
  });

  test('should successfully retrieve Form 144 content on first pass', async () => {
    // Mock axios to return Form 144 content for the first URL pattern
    axios.get.mockResolvedValueOnce({
      data: 'FORM 144 Notice of Proposed Sale of Securities'
    });

    const result = await getFilingContent('0001104659-23-000123', '0001234567');
    
    expect(result).toBe('FORM 144 Notice of Proposed Sale of Securities');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(documentScraper.isDirectoryListing).toHaveBeenCalledTimes(1);
    expect(documentScraper.isDirectoryListing).toHaveReturnedWith(false);
  });

  test('should skip directory listings and continue to next URL', async () => {
    // Mock axios to return directory listing for first URL, then valid content
    axios.get.mockResolvedValueOnce({
      data: '<title>Index of /Archives/edgar/data/</title>'
    }).mockResolvedValueOnce({
      data: 'Valid filing content'
    });

    const result = await getFilingContent('0001234567-23-000123', '0001234567');
    
    expect(result).toBe('Valid filing content');
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(documentScraper.isDirectoryListing).toHaveBeenCalledTimes(2);
    expect(documentScraper.isDirectoryListing).toHaveNthReturnedWith(1, true);
    expect(documentScraper.isDirectoryListing).toHaveNthReturnedWith(2, false);
  });

  test('should extract and try document links when all direct URLs return directory listings', async () => {
    // Mock axios to return directory listings for all URL patterns
    axios.get.mockImplementation((url) => {
      if (url.includes('form4.xml')) {
        return Promise.resolve({ data: '<ownershipDocument>Form 4 content</ownershipDocument>' });
      }
      return Promise.resolve({ data: '<title>Index of /Archives/edgar/data/</title>' });
    });

    const result = await getFilingContent('0001234567-23-000123', '0001234567');
    
    expect(result).toBe('<ownershipDocument>Form 4 content</ownershipDocument>');
    expect(documentScraper.extractDocumentLinks).toHaveBeenCalled();
  });

  test('should fall back to SEC Edgar client when direct fetching fails', async () => {
    // Mock axios to fail for all requests
    axios.get.mockRejectedValue(new Error('Network error'));

    const result = await getFilingContent('0001234567-23-000123', '0001234567');
    
    // Should get content from SEC client
    expect(result).toBe('Mock SEC client document content');
  });

  test('should handle Form 4 filings with specific URL patterns', async () => {
    // Mock axios to fail for standard patterns but succeed for Form 4 specific pattern
    axios.get.mockImplementation((url) => {
      if (url.includes('xslF345X03/primary_doc.xml')) {
        return Promise.resolve({ data: '<ownershipDocument>Form 4 content</ownershipDocument>' });
      }
      return Promise.reject(new Error('Not found'));
    });

    const result = await getFilingContent('0001209191-23-000123', '0001234567');
    
    expect(result).toBe('<ownershipDocument>Form 4 content</ownershipDocument>');
    // Should detect Form 4 from accession number pattern
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('xslF345X03/primary_doc.xml'),
      expect.any(Object)
    );
  });

  test('should handle Form 144 filings with specific URL patterns', async () => {
    // Mock axios to fail for standard patterns but succeed for Form 144 specific pattern
    axios.get.mockImplementation((url) => {
      if (url.includes('form144.xml')) {
        return Promise.resolve({ data: 'FORM 144 Notice of Proposed Sale of Securities' });
      }
      return Promise.reject(new Error('Not found'));
    });

    const result = await getFilingContent('0001104659-23-000123', '0001234567');
    
    expect(result).toBe('FORM 144 Notice of Proposed Sale of Securities');
    // Should detect Form 144 from accession number pattern
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('form144.xml'),
      expect.any(Object)
    );
  });

  test('should throw error when all attempts fail', async () => {
    // Mock axios to return directory listings for all URLs
    axios.get.mockResolvedValue({
      data: '<title>Index of /Archives/edgar/data/</title>'
    });
    
    // Mock SEC client to also return directory listings
    const { SECEdgarClient } = require('../../../lib/sec-edgar/client');
    SECEdgarClient.mockImplementation(() => ({
      getFilingDocument: jest.fn().mockResolvedValue('<title>Index of /Archives/edgar/data/</title>')
    }));

    // Mock document scraper to detect directory listings
    documentScraper.isDirectoryListing.mockReturnValue(true);
    
    await expect(getFilingContent('0001234567-23-000123', '0001234567'))
      .rejects.toThrow('No valid filing content found for 0001234567-23-000123');
  });

  test('should validate Form 4 content and reject invalid content', async () => {
    // Mock axios to return XML stylesheet without actual Form 4 content
    axios.get.mockResolvedValue({
      data: '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="xslF345X03/form4.xsl"?>'
    });
    
    // Mock document scraper to not detect this as directory listing (edge case)
    documentScraper.isDirectoryListing.mockReturnValue(false);
    
    // But SEC client returns valid content as fallback
    const { SECEdgarClient } = require('../../../lib/sec-edgar/client');
    SECEdgarClient.mockImplementation(() => ({
      getFilingDocument: jest.fn().mockResolvedValue('<ownershipDocument>Form 4 content</ownershipDocument>')
    }));

    const result = await getFilingContent('0001209191-23-000123', '0001234567');
    
    // Should get valid content from SEC client fallback
    expect(result).toBe('<ownershipDocument>Form 4 content</ownershipDocument>');
  });

  test('should try last resort URLs for Form 4 when other methods fail', async () => {
    // Mock all previous attempts to fail
    axios.get.mockImplementation((url) => {
      if (url.includes('last resort') || url.includes('xslF345X03/0001209191-23-000123.xml')) {
        return Promise.resolve({ data: '<ownershipDocument>Last resort Form 4 content</ownershipDocument>' });
      }
      return Promise.reject(new Error('Not found'));
    });
    
    // Mock SEC client to also fail
    const { SECEdgarClient } = require('../../../lib/sec-edgar/client');
    SECEdgarClient.mockImplementation(() => ({
      getFilingDocument: jest.fn().mockRejectedValue(new Error('SEC client error'))
    }));

    const result = await getFilingContent('0001209191-23-000123', '0001234567');
    
    expect(result).toBe('<ownershipDocument>Last resort Form 4 content</ownershipDocument>');
  });
});
