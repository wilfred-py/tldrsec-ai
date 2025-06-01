import React from 'react';
import { render, screen, waitFor, fireEvent } from '@/__tests__/test-utils';
import { CompanySearch } from '@/components/dashboard/company-search';
import { TickerSearchResult } from '@/lib/api/types';

// Mock the fetch function
global.fetch = jest.fn();

// Create mock data for companies
const mockCompaniesData = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOG', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.' }
] as TickerSearchResult[];

describe('Company Search Integration', () => {
  const mockOnSelect = jest.fn();
  const mockOnCancel = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup the fetch mock to return our mock data
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        companies: mockCompaniesData
      })
    });
  });

  it('should display results when searching', async () => {
    render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);
    
    // Check that the search input is rendered
    const searchInput = screen.getByPlaceholderText(/search by ticker or company name/i);
    expect(searchInput).toBeInTheDocument();
    
    // Type in the search box
    fireEvent.change(searchInput, { target: { value: 'App' } });
    
    // Wait for results to be displayed (debounced)
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
    
    // Check that Apple is in the results
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
  });
  
  it('should call onSelect when a company is selected', async () => {
    render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);
    
    // Type in the search box
    const searchInput = screen.getByPlaceholderText(/search by ticker or company name/i);
    fireEvent.change(searchInput, { target: { value: 'App' } });
    
    // Wait for results to be displayed
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
    
    // Find and click on the result item
    const resultItem = screen.getByText('AAPL').closest('div');
    if (resultItem) {
      fireEvent.click(resultItem);
    }
    
    // Verify that onSelect was called with the correct parameters
    expect(mockOnSelect).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });
  
  it('should show no results message when no matches found', async () => {
    render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);
    
    // Type a search term that won't match anything
    const searchInput = screen.getByPlaceholderText(/search by ticker or company name/i);
    fireEvent.change(searchInput, { target: { value: 'xyz123' } });
    
    // Should show no results message after debounce
    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });
  });
});
