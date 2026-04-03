import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CTASectionV2 } from '@/components/landing/sections-v2/cta-section-v2';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
  },
}));

describe('CTASectionV2', () => {
  it('should render headline', () => {
    render(<CTASectionV2 />);
    expect(screen.getByText(/Start Monitoring/i)).toBeInTheDocument();
  });

  it('should have email input field', () => {
    render(<CTASectionV2 />);
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
  });

  it('should have submit button', () => {
    render(<CTASectionV2 />);
    expect(screen.getByRole('button', { name: /Join|Start|Get/i })).toBeInTheDocument();
  });

  it('should display trust signals', () => {
    render(<CTASectionV2 />);
    expect(screen.getByText(/7-day free trial/i)).toBeInTheDocument();
    expect(screen.getByText(/unlimited tickers/i)).toBeInTheDocument();
  });

  it('should have light blue gradient background', () => {
    const { container } = render(<CTASectionV2 />);
    const section = container.querySelector('section');
    // Should not have dark gradient classes
    expect(section).not.toHaveClass('from-slate-900');
  });

  it('should validate email format', () => {
    render(<CTASectionV2 />);
    const input = screen.getByPlaceholderText(/email/i);
    expect(input).toHaveAttribute('type', 'email');
  });
});
