import React from 'react';
import { toast } from 'sonner';
import { addTrackedCompany, getTrackedCompanies } from '@/lib/api/ticker-service';

// Mock the ticker-service module
jest.mock('@/lib/api/ticker-service');

// Mock the toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// We don't need to mock auth for this isolated test

describe('Add Ticker Functionality', () => {
  // Create a simplified version of the handleAddTicker function
  async function handleAddTicker(symbol: string, name: string) {
    try {
      // Add the ticker to the database
      const result = await addTrackedCompany(symbol, name);
      
      if (result && !('error' in result)) {
        toast.success(`Added ${symbol} to your tracked companies`);
        
        // Reload the companies list
        try {
          const response = await getTrackedCompanies();
          // In a real component, we would update state here
          return { success: true, companies: response.data };
        } catch (refreshError) {
          console.error("Error refreshing companies list:", refreshError);
          // Even if refresh fails, we still added the ticker successfully
          return { success: true };
        }
      } else {
        // Handle API error response
        const errorMessage = 'error' in result && result.error && typeof result.error === 'object' && 'message' in result.error
          ? result.error.message as string
          : `Failed to add ${symbol}`;
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error("Error adding ticker:", error);
      toast.error(`Failed to add ${symbol}`);
      return { success: false, error: `Failed to add ${symbol}` };
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should successfully add a ticker and reload companies', async () => {
    // Setup mock implementations
    const mockCompany = { 
      id: 'new-ticker-id', 
      symbol: 'TSLA', 
      name: 'Tesla Inc.',
      companyName: 'Tesla Inc.',
      lastFiling: '—',
      lastFilingDate: '',
    };
    
    (addTrackedCompany as jest.Mock).mockResolvedValue({ data: mockCompany });
    (getTrackedCompanies as jest.Mock).mockResolvedValue({ data: [mockCompany] });
    
    // Call the function
    const result = await handleAddTicker('TSLA', 'Tesla Inc.');
    
    // Verify the function behavior
    expect(result.success).toBe(true);
    expect(result.companies).toEqual([mockCompany]);
    
    // Verify that addTrackedCompany was called with the correct parameters
    expect(addTrackedCompany).toHaveBeenCalledWith('TSLA', 'Tesla Inc.');
    
    // Verify that getTrackedCompanies was called to refresh the list
    expect(getTrackedCompanies).toHaveBeenCalledTimes(1);
    
    // Verify that a success toast was shown
    expect(toast.success).toHaveBeenCalledWith('Added TSLA to your tracked companies');
  });
  
  it('should handle errors when adding a ticker fails', async () => {
    // Mock the addTrackedCompany function to return an error
    (addTrackedCompany as jest.Mock).mockRejectedValue(new Error('Failed to add ticker'));
    
    // Call the function
    const result = await handleAddTicker('TSLA', 'Tesla Inc.');
    
    // Verify the function behavior
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to add TSLA');
    
    // Verify that addTrackedCompany was called
    expect(addTrackedCompany).toHaveBeenCalledWith('TSLA', 'Tesla Inc.');
    
    // Verify that an error toast was shown
    expect(toast.error).toHaveBeenCalledWith('Failed to add TSLA');
    
    // Verify that getTrackedCompanies was not called
    expect(getTrackedCompanies).not.toHaveBeenCalled();
  });
  
  it('should handle API errors with error object', async () => {
    // Mock the addTrackedCompany function to return an API error
    (addTrackedCompany as jest.Mock).mockResolvedValue({ 
      error: { 
        status: 400, 
        message: 'Ticker already exists' 
      } 
    });
    
    // Call the function
    const result = await handleAddTicker('TSLA', 'Tesla Inc.');
    
    // Verify the function behavior
    expect(result.success).toBe(false);
    expect(result.error).toBe('Ticker already exists');
    
    // Verify that addTrackedCompany was called
    expect(addTrackedCompany).toHaveBeenCalledWith('TSLA', 'Tesla Inc.');
    
    // Verify that an error toast was shown
    expect(toast.error).toHaveBeenCalledWith('Ticker already exists');
    
    // Verify that getTrackedCompanies was not called
    expect(getTrackedCompanies).not.toHaveBeenCalled();
  });
  
  it('should handle errors when refreshing companies list', async () => {
    // Setup mock implementations
    const mockCompany = { 
      id: 'new-ticker-id', 
      symbol: 'TSLA', 
      name: 'Tesla Inc.',
      companyName: 'Tesla Inc.',
      lastFiling: '—',
      lastFilingDate: '',
    };
    
    (addTrackedCompany as jest.Mock).mockResolvedValue({ data: mockCompany });
    (getTrackedCompanies as jest.Mock).mockRejectedValue(new Error('Failed to refresh companies'));
    
    // Call the function
    const result = await handleAddTicker('TSLA', 'Tesla Inc.');
    
    // Verify the function behavior - should still be successful even if refresh fails
    expect(result.success).toBe(true);
    expect(result.companies).toBeUndefined();
    
    // Verify that addTrackedCompany was called with the correct parameters
    expect(addTrackedCompany).toHaveBeenCalledWith('TSLA', 'Tesla Inc.');
    
    // Verify that getTrackedCompanies was called
    expect(getTrackedCompanies).toHaveBeenCalledTimes(1);
    
    // Verify that a success toast was shown for the add operation
    expect(toast.success).toHaveBeenCalledWith('Added TSLA to your tracked companies');
  });
});
