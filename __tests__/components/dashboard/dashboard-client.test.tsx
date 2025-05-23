import React from 'react';
import { render, screen, waitFor, fireEvent } from '@/__tests__/test-utils';
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
    (tickerService.deleteTrackedCompany as jest.Mock).mockResolvedValue({ success: true });
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

  // Tests for the delete confirmation dialog
  it('should open confirmation dialog when delete button is clicked', async () => {
    render(<DashboardClient />);
    
    // Wait for companies to be displayed
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
    
    // Find the delete button for AAPL and click it
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);
    
    // Check that confirmation dialog is displayed
    expect(screen.getByText(/confirm deletion/i)).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to remove aapl/i)).toBeInTheDocument();
  });

  it('should not delete company when cancel button is clicked in confirmation dialog', async () => {
    render(<DashboardClient />);
    
    // Wait for companies to be displayed
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
    
    // Find the delete button for AAPL and click it
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);
    
    // Click the Cancel button
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    
    // Verify dialog is closed
    await waitFor(() => {
      expect(screen.queryByText(/confirm deletion/i)).not.toBeInTheDocument();
    });
    
    // Verify that delete API was not called
    expect(tickerService.deleteTrackedCompany).not.toHaveBeenCalled();
    
    // Verify the company is still in the list
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('should delete company when confirm delete button is clicked', async () => {
    render(<DashboardClient />);
    
    // Wait for companies to be displayed
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
    
    // Find the delete button for AAPL and click it
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);
    
    // Click the Delete button to confirm
    const deleteButton = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(deleteButton);
    
    // Verify delete API was called with the correct company ID
    expect(tickerService.deleteTrackedCompany).toHaveBeenCalledWith('1'); // Assuming ID of first mock company is '1'
    
    // Verify the dialog is closed
    await waitFor(() => {
      expect(screen.queryByText(/confirm deletion/i)).not.toBeInTheDocument();
    });
  });
}); 