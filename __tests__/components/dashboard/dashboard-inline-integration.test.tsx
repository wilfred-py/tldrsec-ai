import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

const mockCompanies = [
  { symbol: 'AAPL', name: 'Apple Inc.', cik: '0000320193' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', cik: '0000789019' },
];

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { fullName: 'Test User', imageUrl: null }
  }),
  UserButton: () => <div data-testid="user-button">UserButton</div>
}));

// Mock Clerk server
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(() => ({ userId: 'test-user-id' })),
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

beforeEach(() => {
  jest.clearAllMocks();
  // Reset localStorage
  localStorage.clear();

  global.fetch = jest.fn().mockImplementation((url) => {
    if (url === '/api/companies/list') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ companies: mockCompanies })
      });
    }
    if (url === '/api/user/tickers') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Dashboard - Inline Ticker Integration', () => {
  it('should NOT open dialog when Add Ticker clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardClient tutorialCompleted={true} />);

    // Wait for initial render to complete
    const addButton = await screen.findByRole('button', { name: /add ticker/i });
    await user.click(addButton);

    // No dialog role element
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should show inline search row when Add Ticker clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardClient tutorialCompleted={true} />);

    // Find and click Add Ticker button
    const addButton = await screen.findByRole('button', { name: /add ticker/i });
    await user.click(addButton);

    // Should show search input
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type to search ticker or company/i)).toBeInTheDocument();
    });
  });

  it('should fetch companies when Add Ticker clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardClient tutorialCompleted={true} />);

    // Click Add Ticker to trigger company list fetch
    const addButton = await screen.findByRole('button', { name: /add ticker/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/companies/list');
    });
  });

  it('should show results immediately on first character', async () => {
    const user = userEvent.setup();
    render(<DashboardClient tutorialCompleted={true} />);

    const addButton = await screen.findByRole('button', { name: /add ticker/i });
    await user.click(addButton);

    // Wait for companies to load after clicking Add Ticker
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/companies/list');
    });

    const input = await screen.findByPlaceholderText(/type to search ticker or company/i);
    await user.type(input, 'A');

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
  });

  it('should hide inline search when Cancel clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardClient tutorialCompleted={true} />);

    const addButton = await screen.findByRole('button', { name: /add ticker/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type to search ticker or company/i)).toBeInTheDocument();
    });

    // Find the Cancel button
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/type to search ticker or company/i)).toBeNull();
    });
  });

  it('should add ticker and close search when result selected', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockImplementation((url, options) => {
      if (url === '/api/companies/list') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ companies: mockCompanies })
        });
      }
      if (url === '/api/user/tickers' && !options) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] })
        });
      }
      if (url === '/api/user/tickers' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { id: '1', symbol: 'AAPL', name: 'Apple Inc.' } })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    });

    render(<DashboardClient tutorialCompleted={true} />);

    const addButton = await screen.findByRole('button', { name: /add ticker/i });
    await user.click(addButton);

    // Wait for companies to load
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/companies/list');
    });

    const input = await screen.findByPlaceholderText(/type to search ticker or company/i);
    await user.type(input, 'AAPL');

    await waitFor(() => {
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    });

    // Click on the result
    await user.click(screen.getByText('Apple Inc.'));

    // Search should close
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/type to search ticker or company/i)).toBeNull();
    });
  });
});
