import { Company, TickerSearchResult, ApiResponse, FilingPreferences } from './types';
import { MOCK_COMPANIES, AVAILABLE_TICKERS } from './mock-data';
// import { prisma } from '@/lib/db/prisma'; // Currently unused

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
      // For development, try to get real user tickers from database
      try {
        // Instead of using Clerk's server components, make a client-side API call
        // to our own endpoint that will handle the auth check server-side
        const userResponse = await fetch('/api/user/tickers', {
          credentials: 'include',
        });
        
        if (!userResponse.ok) {
          console.log('No user data found, returning empty array');
          // Return empty array instead of mock data to show empty state
          return { data: [] };
        }
        
        const userData = await userResponse.json();
        
        if (!userData || !userData.tickers || userData.tickers.length === 0) {
          console.log('No tickers found for user, returning empty array');
          // Return empty array instead of mock data to show empty state
          return { data: [] };
        }
        
        // Convert API tickers to Company format
        const userCompanies: Company[] = userData.tickers.map((ticker: Record<string, unknown>) => {
          // Use stored preferences or default values
          const storedPrefs = ticker.preferences as Record<string, boolean> | null;
          return {
            id: ticker.id,
            symbol: ticker.symbol,
            companyName: ticker.companyName,
            name: ticker.companyName,
            lastFiling: "—", // No filing data in local DB
            lastFilingDate: ticker.lastFilingDate || null,
            summaryCount: ticker.summaryCount || 0,
            preferences: storedPrefs || { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
          };
        });
        
        console.log(`Found ${userCompanies.length} tickers for user`);
        
        // Fetch the last filing date for each ticker
        try {
          const filingsResponse = await fetch('/api/filings/latest', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              tickers: userCompanies.map(company => company.symbol)
            })
          });
          
          if (filingsResponse.ok) {
            const filingsData = await filingsResponse.json();
            
            // Update companies with last filing dates
            if (filingsData.filings) {
              userCompanies.forEach(company => {
                const filingInfo = filingsData.filings.find((f: Record<string, unknown>) => f.ticker === company.symbol);
                if (filingInfo) {
                  company.lastFilingDate = filingInfo.filingDate;
                  company.lastFiling = filingInfo.formType || "—";
                }
              });
            }
          }
        } catch (filingError) {
          console.error('Error fetching latest filings:', filingError);
          // Continue without filing dates if there's an error
        }
        
        return { data: userCompanies };
      } catch (apiError) {
        console.error('Could not fetch from API, returning empty array:', apiError);
        // Return empty array instead of mock data to show empty state
        return { data: [] };
      }
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
      // Use our internal API instead of mock data
      try {
        // We're not doing a check here since the API route already handles checking
        // for existing tickers and either returns them or creates new ones
        const response = await fetch('/api/user/tickers', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ symbol, companyName: name }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // If the ticker was already being tracked, data is still returned, so we 
        // should adjust the return value to avoid confusing the user
        return { 
          data,
          // Note that we're not setting an error here because the API already 
          // returns the existing ticker if it exists
         };
      } catch (apiError) {
        console.error('Error adding ticker:', apiError);
        return { 
          error: { 
            status: 500, 
            message: apiError instanceof Error ? apiError.message : 'Unknown error adding ticker'
          } 
        };
      }
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
      // Use our internal API instead of mock data
      try {
        const response = await fetch(`/api/user/tickers/${companyId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API error: ${response.status}`);
        }
        
        const data = await response.json();
        return { data };
      } catch (apiError) {
        console.error('Error deleting ticker:', apiError);
        return { 
          error: { 
            status: 500, 
            message: apiError instanceof Error ? apiError.message : 'Unknown error deleting ticker'
          } 
        };
      }
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
  preferences: Partial<FilingPreferences>
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
        body: JSON.stringify({ preferences }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return { data };
    } else {
      // Use our internal API to persist preferences
      try {
        const response = await fetch(`/api/user/tickers/${companyId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ preferences }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const data = await response.json();
        return { data: data.ticker };
      } catch (apiError) {
        console.error('Error updating preferences:', apiError);
        return {
          error: {
            status: 500,
            message: apiError instanceof Error ? apiError.message : 'Unknown error updating preferences'
          }
        };
      }
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