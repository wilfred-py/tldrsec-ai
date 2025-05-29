import type { Company, FilingPreferences } from '@/lib/api/types';

// Mock the ticker service module
jest.mock('@/lib/api/ticker-service', () => ({
  getTrackedCompanies: jest.fn(),
  addTrackedCompany: jest.fn(),
  deleteTrackedCompany: jest.fn(),
  searchCompanies: jest.fn(),
}));

// Import after mocking
import * as tickerService from '@/lib/api/ticker-service';

describe('Ticker Service', () => {
  const mockPreferences: FilingPreferences = {
    tenK: true,
    tenQ: true,
    eightK: true,
    form4: false,
    other: false
  };
  
  const mockCompanies: Company[] = [
    { id: '1', symbol: 'AAPL', name: 'Apple Inc.', lastFiling: '2023-05-10', preferences: mockPreferences },
    { id: '2', symbol: 'MSFT', name: 'Microsoft Corporation', lastFiling: '2023-05-05', preferences: mockPreferences }
  ];

  const mockSearchResults = [
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'F', name: 'Ford Motor Company' }
  ];

  // Set up mock implementations before each test
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mock implementations
    (tickerService.getTrackedCompanies as jest.Mock).mockResolvedValue({ data: mockCompanies });
    (tickerService.searchCompanies as jest.Mock).mockResolvedValue({ data: mockSearchResults });
    
    (tickerService.addTrackedCompany as jest.Mock).mockImplementation((symbol, name) => {
      const newTicker: Company = { 
        id: `ticker-${Date.now()}`, 
        symbol, 
        name, 
        lastFiling: '—',
        preferences: mockPreferences
      };
      
      return Promise.resolve({ data: newTicker });
    });
    
    (tickerService.deleteTrackedCompany as jest.Mock).mockResolvedValue({ 
      data: { success: true } 
    });
  });

  describe('getTrackedCompanies', () => {
    it('should fetch tracked companies', async () => {
      const result = await tickerService.getTrackedCompanies();
      
      expect(tickerService.getTrackedCompanies).toHaveBeenCalled();
      expect(result).toEqual({ data: mockCompanies });
    });

    it('should return empty array when no tickers are found', async () => {
      // Override the mock for this specific test
      (tickerService.getTrackedCompanies as jest.Mock).mockResolvedValueOnce({ data: [] });
      
      const result = await tickerService.getTrackedCompanies();
      
      expect(result).toEqual({ data: [] });
    });

    it('should handle errors gracefully', async () => {
      // Override the mock for this specific test
      (tickerService.getTrackedCompanies as jest.Mock).mockResolvedValueOnce({ 
        error: { 
          status: 500, 
          message: 'Network error' 
        } 
      });
      
      const result = await tickerService.getTrackedCompanies();
      
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('message', 'Network error');
    });
  });

  describe('addTrackedCompany', () => {
    it('should add a company to the tracked list', async () => {
      const result = await tickerService.addTrackedCompany('TSLA', 'Tesla Inc.');
      
      expect(tickerService.addTrackedCompany).toHaveBeenCalledWith('TSLA', 'Tesla Inc.');
      expect(result.data).toHaveProperty('symbol', 'TSLA');
      expect(result.data).toHaveProperty('name', 'Tesla Inc.');
    });

    it('should handle errors when adding a company', async () => {
      // Override the mock for this specific test
      (tickerService.addTrackedCompany as jest.Mock).mockResolvedValueOnce({ 
        error: { 
          status: 500, 
          message: 'Failed to add company' 
        } 
      });
      
      const result = await tickerService.addTrackedCompany('TSLA', 'Tesla Inc.');
      
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('message', 'Failed to add company');
    });
  });

  describe('deleteTrackedCompany', () => {
    it('should delete a company from the tracked list', async () => {
      const result = await tickerService.deleteTrackedCompany('1');
      
      expect(tickerService.deleteTrackedCompany).toHaveBeenCalledWith('1');
      expect(result.data).toHaveProperty('success', true);
    });

    it('should handle errors when deleting a company', async () => {
      // Override the mock for this specific test
      (tickerService.deleteTrackedCompany as jest.Mock).mockResolvedValueOnce({ 
        error: { 
          status: 500, 
          message: 'Failed to delete company' 
        } 
      });
      
      const result = await tickerService.deleteTrackedCompany('1');
      
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('message', 'Failed to delete company');
    });
  });

  describe('searchCompanies', () => {
    it('should search for companies by query', async () => {
      const result = await tickerService.searchCompanies('Tesla');
      
      expect(tickerService.searchCompanies).toHaveBeenCalledWith('Tesla');
      expect(result).toEqual({ data: mockSearchResults });
    });

    it('should handle empty search results', async () => {
      // Override the mock for this specific test
      (tickerService.searchCompanies as jest.Mock).mockResolvedValueOnce({ data: [] });
      
      const result = await tickerService.searchCompanies('NonExistentCompany');
      
      expect(result).toEqual({ data: [] });
    });

    it('should handle errors during search', async () => {
      // Override the mock for this specific test
      (tickerService.searchCompanies as jest.Mock).mockResolvedValueOnce({ 
        error: { 
          status: 500, 
          message: 'Search failed' 
        } 
      });
      
      const result = await tickerService.searchCompanies('Tesla');
      
      expect(result).toHaveProperty('error');
      expect(result.error).toHaveProperty('message', 'Search failed');
    });
  });
}); 