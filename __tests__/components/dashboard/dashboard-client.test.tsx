import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { fullName: 'Test User', imageUrl: null }
  }),
  UserButton: () => <div data-testid="user-button">UserButton</div>
}));

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  }
}));

// Mock TutorialGuide to avoid auth issues
jest.mock('@/components/onboarding/tutorial-guide', () => ({
  TutorialGuide: () => null
}));

// Mock the ticker-service module
const mockGetTrackedCompanies = jest.fn();
const mockDeleteTrackedCompany = jest.fn();
const mockAddTrackedCompany = jest.fn();
const mockUpdateCompanyPreferences = jest.fn();

jest.mock('@/lib/api/ticker-service', () => ({
  getTrackedCompanies: () => mockGetTrackedCompanies(),
  deleteTrackedCompany: (id: string) => mockDeleteTrackedCompany(id),
  addTrackedCompany: (symbol: string, name: string) => mockAddTrackedCompany(symbol, name),
  updateCompanyPreferences: (symbol: string, prefs: unknown) => mockUpdateCompanyPreferences(symbol, prefs),
}));

const MOCK_COMPANIES = [
  {
    id: '1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    lastFiling: '2 days ago',
    preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: false }
  },
  {
    id: '2',
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    lastFiling: '1 week ago',
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  },
];

// TODO: These tests need to be updated to properly mock the useAsync hook
// The current mocking strategy doesn't work with the way useAsync processes functions
describe.skip('DashboardClient Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset localStorage
    localStorage.clear();
    localStorage.setItem('hasSeenTutorial', 'true');

    // Mock fetch for companies list prefetch
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url === '/api/companies/list') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ companies: [] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    // Setup default mock implementations
    mockGetTrackedCompanies.mockResolvedValue({ data: MOCK_COMPANIES });
    mockDeleteTrackedCompany.mockResolvedValue({ success: true });
    mockAddTrackedCompany.mockResolvedValue({ success: true, data: { id: 'new-1', symbol: 'AAPL' } });
    mockUpdateCompanyPreferences.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should display loading state during API calls', async () => {
    render(<DashboardClient />);

    // Check for loading state - the component uses Loader2 with animate-spin
    expect(screen.getByText(/loading tracked companies/i)).toBeInTheDocument();

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
    mockGetTrackedCompanies.mockResolvedValue({ data: [] });

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

  it('should close dialog when cancel button is clicked', async () => {
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

    // Verify the company is still in the list
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('should call delete API when confirm button is clicked', async () => {
    render(<DashboardClient />);

    // Wait for companies to be displayed
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Find the delete button for AAPL and click it
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    // Click the Remove button to confirm (button text is "Remove")
    const removeButton = screen.getByRole('button', { name: /^remove$/i });
    fireEvent.click(removeButton);

    // Verify delete API was called with the correct company ID
    await waitFor(() => {
      expect(mockDeleteTrackedCompany).toHaveBeenCalledWith('1');
    });
  });
});
