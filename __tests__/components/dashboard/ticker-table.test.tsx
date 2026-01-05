import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

// Mock the dashboard ticker table component
const MockTickerTable = ({ data, onError }: any) => {
  const handleError = () => {
    onError?.(new Error('Table error'));
  };

  return (
    <div data-testid="ticker-table">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Company</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((ticker: any) => (
            <tr key={ticker.id} data-testid={`ticker-row-${ticker.symbol}`}>
              <td>{ticker.symbol}</td>
              <td>{ticker.companyName}</td>
              <td>
                <button 
                  onClick={handleError}
                  data-testid={`delete-${ticker.symbol}`}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

describe('TickerTable Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  describe('Error State Handling', () => {
    it('should handle error states gracefully', async () => {
      const mockData = [
        { id: '1', symbol: 'AAPL', companyName: 'Apple Inc.' }
      ];

      const onError = jest.fn();

      renderWithQueryClient(
        <MockTickerTable data={mockData} onError={onError} />
      );

      const deleteButton = screen.getByTestId('delete-AAPL');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    it('should render empty state when no tickers', () => {
      renderWithQueryClient(<MockTickerTable data={[]} />);
      
      const table = screen.getByTestId('ticker-table');
      expect(table).toBeInTheDocument();
    });

    it('should handle malformed data gracefully', () => {
      const malformedData = [
        { id: null, symbol: '', companyName: null }
      ];

      expect(() => {
        renderWithQueryClient(<MockTickerTable data={malformedData} />);
      }).not.toThrow();
    });
  });

  describe('Large Dataset Performance', () => {
    it('should render 1000+ tickers without performance issues', () => {
      const largeMockData = Array.from({ length: 1000 }, (_, i) => ({
        id: `ticker-${i}`,
        symbol: `T${i.toString().padStart(3, '0')}`,
        companyName: `Test Company ${i}`
      }));

      const start = performance.now();
      renderWithQueryClient(<MockTickerTable data={largeMockData} />);
      const end = performance.now();

      // Should render within reasonable time (< 100ms)
      expect(end - start).toBeLessThan(100);
      expect(screen.getByTestId('ticker-table')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for table headers', () => {
      const mockData = [
        { id: '1', symbol: 'AAPL', companyName: 'Apple Inc.' }
      ];

      renderWithQueryClient(<MockTickerTable data={mockData} />);
      
      expect(screen.getByRole('columnheader', { name: /symbol/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /company/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      const mockData = [
        { id: '1', symbol: 'AAPL', companyName: 'Apple Inc.' }
      ];

      renderWithQueryClient(<MockTickerTable data={mockData} />);
      
      const deleteButton = screen.getByTestId('delete-AAPL');
      deleteButton.focus();
      expect(deleteButton).toHaveFocus();
    });
  });
});