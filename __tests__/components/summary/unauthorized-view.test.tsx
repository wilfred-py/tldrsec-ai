import React from 'react';
import { render } from '@testing-library/react';
import { UnauthorizedView } from '@/components/summary/unauthorized-view';
import '@testing-library/jest-dom';

describe('UnauthorizedView Component', () => {
  const mockProps = {
    ticker: {
      symbol: 'AAPL',
      companyName: 'Apple Inc.'
    },
    filingType: '10-K',
    filingDate: new Date('2023-01-15')
  };

  it('should render the access restricted alert', () => {
    const { getByText } = render(<UnauthorizedView {...mockProps} />);
    
    const alertTitle = getByText('Access Restricted');
    expect(alertTitle).toBeInTheDocument();
    
    const alertDescription = getByText(/You don't have permission to view the full content of this 10-K filing for AAPL./);
    expect(alertDescription).toBeInTheDocument();
  });

  it('should display the correct ticker information', () => {
    const { getByText } = render(<UnauthorizedView {...mockProps} />);
    
    expect(getByText('Apple Inc. (AAPL)')).toBeInTheDocument();
    expect(getByText('10-K')).toBeInTheDocument();
    expect(getByText('1/15/2023')).toBeInTheDocument();
  });

  it('should render the info section with guidance on how to gain access', () => {
    const { getByText } = render(<UnauthorizedView {...mockProps} />);
    
    expect(getByText('Gain Access to This Summary')).toBeInTheDocument();
    expect(getByText(/To view the full summary, add AAPL to your watchlist in settings./)).toBeInTheDocument();
  });

  it('should include a button to go to watchlist settings', () => {
    const { getByRole } = render(<UnauthorizedView {...mockProps} />);
    
    const button = getByRole('button', { name: /Go to Watchlist Settings/i });
    expect(button).toBeInTheDocument();
    
    const link = getByRole('link');
    expect(link).toHaveAttribute('href', '/dashboard/settings');
  });
}); 