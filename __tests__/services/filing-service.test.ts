import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import filingService from '../../services/filingService';
import { FilingType } from '../../lib/sec-edgar/types';
import * as secService from '../../services/secService';

// Mock the dependencies
jest.mock('../../services/secService', () => ({
  secService: {
    getForm144Summary: jest.fn(),
    findCompanyByTicker: jest.fn(),
    getLatestFilingByFormType: jest.fn(),
    getFilingDetails: jest.fn(),
    getLatestFilings: jest.fn(),
  }
}));

// Mock the ResendClient module
jest.mock('../../lib/email/resend-client', () => {
  return {
    ResendClient: jest.fn().mockImplementation(() => {
      return {
        sendEmail: jest.fn().mockImplementation(() => {
          return Promise.resolve({
            success: true,
            id: 'mock-email-id',
            to: 'test@example.com'
          });
        })
      };
    })
  };
});

describe('filingService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEmailSummary', () => {
    it('should get the latest filings for each ticker', async () => {
      // Mock the getLatestFilings function to return filings
      const mockFilings = [
        { 
          accessionNumber: 'mock-accession-1', 
          filingDate: '2025-05-30', 
          form: '8-K',
          primaryDocument: 'primary.htm',
          primaryDocUrl: 'https://example.com/primary',
          filingUrl: 'https://example.com/filing'
        },
        { 
          accessionNumber: 'mock-accession-2', 
          filingDate: '2025-05-29', 
          form: '10-Q',
          primaryDocument: 'primary.htm',
          primaryDocUrl: 'https://example.com/primary',
          filingUrl: 'https://example.com/filing'
        }
      ];
      
      jest.spyOn(secService, 'getLatestFilings').mockResolvedValue(mockFilings);
      
      // Mock the getFilingSummary function to return data for the first filing type
      const getFilingSummaryMock = jest.spyOn(filingService, 'getFilingSummary')
        .mockImplementation(async (ticker: string, formType: FilingType) => {
          return {
            data: {
              ticker,
              companyName: `${ticker} Inc.`,
              filingType: formType,
              filingDate: '2025-05-30',
              accessionNumber: 'mock-accession',
              summaryText: `Mock summary for ${formType}`,
              keyPoints: ['Key point 1', 'Key point 2'],
              filingUrl: 'https://example.com/filing',
              parsedContent: {
                title: `${formType} Filing`,
                content: 'Mock content',
                sections: { 'section1': 'Mock section content' },
                keyData: { 'key1': 'value1' },
                metadata: {}
              },
              rawData: {}
            }
          };
        });

      // Call the function
      const result = await filingService.sendEmailSummary('test@example.com', ['AAPL', 'MSFT']);

      // Verify results
      expect(result.success).toBe(true);
      expect(result.summaries?.length).toBe(2); // One for each ticker
      
      // Verify that it got the latest filings and tried to get a summary
      expect(secService.getLatestFilings).toHaveBeenCalledWith('AAPL', 3);
      expect(secService.getLatestFilings).toHaveBeenCalledWith('MSFT', 3);
      expect(getFilingSummaryMock).toHaveBeenCalledWith('AAPL', '8-K');
      expect(getFilingSummaryMock).toHaveBeenCalledWith('MSFT', '8-K');
    });

    it('should handle errors and continue with other tickers', async () => {
      // Mock getLatestFilings to throw an error for one ticker
      jest.spyOn(secService, 'getLatestFilings')
        .mockImplementation(async (ticker: string) => {
          if (ticker === 'AAPL') {
            throw new Error('Test error for AAPL');
          }
          
          // Return filings for other tickers
          return [
            { 
              accessionNumber: 'mock-accession-1', 
              filingDate: '2025-05-30', 
              form: '8-K',
              primaryDocument: 'primary.htm',
              primaryDocUrl: 'https://example.com/primary',
              filingUrl: 'https://example.com/filing'
            }
          ];
        });

      // Mock getFilingSummary to return data
      jest.spyOn(filingService, 'getFilingSummary')
        .mockImplementation(async (ticker: string, formType: FilingType) => {
          return {
            data: {
              ticker,
              companyName: `${ticker} Inc.`,
              filingType: formType,
              filingDate: '2025-05-30',
              accessionNumber: 'mock-accession',
              summaryText: 'Mock summary',
              keyPoints: ['Key point 1', 'Key point 2'],
              filingUrl: 'https://example.com/filing',
              parsedContent: {
                title: `${formType} Filing`,
                content: 'Mock content',
                sections: { 'section1': 'Mock section content' },
                keyData: { 'key1': 'value1' },
                metadata: {}
              },
              rawData: {}
            }
          };
        });

      // Call the function
      const result = await filingService.sendEmailSummary('test@example.com', ['AAPL', 'MSFT']);

      // Verify results
      expect(result.success).toBe(true);
      expect(result.summaries?.length).toBe(1); // Only MSFT should succeed
      expect(result.errors?.length).toBe(1); // AAPL should be in errors
      expect(result.errors?.[0].ticker).toBe('AAPL');
    });

    it('should throw an error if no summaries could be generated', async () => {
      // Mock getLatestFilings to return empty array
      jest.spyOn(secService, 'getLatestFilings').mockResolvedValue([]);

      // Call the function and expect it to return an error
      const result = await filingService.sendEmailSummary('test@example.com', ['AAPL']);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No filing summaries could be generated');
    });
  });
});
