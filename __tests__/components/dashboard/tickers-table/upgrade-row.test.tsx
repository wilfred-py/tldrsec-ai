import { render, screen, fireEvent } from '@testing-library/react';
import { UpgradeRow } from '@/components/dashboard/tickers-table/upgrade-row';

describe('UpgradeRow', () => {
  const mockOnUpgradeClick = jest.fn();

  beforeEach(() => {
    mockOnUpgradeClick.mockClear();
  });

  it('should render upgrade message for FREE users', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={2}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
  });

  it('should show at-limit message when tickerCount equals tickerLimit', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={3}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText(/reached your 3 company limit/i)).toBeInTheDocument();
  });

  it('should show general upgrade message when under limit', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={1}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText(/track up to 25 companies/i)).toBeInTheDocument();
  });

  it('should call onUpgradeClick when button is clicked', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={2}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
          />
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Pro/i }));
    expect(mockOnUpgradeClick).toHaveBeenCalledWith('PRO', 'monthly');
  });

  it('should show loading state when isLoading is true', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={2}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={true}
          />
        </tbody>
      </table>
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should use custom columnCount when provided', () => {
    const { container } = render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={2}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
            columnCount={7}
          />
        </tbody>
      </table>
    );

    const cell = container.querySelector('td');
    expect(cell).toHaveAttribute('colspan', '7');
  });
});
