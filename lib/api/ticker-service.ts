import { Company, TickerSearchResult, ApiResponse, FilingPreferences } from './types';
import { MOCK_COMPANIES, AVAILABLE_TICKERS } from './mock-data';

// Environment check for API vs mock mode
const API_ENABLED = process.env.NEXT_PUBLIC_API_ENABLED === 'true';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.tldrsec.dev';

// Helper function to simulate API latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get all tracked companies for the current user
 */
export async function getTrackedCompanies(): Promise<ApiResponse<Company[]>> {
  try {
    if (API_ENABLED) {
      // Real API call
      const response = await fetch(`${API_BASE_URL}/api/companies`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      return { data };
    } else {
      // Mock data with simulated delay
      await delay(800);
      return { data: MOCK_COMPANIES };
    }
  } catch (error) {
    console.error('Error fetching tracked companies:', error);
    return { 
      error: { 
        status: 500, 
        message: error instanceof Error ? error.message : 'Unknown error fetching companies' 
      } 
    };
  }
}

/**
 * Search for companies by name or ticker symbol
 */
export async function searchCompanies(query: string): Promise<ApiResponse<TickerSearchResult[]>> {
  try {
    if (API_ENABLED && query.length > 0) {
      // Real API call
      const response = await fetch(`${API_BASE_URL}/api/companies/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      return { data };
    } else {
      // Mock search using local data
      await delay(400);
      
      if (query.length < 2) {
        return { data: [] };
      }
      
      const results = AVAILABLE_TICKERS.filter(ticker => 
        ticker.symbol.toLowerCase().includes(query.toLowerCase()) || 
        ticker.name.toLowerCase().includes(query.toLowerCase())
      );
      
      return { data: results };
    }
  } catch (error) {
    console.error('Error searching companies:', error);
    return { 
      error: { 
        status: 500, 
        message: error instanceof Error ? error.message : 'Unknown error searching companies' 
      } 
    };
  }
}

/**
 * Add a company to the user's tracked list
 */
export async function addTrackedCompany(symbol: string, name: string): Promise<ApiResponse<Company>> {
  try {
    if (API_ENABLED) {
      // Real API call
      const response = await fetch(`${API_BASE_URL}/api/companies`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol, name }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      return { data };
    } else {
      // Mock addition with default preferences
      await delay(600);
      
      // Check if company already exists in mock data
      const exists = MOCK_COMPANIES.some(company => company.symbol === symbol);
      if (exists) {
        return { 
          error: { 
            status: 409, 
            message: `Company ${symbol} is already being tracked` 
          } 
        };
      }
      
      const newCompany: Company = {
        id: `mock-${Date.now()}`,
        symbol,
        name,
        lastFiling: "—",
        preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
      };
      
      // In a real app, we would update the database
      // For mock, we return the new company but don't actually modify MOCK_COMPANIES
      return { data: newCompany };
    }
  } catch (error) {
    console.error('Error adding company:', error);
    return { 
      error: { 
        status: 500, 
        message: error instanceof Error ? error.message : 'Unknown error adding company' 
      } 
    };
  }
}

/**
 * Delete a company from the user's tracked list
 */
export async function deleteTrackedCompany(companyId: string): Promise<ApiResponse<{ success: boolean }>> {
  try {
    if (API_ENABLED) {
      // Real API call
      const response = await fetch(`${API_BASE_URL}/api/companies/${companyId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return { data: { success: true } };
    } else {
      // Mock deletion
      await delay(500);
      
      // In a real app, we would update the database
      return { data: { success: true } };
    }
  } catch (error) {
    console.error('Error deleting company:', error);
    return { 
      error: { 
        status: 500, 
        message: error instanceof Error ? error.message : 'Unknown error deleting company' 
      } 
    };
  }
}

/**
 * Update filing preferences for a tracked company
 */
export async function updateCompanyPreferences(
  companyId: string, 
  preferences: FilingPreferences
): Promise<ApiResponse<Company>> {
  try {
    if (API_ENABLED) {
      // Real API call
      const response = await fetch(`${API_BASE_URL}/api/companies/${companyId}/preferences`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      return { data };
    } else {
      // Mock update
      await delay(700);
      
      // Find the company in the mock data
      const company = MOCK_COMPANIES.find(c => c.id === companyId);
      if (!company) {
        return { 
          error: { 
            status: 404, 
            message: `Company with ID ${companyId} not found` 
          } 
        };
      }
      
      // Create an updated company object
      const updatedCompany: Company = {
        ...company,
        preferences,
      };
      
      // In a real app, we would update the database
      return { data: updatedCompany };
    }
  } catch (error) {
    console.error('Error updating company preferences:', error);
    return { 
      error: { 
        status: 500, 
        message: error instanceof Error ? error.message : 'Unknown error updating preferences' 
      } 
    };
  }
} 