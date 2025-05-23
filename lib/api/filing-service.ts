import { FilingLog, ApiResponse, FilingDetails } from './types';
import { MOCK_FILING_LOGS } from './mock-data';

// Environment check for API vs mock mode
const API_ENABLED = process.env.NEXT_PUBLIC_API_ENABLED === 'true';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.tldrsec.dev';

// Helper function to simulate API latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get all filing logs for the current user
 */
export async function getFilingLogs(): Promise<ApiResponse<FilingLog[]>> {
  try {
    if (API_ENABLED) {
      // Real API call
      const response = await fetch(`${API_BASE_URL}/api/filings`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      return { data };
    } else {
      // Mock data with simulated delay
      await delay(1000);
      return { data: MOCK_FILING_LOGS };
    }
  } catch (error) {
    console.error('Error fetching filing logs:', error);
    return { 
      error: { 
        status: 500, 
        message: error instanceof Error ? error.message : 'Unknown error fetching filing logs' 
      } 
    };
  }
}

/**
 * Get detailed information for a specific filing
 */
export async function getFilingDetails(filingId: string): Promise<ApiResponse<FilingDetails>> {
  try {
    if (API_ENABLED) {
      // Real API call
      const response = await fetch(`${API_BASE_URL}/api/filings/${filingId}`, {
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
      
      // Find the filing in the mock data
      const filing = MOCK_FILING_LOGS.find(log => log.id === filingId);
      if (!filing || !filing.details) {
        return { 
          error: { 
            status: 404, 
            message: `Filing details not found for ID ${filingId}` 
          } 
        };
      }
      
      return { data: filing.details };
    }
  } catch (error) {
    console.error('Error fetching filing details:', error);
    return { 
      error: { 
        status: 500, 
        message: error instanceof Error ? error.message : 'Unknown error fetching filing details' 
      } 
    };
  }
}

/**
 * Rerun a filing job
 */
export async function rerunFilingJob(filingId: string): Promise<ApiResponse<{ success: boolean }>> {
  try {
    if (API_ENABLED) {
      // Real API call
      const response = await fetch(`${API_BASE_URL}/api/filings/${filingId}/rerun`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return { data: { success: true } };
    } else {
      // Mock rerun with simulated delay
      await delay(2000); // Longer delay to simulate processing
      
      return { data: { success: true } };
    }
  } catch (error) {
    console.error('Error rerunning filing job:', error);
    return { 
      error: { 
        status: 500, 
        message: error instanceof Error ? error.message : 'Unknown error rerunning filing job' 
      } 
    };
  }
} 