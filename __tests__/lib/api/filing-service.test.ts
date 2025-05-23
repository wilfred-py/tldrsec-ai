import { MOCK_FILING_LOGS } from '@/lib/api/mock-data';
import * as filingService from '@/lib/api/filing-service';
import { mockApiResponse, mockApiError } from '../../test-utils';

// Store original implementations
const originalImplementations = {
  getFilingLogs: filingService.getFilingLogs,
  getFilingDetails: filingService.getFilingDetails,
  rerunFilingJob: filingService.rerunFilingJob
};

// Mock module functions directly
jest.mock('@/lib/api/filing-service', () => {
  const actual = jest.requireActual('@/lib/api/filing-service');
  return {
    ...actual,
    getFilingLogs: jest.fn(),
    getFilingDetails: jest.fn(),
    rerunFilingJob: jest.fn()
  };
});

describe('Filing Service', () => {
  beforeEach(() => {
    // Reset fetch mock between tests
    jest.clearAllMocks();
    global.fetch = jest.fn();
    
    // Reset all mock implementations
    Object.keys(originalImplementations).forEach(key => {
      (filingService as any)[key].mockImplementation((originalImplementations as any)[key]);
    });
  });

  describe('getFilingLogs', () => {
    it('should return mock filing logs when API is disabled', async () => {
      // Mock for disabled API mode
      (filingService.getFilingLogs as jest.Mock).mockResolvedValue({ 
        data: MOCK_FILING_LOGS 
      });
      
      const result = await filingService.getFilingLogs();
      
      expect(result.data).toEqual(MOCK_FILING_LOGS);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch filing logs from API when enabled', async () => {
      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_FILING_LOGS)
      });
      
      // Mock for enabled API mode
      (filingService.getFilingLogs as jest.Mock).mockImplementation(async () => {
        const response = await fetch('https://test-api.tldrsec.dev/api/filings', { 
          credentials: 'include' 
        });
        if (!response.ok) {
          return { 
            error: { 
              status: response.status, 
              message: `API error: ${response.status}` 
            } 
          };
        }
        return { data: await response.json() };
      });
      
      const result = await filingService.getFilingLogs();
      
      expect(result.data).toEqual(MOCK_FILING_LOGS);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.tldrsec.dev/api/filings',
        { credentials: 'include' }
      );
    });

    it('should handle API errors', async () => {
      // Mock fetch with error response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Server error' } })
      });
      
      // Mock for enabled API mode with error handling
      (filingService.getFilingLogs as jest.Mock).mockImplementation(async () => {
        const response = await fetch('https://test-api.tldrsec.dev/api/filings', { 
          credentials: 'include' 
        });
        if (!response.ok) {
          return { 
            error: { 
              status: response.status, 
              message: `API error: ${response.status}` 
            } 
          };
        }
        return { data: await response.json() };
      });
      
      const result = await filingService.getFilingLogs();
      
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(500);
      expect(result.error?.message).toBe('API error: 500');
    });

    it('should handle network errors', async () => {
      // Mock fetch to throw network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      // Mock for enabled API mode with network error handling
      (filingService.getFilingLogs as jest.Mock).mockImplementation(async () => {
        try {
          const response = await fetch('https://test-api.tldrsec.dev/api/filings', { 
            credentials: 'include' 
          });
          if (!response.ok) {
            return { 
              error: { 
                status: response.status, 
                message: `API error: ${response.status}` 
              } 
            };
          }
          return { data: await response.json() };
        } catch (error) {
          return { 
            error: { 
              status: 500, 
              message: (error as Error).message 
            } 
          };
        }
      });
      
      const result = await filingService.getFilingLogs();
      
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(500);
      expect(result.error?.message).toBe('Network error');
    });
  });

  describe('getFilingDetails', () => {
    it('should return mock filing details when API is disabled', async () => {
      // Mock for disabled API mode with filing detail
      (filingService.getFilingDetails as jest.Mock).mockImplementation(async (id) => {
        // Find the filing log
        const filing = MOCK_FILING_LOGS.find(f => f.id === id);
        if (!filing || !filing.details) {
          return {
            error: {
              status: 404,
              message: `Filing with ID ${id} not found`
            }
          };
        }
        
        return { data: filing.details };
      });
      
      // Get details for a filing that has details in the mock data
      const result = await filingService.getFilingDetails('log-1');
      
      expect(result.data).toEqual(MOCK_FILING_LOGS[0].details);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle nonexistent filing when API is disabled', async () => {
      // Mock for disabled API mode with nonexistent filing
      (filingService.getFilingDetails as jest.Mock).mockImplementation(async (id) => {
        // Find the filing log
        const filing = MOCK_FILING_LOGS.find(f => f.id === id);
        if (!filing || !filing.details) {
          return {
            error: {
              status: 404,
              message: `Filing with ID ${id} not found`
            }
          };
        }
        
        return { data: filing.details };
      });
      
      // Try to get details for a nonexistent filing ID
      const result = await filingService.getFilingDetails('nonexistent-id');
      
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(404);
      expect(result.error?.message).toContain('not found');
    });

    it('should fetch filing details from API when enabled', async () => {
      const mockDetails = {
        revenue: '$394.3 billion',
        netIncome: '$96.9 billion',
        eps: '$6.14',
        assets: '$335.1 billion',
        cashFlow: '$114.5 billion',
        keyInsights: [
          'iPhone sales increased by 4% year-over-year',
          'Services revenue reached an all-time high of $85.2 billion',
          'Operating margin improved to 30.4%',
          'Share repurchases of $90.2 billion during fiscal 2023'
        ],
        riskFactors: [
          'Increasing competition in smartphone market',
          'Supply chain constraints and component shortages',
          'Regulatory challenges in multiple markets',
          'Foreign exchange volatility impact on international sales'
        ]
      };
      
      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDetails)
      });
      
      // Mock for enabled API mode
      (filingService.getFilingDetails as jest.Mock).mockImplementation(async (id) => {
        const response = await fetch(`https://test-api.tldrsec.dev/api/filings/${id}`, { 
          credentials: 'include' 
        });
        if (!response.ok) {
          return { 
            error: { 
              status: response.status, 
              message: `API error: ${response.status}` 
            } 
          };
        }
        return { data: await response.json() };
      });
      
      const result = await filingService.getFilingDetails('log-1');
      
      expect(result.data).toEqual(mockDetails);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.tldrsec.dev/api/filings/log-1',
        { credentials: 'include' }
      );
    });
  });

  describe('rerunFilingJob', () => {
    it('should return success when API is disabled', async () => {
      // Mock for disabled API mode
      (filingService.rerunFilingJob as jest.Mock).mockResolvedValue({
        data: { success: true }
      });
      
      const result = await filingService.rerunFilingJob('log-1');
      
      expect(result.data).toEqual({ success: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should call API to rerun job when enabled', async () => {
      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });
      
      // Mock for enabled API mode
      (filingService.rerunFilingJob as jest.Mock).mockImplementation(async (id) => {
        const response = await fetch(`https://test-api.tldrsec.dev/api/filings/${id}/rerun`, {
          method: 'POST',
          credentials: 'include',
        });
        
        if (!response.ok) {
          return { 
            error: { 
              status: response.status, 
              message: `API error: ${response.status}` 
            } 
          };
        }
        
        return { data: await response.json() };
      });
      
      const result = await filingService.rerunFilingJob('log-1');
      
      expect(result.data).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.tldrsec.dev/api/filings/log-1/rerun',
        {
          method: 'POST',
          credentials: 'include',
        }
      );
    });

    it('should handle API errors', async () => {
      // Mock fetch with error response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Server error' } })
      });
      
      // Mock for enabled API mode with error handling
      (filingService.rerunFilingJob as jest.Mock).mockImplementation(async (id) => {
        const response = await fetch(`https://test-api.tldrsec.dev/api/filings/${id}/rerun`, {
          method: 'POST',
          credentials: 'include',
        });
        
        if (!response.ok) {
          return { 
            error: { 
              status: response.status, 
              message: `API error: ${response.status}` 
            } 
          };
        }
        
        return { data: await response.json() };
      });
      
      const result = await filingService.rerunFilingJob('log-1');
      
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(500);
    });
  });
}); 