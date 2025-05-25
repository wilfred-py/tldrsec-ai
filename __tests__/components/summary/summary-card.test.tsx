import React from 'react';
import { render, screen } from '@testing-library/react';
import { SummaryCard } from '@/components/summary/summary-card';
import '@testing-library/jest-dom';

// Mock next/link to avoid navigation during tests
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

describe('SummaryCard Component', () => {
  // Sample summary data for testing
  const mockSummary = {
    id: 'summary123',
    tickerId: 'ticker123',
    filingType: '10-K',
    filingDate: new Date('2023-01-01').toISOString(),
    filingUrl: 'https://example.com/filing',
    summaryText: 'This is a sample summary text that should be truncated if it exceeds the length limit set in the component.',
    createdAt: new Date().toISOString(),
    ticker: {
      id: 'ticker123',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      userId: 'user123',
      addedAt: new Date().toISOString()
    }
  };

  it('renders the summary card with correct content', () => {
    render(<SummaryCard summary={mockSummary as any} />);
    
    // Check basic content is rendered
    expect(screen.getByText('AAPL: 10-K')).toBeInTheDocument();
    expect(screen.getByText(/This is a sample summary/)).toBeInTheDocument();
    
    // Check the links are present
    const viewSummaryLink = screen.getByText(/View Summary/i).closest('a');
    expect(viewSummaryLink).toHaveAttribute('href', `/summary/${mockSummary.id}`);
    
    const originalFilingLink = screen.getByText(/Original Filing/i).closest('a');
    expect(originalFilingLink).toHaveAttribute('href', mockSummary.filingUrl);
    expect(originalFilingLink).toHaveAttribute('target', '_blank');
    expect(originalFilingLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('truncates the preview text when it exceeds the limit', () => {
    const longText = 'A'.repeat(200);
    const summaryWithLongText = {
      ...mockSummary,
      summaryText: longText
    };
    
    const { getByText } = render(
      <SummaryCard 
        summary={summaryWithLongText as any} 
        previewLength={120} 
      />
    );
    
    // The text should be truncated and end with "..."
    const displayedText = getByText(/A+\.\.\./);
    expect(displayedText.textContent?.length).toBeLessThanOrEqual(123); // 120 + "..."
  });

  it('respects the compact variant', () => {
    const { container } = render(
      <SummaryCard 
        summary={mockSummary as any} 
        variant="compact"
      />
    );
    
    // The card should have compact styling classes
    const cardElements = container.querySelectorAll('[class*="p-3"]');
    expect(cardElements.length).toBeGreaterThan(0);
  });

  it('hides preview when showPreview is false', () => {
    const { queryByText } = render(
      <SummaryCard 
        summary={mockSummary as any} 
        showPreview={false}
      />
    );
    
    // The preview text should not be rendered
    expect(queryByText(/This is a sample summary/)).not.toBeInTheDocument();
  });
}); 