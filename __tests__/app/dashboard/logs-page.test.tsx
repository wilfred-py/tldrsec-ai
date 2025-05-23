import React from 'react';
import { render, screen, waitFor } from '@/__tests__/test-utils';
import LogsPage from '@/app/dashboard/logs/page';
import * as filingService from '@/lib/api/filing-service';
import { MOCK_FILING_LOGS } from '@/lib/api/mock-data';

// Mock the filing-service module
jest.mock('@/lib/api/filing-service');

describe('LogsPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (filingService.getFilingLogs as jest.Mock).mockResolvedValue({ data: MOCK_FILING_LOGS });
  });
  
  it('should display loading skeletons during API calls', async () => {
    const { container } = render(<LogsPage />);
    
    // Check for loading state
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
  });
  
  it('should render filing logs correctly when data loads', async () => {
    render(<LogsPage />);
    
    // Wait for logs to be displayed
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      expect(screen.getAllByText('10-K').length).toBeGreaterThan(0);
    });
  });
  
  it('should show empty state when no logs exist', async () => {
    // Mock empty logs result
    (filingService.getFilingLogs as jest.Mock).mockResolvedValue({ data: [] });
    
    render(<LogsPage />);
    
    // Check for the empty state message
    await waitFor(() => {
      expect(screen.getByText('No filings found.')).toBeInTheDocument();
    });
  });
}); 