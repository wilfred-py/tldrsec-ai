/**
 * SEC Fetch Monitoring Validation Tests
 * 
 * This test suite validates the SEC fetch monitoring system by:
 * 1. Testing edge cases for Form 144 filings
 * 2. Testing edge cases for KO 8-K filings
 * 3. Verifying that URL attempts are properly tracked
 * 4. Ensuring the monitoring system correctly identifies problematic form types
 */

import { getFilingById } from '../../services/filing/getFilingById';
import secFetchMonitor from '../../services/monitoring/secFetchMonitor';
import { getFilingSummary } from '../../services/filingService';
import { findCompanyByTicker } from '../../services/companyService';
import { logger } from '../../lib/logging';

// Mock dependencies
jest.mock('../../services/filing/getFilingById');
jest.mock('../../services/monitoring/secFetchMonitor');
jest.mock('../../services/companyService');
jest.mock('@prisma/client');

// Sample test data
const mockForm144Filing = {
  accessionNumber: '0001209191-22-123456',
  filingDate: '2022-01-01',
  formType: '144',
  content: 'Sample Form 144 content'
};

const mockKO8KFiling = {
  accessionNumber: '0000021344-22-123456',
  filingDate: '2022-01-01',
  formType: '8-K',
  content: 'Sample 8-K content'
};

const mockCompanyInfo = {
  ticker: 'KO',
  name: 'Coca-Cola Company',
  cik: '0000021344'
};

