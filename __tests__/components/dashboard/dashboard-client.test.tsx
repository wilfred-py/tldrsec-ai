import React from 'react';
import { render, screen, waitFor } from '@/__tests__/test-utils';
import { DashboardClient } from '@/components/dashboard/dashboard-client';
import * as tickerService from '@/lib/api/ticker-service';
import { MOCK_COMPANIES } from '@/lib/api/mock-data';

// Mock the ticker-service module
jest.mock('@/lib/api/ticker-service');

describe('DashboardClient Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (tickerService.getTrackedCompanies as jest.Mock).mockResolvedValue({ data: MOCK_COMPANIES });
  });
  
  it('should display loading skeletons during API calls', async () => {
    const { container } = render(<DashboardClient />);
    
    // Check for loading state
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
  });
  
  it('should render company list correctly when data loads', async () => {
    render(<DashboardClient />);
    
    // Wait for companies to be displayed
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    });
  });
  
  it('should show empty state when no companies exist', async () => {
    // Mock empty companies result
    (tickerService.getTrackedCompanies as jest.Mock).mockResolvedValue({ data: [] });
    
    render(<DashboardClient />);
    
    // Check for the empty state message
    await waitFor(() => {
      expect(screen.getByText('No companies tracked yet')).toBeInTheDocument();
    });
  });
}); 