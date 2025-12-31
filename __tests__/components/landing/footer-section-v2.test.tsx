import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FooterSectionV2 } from '@/components/landing/sections-v2/footer-section-v2';

describe('FooterSectionV2', () => {
  it('should render logo/brand', () => {
    render(<FooterSectionV2 />);
    // Use getAllByText since tldrsec appears multiple times (logo and copyright)
    const brandElements = screen.getAllByText(/tldrsec/i);
    expect(brandElements.length).toBeGreaterThan(0);
  });

  it('should have product links', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByRole('link', { name: /Pricing/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign Up/i })).toBeInTheDocument();
  });

  it('should have legal links', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByRole('link', { name: /Privacy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Terms/i })).toBeInTheDocument();
  });

  it('should display copyright', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByText(/2024|2025/)).toBeInTheDocument();
  });

  it('should have SEC disclaimer', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByText(/not investment advice/i)).toBeInTheDocument();
  });

  it('should have white background', () => {
    const { container } = render(<FooterSectionV2 />);
    const footer = container.querySelector('footer');
    expect(footer).toHaveClass('bg-white');
  });
});
