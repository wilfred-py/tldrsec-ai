import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CTASectionV2 } from '@/components/landing/sections-v2/cta-section-v2';
import { CTA_SECTION } from '@/lib/landing/copy';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
  },
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  );
});

describe('CTASectionV2', () => {
  it('should render headline', () => {
    render(<CTASectionV2 />);
    expect(screen.getByText(CTA_SECTION.heading)).toBeInTheDocument();
  });

  it('should render Get Started CTA link to /sign-up', () => {
    render(<CTASectionV2 />);
    const link = screen.getByRole('link', { name: new RegExp(CTA_SECTION.buttonLabel, 'i') });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/sign-up');
  });

  it('should display trust signals', () => {
    render(<CTASectionV2 />);
    CTA_SECTION.trustPoints.forEach((point) => {
      expect(screen.getByText(point)).toBeInTheDocument();
    });
  });

  // Frame-sanity guard: the CTA copy must reflect the Form-4 / insider-edge
  // framing committed to in decision 7A. This catches a future revert that
  // would silently pass the constant-import assertions above.
  it('uses insider-edge framing in heading and body (Form-4 wedge)', () => {
    expect(CTA_SECTION.heading).toMatch(/insider/i);
    expect(CTA_SECTION.body).toMatch(/insider/i);
  });

  it('should have light blue gradient background', () => {
    const { container } = render(<CTASectionV2 />);
    const section = container.querySelector('section');
    // Should not have dark gradient classes
    expect(section).not.toHaveClass('from-slate-900');
  });
});
