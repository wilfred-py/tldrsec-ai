import { MOCK_COMPANIES, AVAILABLE_TICKERS } from '@/lib/api/mock-data';
import * as tickerService from '@/lib/api/ticker-service';
import { mockApiResponse, mockApiError } from '../../test-utils';

// Store original implementations
const originalImplementations = {
  getTrackedCompanies: tickerService.getTrackedCompanies,
  searchCompanies: tickerService.searchCompanies,
  addTrackedCompany: tickerService.addTrackedCompany,
  deleteTrackedCompany: tickerService.deleteTrackedCompany,
  updateCompanyPreferences: tickerService.updateCompanyPreferences
};

// Mock module functions directly
jest.mock('@/lib/api/ticker-service', () => {
  const actual = jest.requireActual('@/lib/api/ticker-service');
  return {
    ...actual,
    getTrackedCompanies: jest.fn(),
    searchCompanies: jest.fn(),
    addTrackedCompany: jest.fn(),
    deleteTrackedCompany: jest.fn(),
    updateCompanyPreferences: jest.fn()
  };
});

describe('Ticker Service', () => {
  beforeEach(() => {
    // Reset fetch mock between tests
    jest.clearAllMocks();
    global.fetch = jest.fn();
    
    // Reset all mock implementations
    Object.keys(originalImplementations).forEach(key => {
      (tickerService as any)[key].mockImplementation((originalImplementations as any)[key]);
    });
  });

  describe('getTrackedCompanies', () => {
    it('should return mock companies when API is disabled', async () => {
      // Mock for disabled API mode
      (tickerService.getTrackedCompanies as jest.Mock).mockResolvedValue({ 
        data: MOCK_COMPANIES 
      });
      
      const result = await tickerService.getTrackedCompanies();
      
      expect(result.data).toEqual(MOCK_COMPANIES);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch companies from API when enabled', async () => {
      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_COMPANIES)
      });
      
      // Mock for enabled API mode
      (tickerService.getTrackedCompanies as jest.Mock).mockImplementation(async () => {
        const response = await fetch('https://test-api.tldrsec.dev/api/companies', { 
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
      
      const result = await tickerService.getTrackedCompanies();
      
      expect(result.data).toEqual(MOCK_COMPANIES);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.tldrsec.dev/api/companies',
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
      (tickerService.getTrackedCompanies as jest.Mock).mockImplementation(async () => {
        const response = await fetch('https://test-api.tldrsec.dev/api/companies', { 
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
      
      const result = await tickerService.getTrackedCompanies();
      
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(500);
      expect(result.error?.message).toBe('API error: 500');
    });

    it('should handle network errors', async () => {
      // Mock fetch to throw network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      // Mock for enabled API mode with network error handling
      (tickerService.getTrackedCompanies as jest.Mock).mockImplementation(async () => {
        try {
          const response = await fetch('https://test-api.tldrsec.dev/api/companies', { 
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
      
      const result = await tickerService.getTrackedCompanies();
      
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(500);
      expect(result.error?.message).toBe('Network error');
    });
  });

  describe('searchCompanies', () => {
    it('should return empty array for short queries when API is disabled', async () => {
      // Mock for disabled API mode with short query
      (tickerService.searchCompanies as jest.Mock).mockResolvedValue({ data: [] });
      
      const result = await tickerService.searchCompanies('a');
      
      expect(result.data).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should filter mock tickers when API is disabled', async () => {
      // Mock for disabled API with filtering logic
      (tickerService.searchCompanies as jest.Mock).mockImplementation(async (query) => {
        const filteredResults = AVAILABLE_TICKERS.filter(t => 
          t.name.toLowerCase().includes(query.toLowerCase()) || 
          t.symbol.toLowerCase().includes(query.toLowerCase())
        );
        return { data: filteredResults };
      });
      
      const result = await tickerService.searchCompanies('apple');
      
      expect(result.data).toEqual(
        AVAILABLE_TICKERS.filter(t => 
          t.name.toLowerCase().includes('apple') || 
          t.symbol.toLowerCase().includes('apple')
        )
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch search results from API when enabled', async () => {
      const mockResults = [
        { symbol: 'AAPL', name: 'Apple Inc.' }
      ];
      
      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResults)
      });
      
      // Mock for enabled API mode
      (tickerService.searchCompanies as jest.Mock).mockImplementation(async (query) => {
        const response = await fetch(`https://test-api.tldrsec.dev/api/companies/search?q=${query}`, { 
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
      
      const result = await tickerService.searchCompanies('apple');
      
      expect(result.data).toEqual(mockResults);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.tldrsec.dev/api/companies/search?q=apple',
        { credentials: 'include' }
      );
    });
  });

  describe('addTrackedCompany', () => {
    it('should handle duplicate company check when API is disabled', async () => {
      // Mock for disabled API with duplicate handling
      (tickerService.addTrackedCompany as jest.Mock).mockImplementation(async (symbol, name) => {
        // Check if company already exists in MOCK_COMPANIES
        if (MOCK_COMPANIES.some(c => c.symbol === symbol)) {
          return {
            error: {
              status: 409,
              message: `Company ${symbol} is already being tracked`
            }
          };
        }
        
        // Return new company
        return { data: {} };
      });
      
      // Try to add a company that exists in MOCK_COMPANIES
      const result = await tickerService.addTrackedCompany('AAPL', 'Apple Inc.');
      
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(409);
      expect(result.error?.message).toContain('already being tracked');
    });

    it('should add new company when API is disabled', async () => {
      // Mock for disabled API with new company creation
      (tickerService.addTrackedCompany as jest.Mock).mockImplementation(async (symbol, name) => {
        // Check if company already exists in MOCK_COMPANIES
        if (MOCK_COMPANIES.some(c => c.symbol === symbol)) {
          return {
            error: {
              status: 409,
              message: `Company ${symbol} is already being tracked`
            }
          };
        }
        
        // Add new company
        const newCompany = {
          id: `mock-${Date.now()}`,
          symbol,
          name,
          lastFiling: '—',
          preferences: {
            tenK: true, tenQ: true, eightK: true, form4: false, other: false
          }
        };
        
        return { data: newCompany };
      });
      
      // Add a company that doesn't exist in MOCK_COMPANIES
      const result = await tickerService.addTrackedCompany('NEW', 'New Company');
      
      expect(result.data).toBeDefined();
      expect(result.data?.symbol).toBe('NEW');
      expect(result.data?.name).toBe('New Company');
      expect(result.data?.preferences).toEqual({
        tenK: true, tenQ: true, eightK: true, form4: false, other: false
      });
    });

    it('should call API to add company when enabled', async () => {
      const newCompany = {
        id: '999',
        symbol: 'NEW',
        name: 'New Company',
        lastFiling: '—',
        preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
      };
      
      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(newCompany)
      });
      
      // Mock for enabled API mode
      (tickerService.addTrackedCompany as jest.Mock).mockImplementation(async (symbol, name) => {
        const response = await fetch('https://test-api.tldrsec.dev/api/companies', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ symbol, name }),
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
      
      const result = await tickerService.addTrackedCompany('NEW', 'New Company');
      
      expect(result.data).toEqual(newCompany);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.tldrsec.dev/api/companies',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ symbol: 'NEW', name: 'New Company' }),
        }
      );
    });
  });

  describe('deleteTrackedCompany', () => {
    it('should return success when API is disabled', async () => {
      // Mock for disabled API with successful deletion
      (tickerService.deleteTrackedCompany as jest.Mock).mockResolvedValue({
        data: { success: true }
      });
      
      const result = await tickerService.deleteTrackedCompany('1');
      
      expect(result.data).toEqual({ success: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should call API to delete company when enabled', async () => {
      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });
      
      // Mock for enabled API mode
      (tickerService.deleteTrackedCompany as jest.Mock).mockImplementation(async (id) => {
        const response = await fetch(`https://test-api.tldrsec.dev/api/companies/${id}`, {
          method: 'DELETE',
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
      
      const result = await tickerService.deleteTrackedCompany('1');
      
      expect(result.data).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.tldrsec.dev/api/companies/1',
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );
    });
  });

  describe('updateCompanyPreferences', () => {
    const preferences = { 
      tenK: true, 
      tenQ: false, 
      eightK: true, 
      form4: false, 
      other: true 
    };

    it('should handle nonexistent company when API is disabled', async () => {
      // Mock for disabled API with nonexistent company
      (tickerService.updateCompanyPreferences as jest.Mock).mockImplementation(async (id, prefs) => {
        // Check if company exists
        const company = MOCK_COMPANIES.find(c => c.id === id);
        if (!company) {
          return {
            error: {
              status: 404,
              message: `Company with ID ${id} not found`
            }
          };
        }
        
        return { data: {} };
      });
      
      const result = await tickerService.updateCompanyPreferences('999', preferences);
      
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(404);
      expect(result.error?.message).toContain('not found');
    });

    it('should update mock company preferences when API is disabled', async () => {
      // Mock for disabled API with successful update
      (tickerService.updateCompanyPreferences as jest.Mock).mockImplementation(async (id, prefs) => {
        // Check if company exists
        const company = MOCK_COMPANIES.find(c => c.id === id);
        if (!company) {
          return {
            error: {
              status: 404,
              message: `Company with ID ${id} not found`
            }
          };
        }
        
        // Update company preferences
        const updatedCompany = {
          ...company,
          preferences: prefs
        };
        
        return { data: updatedCompany };
      });
      
      const existingCompanyId = '1'; // ID from MOCK_COMPANIES
      const result = await tickerService.updateCompanyPreferences(existingCompanyId, preferences);
      
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(existingCompanyId);
      expect(result.data?.preferences).toEqual(preferences);
    });

    it('should call API to update preferences when enabled', async () => {
      const updatedCompany = {
        ...MOCK_COMPANIES[0],
        preferences
      };
      
      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedCompany)
      });
      
      // Mock for enabled API mode
      (tickerService.updateCompanyPreferences as jest.Mock).mockImplementation(async (id, prefs) => {
        const response = await fetch(`https://test-api.tldrsec.dev/api/companies/${id}/preferences`, {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(prefs),
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
      
      const result = await tickerService.updateCompanyPreferences('1', preferences);
      
      expect(result.data).toEqual(updatedCompany);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-api.tldrsec.dev/api/companies/1/preferences',
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(preferences),
        }
      );
    });
  });
}); 