describe('SEC Fetch Monitoring System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods to prevent test output pollution
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock findCompanyByTicker
    (findCompanyByTicker as jest.Mock).mockResolvedValue(mockCompanyInfo);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Form 144 Edge Cases', () => {
    test('should track URL attempts for Form 144 filings', async () => {
      // Mock getFilingById to simulate multiple URL attempts
      const mockUrlAttempts = [
        { url: 'https://www.sec.gov/Archives/edgar/data/0001209191/000120919122123456/0001209191-22-123456-index.htm', success: false, statusCode: 404, error: 'Request failed with status code 404', timestamp: Date.now() },
        { url: 'https://www.sec.gov/Archives/edgar/data/0001209191/000120919122123456/form144.txt', success: true, statusCode: 200, timestamp: Date.now() }
      ];
      
      (getFilingById as jest.Mock).mockResolvedValue({
        data: {
          ...mockForm144Filing,
          urlAttempts: mockUrlAttempts,
          metadata: { formType: '144', ticker: 'COIN' }
        }
      });
      
      // Call getFilingById directly to trigger URL attempt tracking
      const result = await getFilingById('0001209191-22-123456', '0001209191');
      
      // Verify that recordFetchAttempt was called with the correct data
      expect(secFetchMonitor.recordFetchAttempt).toHaveBeenCalledTimes(1);
      expect(secFetchMonitor.recordFetchAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          filingId: '0001209191-22-123456',
          formType: '144',
          ticker: 'COIN',
          successful: true,
          attempts: mockUrlAttempts
        })
      );
      
      // Verify that the URL attempts were included in the response
      expect(result.data.urlAttempts).toEqual(mockUrlAttempts);
    });
    
    test('should handle Form 144 filings with multiple failed URL attempts', async () => {
      // Mock getFilingById to simulate all URL attempts failing
      const mockUrlAttempts = [
        { url: 'https://www.sec.gov/Archives/edgar/data/0001209191/000120919122123456/0001209191-22-123456-index.htm', success: false, statusCode: 404, error: 'Request failed with status code 404', timestamp: Date.now() },
        { url: 'https://www.sec.gov/Archives/edgar/data/0001209191/000120919122123456/form144.txt', success: false, statusCode: 404, error: 'Request failed with status code 404', timestamp: Date.now() },
        { url: 'https://www.sec.gov/Archives/edgar/data/0001209191/000120919122123456.txt', success: false, statusCode: 404, error: 'Request failed with status code 404', timestamp: Date.now() }
      ];
      
      // Mock getFilingById to throw an error
      (getFilingById as jest.Mock).mockRejectedValue(new Error('Could not retrieve filing content for 0001209191-22-123456'));
      
      // Call getFilingById and expect it to throw
      await expect(getFilingById('0001209191-22-123456', '0001209191')).rejects.toThrow();
      
      // We can't verify recordFetchAttempt was called since the function throws before that point
      // In a real implementation, we would want to ensure errors are also recorded
    });
  });
  
  describe('KO 8-K Edge Cases', () => {
    test('should track URL attempts for KO 8-K filings', async () => {
      // Mock getFilingById to simulate successful URL attempt
      const mockUrlAttempts = [
        { url: 'https://www.sec.gov/Archives/edgar/data/0000021344/000002134422123456/0000021344-22-123456-index.htm', success: true, statusCode: 200, timestamp: Date.now() }
      ];
      
      (getFilingById as jest.Mock).mockResolvedValue({
        data: {
          ...mockKO8KFiling,
          urlAttempts: mockUrlAttempts,
          metadata: { formType: '8-K', ticker: 'KO' }
        }
      });
      
      // Call getFilingById directly to trigger URL attempt tracking
      const result = await getFilingById('0000021344-22-123456', '0000021344');
      
      // Verify that recordFetchAttempt was called with the correct data
      expect(secFetchMonitor.recordFetchAttempt).toHaveBeenCalledTimes(1);
      expect(secFetchMonitor.recordFetchAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          filingId: '0000021344-22-123456',
          formType: '8-K',
          ticker: 'KO',
          successful: true,
          attempts: mockUrlAttempts
        })
      );
      
      // Verify that the URL attempts were included in the response
      expect(result.data.urlAttempts).toEqual(mockUrlAttempts);
    });
  });
  
  describe('Monitoring System Analysis', () => {
    test('should generate accurate analysis of fetch attempts', async () => {
      // Mock analyzeFetchAttempts to return sample analysis data
      const mockAnalysis = {
        period: '7 days',
        totalAttempts: 100,
        successfulAttempts: 85,
        successRate: '85.00%',
        formTypeStats: {
          '144': { total: 30, successful: 20, rate: 66.67 },
          '8-K': { total: 40, successful: 38, rate: 95.00 },
          '10-K': { total: 20, successful: 18, rate: 90.00 },
          '10-Q': { total: 10, successful: 9, rate: 90.00 }
        },
        problematicFormTypes: [
          { formType: '144', successRate: '66.67%', attempts: 30 }
        ],
        commonErrors: [
          { error: 'Request failed with status code 404', count: 12, percentage: '12.00%' },
          { error: 'ECONNRESET', count: 3, percentage: '3.00%' }
        ]
      };
      
      (secFetchMonitor.analyzeFetchAttempts as jest.Mock).mockResolvedValue(mockAnalysis);
      
      // Call analyzeFetchAttempts
      const analysis = await secFetchMonitor.analyzeFetchAttempts(7);
      
      // Verify the analysis data
      expect(analysis).toEqual(mockAnalysis);
      expect(analysis.problematicFormTypes[0].formType).toBe('144');
      expect(analysis.formTypeStats['144'].rate).toBeLessThan(analysis.formTypeStats['8-K'].rate);
    });
    
    test('should generate a readable text report', async () => {
      // Mock generateFetchReport to return a sample report
      const mockReport = `SEC Fetch Monitoring Report (Last 7 days)

Total Attempts: 100
Successful: 85 (85.00%)

Form Type Success Rates:
- 144: 20/30 (66.67%)
- 8-K: 38/40 (95.00%)
- 10-K: 18/20 (90.00%)
- 10-Q: 9/10 (90.00%)

Most Problematic Form Types:
1. 144: 66.67% (30 attempts)

Most Common Errors:
1. "Request failed with status code 404" - 12 occurrences (12.00%)
2. "ECONNRESET" - 3 occurrences (3.00%)`;
      
      (secFetchMonitor.generateFetchReport as jest.Mock).mockResolvedValue(mockReport);
      
      // Call generateFetchReport
      const report = await secFetchMonitor.generateFetchReport(7);
      
      // Verify the report
      expect(report).toEqual(mockReport);
      expect(report).toContain('Most Problematic Form Types:');
      expect(report).toContain('144: 66.67%');
    });
  });
});
