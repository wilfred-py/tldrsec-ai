import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanySearch } from '@/components/dashboard/company-search';

// Mock fetch for company list
const mockCompanies = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
];

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ companies: mockCompanies }),
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Helper to type in input and wait for debounced results
async function typeAndWaitForResults(input: HTMLElement, text: string) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  await user.type(input, text);

  // Advance timers past the 300ms debounce
  await act(async () => {
    jest.advanceTimersByTime(350);
  });
}

describe('CompanySearch Keyboard Navigation', () => {
  const mockOnSelect = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Arrow Key Navigation', () => {
    it('should highlight first result when pressing ArrowDown from input', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      // Wait for companies to load
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      await typeAndWaitForResults(input, 'AA');

      // Wait for results to appear
      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Press ArrowDown
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // First result should be highlighted
      const firstResult = screen.getByText('AAPL').closest('[data-highlighted]');
      expect(firstResult).toHaveAttribute('data-highlighted', 'true');
    });

    it('should move highlight down when pressing ArrowDown', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      // Use 'In' to match 'Apple Inc.' and 'Amazon.com Inc.' and 'Alphabet Inc.'
      await typeAndWaitForResults(input, 'In');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('AMZN')).toBeInTheDocument();
      });

      // Press ArrowDown twice
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Second result should be highlighted
      const secondResult = screen.getByText('AMZN').closest('[data-highlighted]');
      expect(secondResult).toHaveAttribute('data-highlighted', 'true');
    });

    it('should move highlight up when pressing ArrowUp', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      // Use 'In' to match all three companies
      await typeAndWaitForResults(input, 'In');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('AMZN')).toBeInTheDocument();
      });

      // Move down twice then up once
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      // First result should be highlighted again
      const firstResult = screen.getByText('AAPL').closest('[data-highlighted]');
      expect(firstResult).toHaveAttribute('data-highlighted', 'true');
    });

    it('should not move highlight above first result', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      await typeAndWaitForResults(input, 'AA');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Press ArrowDown then ArrowUp twice
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      // Should be at -1 (no selection) after going up from first item
      const firstResult = screen.getByText('AAPL').closest('[data-highlighted]');
      expect(firstResult).not.toHaveAttribute('data-highlighted', 'true');
    });

    it('should not move highlight below last result', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      // Use 'In' to match all three companies
      await typeAndWaitForResults(input, 'In');

      await waitFor(() => {
        expect(screen.getByText('GOOGL')).toBeInTheDocument();
      });

      // Press ArrowDown 5 times (more than 3 results)
      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
      }

      // Last result should be highlighted
      const lastResult = screen.getByText('GOOGL').closest('[data-highlighted]');
      expect(lastResult).toHaveAttribute('data-highlighted', 'true');
    });
  });

  describe('Enter Key Selection', () => {
    it('should call onSelect with highlighted result when pressing Enter', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      await typeAndWaitForResults(input, 'AA');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Highlight first result and press Enter
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnSelect).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
    });

    it('should not call onSelect when pressing Enter with no highlight', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      await typeAndWaitForResults(input, 'AA');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Press Enter without highlighting
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnSelect).not.toHaveBeenCalled();
    });
  });

  describe('Escape Key Behavior', () => {
    it('should clear search input when pressing Escape', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      await typeAndWaitForResults(input, 'AAPL');

      expect(input).toHaveValue('AAPL');

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(input).toHaveValue('');
    });

    it('should hide results when pressing Escape', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      await typeAndWaitForResults(input, 'AA');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
      });
    });

    it('should reset highlight index when pressing Escape', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      await typeAndWaitForResults(input, 'AA');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Highlight an item
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Press Escape
      fireEvent.keyDown(input, { key: 'Escape' });

      // Type again
      await typeAndWaitForResults(input, 'AA');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // No item should be highlighted initially
      const firstResult = screen.getByText('AAPL').closest('[data-highlighted]');
      expect(firstResult).not.toHaveAttribute('data-highlighted', 'true');
    });
  });

  describe('Highlight Reset on Results Change', () => {
    it('should reset highlight when search results change', async () => {
      render(<CompanySearch onSelect={mockOnSelect} onCancel={mockOnCancel} />);

      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      const input = screen.getByPlaceholderText(/search by ticker/i);
      await typeAndWaitForResults(input, 'AA');

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Highlight second result
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Clear and search for something else
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.clear(input);
      await typeAndWaitForResults(input, 'GO');

      await waitFor(() => {
        expect(screen.getByText('GOOGL')).toBeInTheDocument();
      });

      // No item should be highlighted
      const googleResult = screen.getByText('GOOGL').closest('[data-highlighted]');
      expect(googleResult).not.toHaveAttribute('data-highlighted', 'true');
    });
  });
});
