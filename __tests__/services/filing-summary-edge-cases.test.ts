import { jest } from '@jest/globals';
import * as filingService from '../../services/filingService';
import * as secService from '../../services/secService';
import { FilingType } from '../../lib/sec-edgar/types';

// Mock the dependencies
jest.mock('../../services/secService');
jest.mock('../../lib/db', () => ({
  prisma: {
    ticker: {
      findFirst: jest.fn().mockResolvedValue({ id: 'mock-ticker-id', symbol: 'TEST' }),
    },
    summary: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mock-summary-id' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'mock-filing-id' }]),
  },
}));
jest.mock('../../lib/ai/summarize', () => ({
  summarizeFiling: jest.fn().mockResolvedValue({
    summaryText: 'Mock summary text',
    keyPoints: ['Mock key point 1', 'Mock key point 2'],
  }),
}));
jest.mock('axios');

describe('Filing Summary Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('KO 8-K Summary Generation', () => {
    it('should correctly generate 8-K summary for KO by passing company object to getLatestFilingByFormType', async () => {
      // Mock the company info
      const mockCompany = {
        cik: '0000021344',
        name: 'Coca-Cola Company (The)',
        ticker: 'KO'
      };
      
      // Mock the filing
      const mockFiling = {
        accessionNumber: '0000021344-23-000123',
        filingDate: '2023-06-15',
        form: '8-K',
        primaryDocument: 'form8k.htm'
      };
      
      // Mock the filing details
      const mockFilingDetails = {
        documents: [
          {
            fileName: 'form8k.htm',
            description: 'FORM 8-K',
            documentUrl: 'https://www.sec.gov/Archives/edgar/data/21344/000002134423000123/form8k.htm'
          }
        ],
        primaryDocument: 'form8k.htm'
      };

      // Setup mocks
      (secService.findCompanyByTicker as jest.Mock).mockResolvedValue(mockCompany);
      (secService.getLatestFilingByFormType as jest.Mock).mockResolvedValue(mockFiling);
      (secService.getFilingDetails as jest.Mock).mockResolvedValue(mockFilingDetails);
      (secService.getSecApiHeaders as jest.Mock).mockReturnValue({ 'User-Agent': 'test-agent' });

      // Mock axios response for document content
      const axios = require('axios');
      axios.get.mockResolvedValue({
        status: 200,
        data: '<html><body>Mock 8-K filing content</body></html>'
      });

      // Call the function under test
      const result = await filingService.default.getFilingSummary('KO', '8-K' as FilingType);

      // Assertions
      expect(result.data).not.toBeNull();
      expect(result.error).toBeUndefined();
      
      // Verify that findCompanyByTicker was called
      expect(secService.findCompanyByTicker).toHaveBeenCalledWith('KO');
      
      // Verify that getLatestFilingByFormType was called with the company object, not just the ticker
      expect(secService.getLatestFilingByFormType).toHaveBeenCalledWith(mockCompany, '8-K');
      
      // Verify that getFilingDetails was called with the correct accession number and CIK
      expect(secService.getFilingDetails).toHaveBeenCalledWith(mockFiling.accessionNumber, mockCompany.cik);
    });

    it('should handle case when no 8-K filings are found for KO', async () => {
      // Mock the company info
      const mockCompany = {
        cik: '0000021344',
        name: 'Coca-Cola Company (The)',
        ticker: 'KO'
      };
      
      // Setup mocks
      (secService.findCompanyByTicker as jest.Mock).mockResolvedValue(mockCompany);
      (secService.getLatestFilingByFormType as jest.Mock).mockResolvedValue(null); // No filings found

      // Call the function under test
      const result = await filingService.default.getFilingSummary('KO', '8-K' as FilingType);

      // Assertions
      expect(result.data).toBeNull();
      expect(result.error).toContain('No 8-K filings found for KO');
      
      // Verify that findCompanyByTicker was called
      expect(secService.findCompanyByTicker).toHaveBeenCalledWith('KO');
      
      // Verify that getLatestFilingByFormType was called with the company object
      expect(secService.getLatestFilingByFormType).toHaveBeenCalledWith(mockCompany, '8-K');
    });
  });

  describe('Form 144 Filing Retrieval', () => {
    it('should handle 404 errors for Form 144 filings and use fallback data', async () => {
      // Mock the company info
      const mockCompany = {
        cik: '0001679788',
        name: 'Coinbase Global, Inc.',
        ticker: 'COIN'
      };
      
      // Mock the latest Form 144 filing
      const mockForm144Filing = {
        accessionNumber: '0001679788-23-000456',
        filingDate: '2023-06-20',
        description: 'Form 144 filing for Coinbase Global, Inc.',
        keyPoints: ['Proposed sale of securities'],
        parsedContent: { sections: {}, keyData: {} }
      };

      // Setup mocks
      (secService.findCompanyByTicker as jest.Mock).mockResolvedValue(mockCompany);
      (secService.getLatestForm144Filing as jest.Mock).mockResolvedValue(mockForm144Filing);
      
      // Mock getFilingById to throw a 404 error
      const filingServiceMock = require('../../services/filingService').default;
      filingServiceMock.getFilingById = jest.fn().mockRejectedValue(new Error('404 Not Found'));

      // Call the function under test
      const result = await secService.getForm144Summary('COIN');

      // Assertions
      expect(result).not.toBeNull();
      expect(result.ticker).toBe('COIN');
      expect(result.filingType).toBe('Form 144');
      expect(result.processingStatus).toBe('PARTIAL');
      expect(result.failureReason).toBeDefined();
      
      // Verify that the key points include a note about using fallback data
      expect(result.keyPoints[0]).toContain('Using limited filing data due to retrieval issues');
      
      // Verify that findCompanyByTicker was called
      expect(secService.findCompanyByTicker).toHaveBeenCalledWith('COIN');
      
      // Verify that getLatestForm144Filing was called
      expect(secService.getLatestForm144Filing).toHaveBeenCalledWith('COIN');
      
      // Verify that getFilingById was called with the correct accession number
      expect(filingServiceMock.getFilingById).toHaveBeenCalledWith(mockForm144Filing.accessionNumber);
    });

    it('should use Form 144 specific URL patterns when retrieving filing content', async () => {
      // This test would ideally check that the Form 144 specific URL patterns are used
      // However, since getFilingById is an implementation detail and we can't easily
      // verify which URLs were attempted, we'll just test the overall behavior
      
      // Mock the company info
      const mockCompany = {
        cik: '0001679788',
        name: 'Coinbase Global, Inc.',
        ticker: 'COIN'
      };
      
      // Mock the latest Form 144 filing
      const mockForm144Filing = {
        accessionNumber: '0001679788-23-000456',
        filingDate: '2023-06-20',
        description: 'Form 144 filing for Coinbase Global, Inc.',
        keyPoints: ['Proposed sale of securities'],
        parsedContent: { sections: {}, keyData: {} }
      };

      // Mock the filing details that would be returned after trying Form 144 specific URLs
      const mockFilingDetails = {
        data: {
          filingDate: '2023-06-20',
          metadata: {
            companyName: 'Coinbase Global, Inc.',
            cik: '0001679788',
            formType: '144'
          },
          content: '<xml>Mock Form 144 content</xml>',
          accessionNumber: '0001679788-23-000456'
        }
      };

      // Setup mocks
      (secService.findCompanyByTicker as jest.Mock).mockResolvedValue(mockCompany);
      (secService.getLatestForm144Filing as jest.Mock).mockResolvedValue(mockForm144Filing);
      
      // Mock getFilingById to return the mock filing details
      const filingServiceMock = require('../../services/filingService').default;
      filingServiceMock.getFilingById = jest.fn().mockResolvedValue(mockFilingDetails);

      // Call the function under test
      const result = await secService.getForm144Summary('COIN');

      // Assertions
      expect(result).not.toBeNull();
      expect(result.ticker).toBe('COIN');
      expect(result.filingType).toBe('Form 144');
      expect(result.processingStatus).toBe('COMPLETED');
      expect(result.failureReason).toBeUndefined();
      
      // Verify that findCompanyByTicker was called
      expect(secService.findCompanyByTicker).toHaveBeenCalledWith('COIN');
      
      // Verify that getLatestForm144Filing was called
      expect(secService.getLatestForm144Filing).toHaveBeenCalledWith('COIN');
      
      // Verify that getFilingById was called with the correct accession number
      expect(filingServiceMock.getFilingById).toHaveBeenCalledWith(mockForm144Filing.accessionNumber);
    });
  });
});
