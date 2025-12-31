import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FeaturesSectionV2 } from '@/components/landing/sections-v2/features-section-v2';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
    article: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <article {...props}>{children}</article>,
  },
}));

describe('FeaturesSectionV2', () => {
  it('should render section heading', () => {
    render(<FeaturesSectionV2 />);
    expect(screen.getByText(/Built for Modern Investors/i)).toBeInTheDocument();
  });

  it('should render 6 feature cards', () => {
    render(<FeaturesSectionV2 />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(6);
  });

  it('should display feature titles', () => {
    render(<FeaturesSectionV2 />);
    expect(screen.getByText(/300\+ Pages.*2 Minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/Real-Time Monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/Smart Notifications/i)).toBeInTheDocument();
  });

  it('should have 3-column grid on desktop', () => {
    const { container } = render(<FeaturesSectionV2 />);
    const grid = container.querySelector('.lg\\:grid-cols-3');
    expect(grid).toBeInTheDocument();
  });

  it('should have white background', () => {
    const { container } = render(<FeaturesSectionV2 />);
    const section = container.querySelector('section');
    expect(section).toHaveClass('bg-white');
  });

  it('should display feature icons', () => {
    const { container } = render(<FeaturesSectionV2 />);
    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(6);
  });
});
