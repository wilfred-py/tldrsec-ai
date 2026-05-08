import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FeaturesSectionV2 } from '@/components/landing/sections-v2/features-section-v2';
import { FEATURES_SECTION } from '@/lib/landing/copy';

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
    expect(screen.getByText(FEATURES_SECTION.heading)).toBeInTheDocument();
  });

  it('should render all feature cards', () => {
    render(<FeaturesSectionV2 />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(FEATURES_SECTION.cards.length);
  });

  it('should display feature titles', () => {
    render(<FeaturesSectionV2 />);
    FEATURES_SECTION.cards.forEach((card) => {
      expect(screen.getByText(card.title)).toBeInTheDocument();
    });
  });

  // Frame-sanity guard: the renamed feature cards must reflect the Form-4
  // wedge framing (decision 7A) and have removed the credit-rating term
  // (decision 5A — "investment-grade"). Catches accidental revert.
  it('renamed feature cards reflect insider-edge frame and compliance-safe vocabulary', () => {
    const titles = FEATURES_SECTION.cards.map((c) => c.title);
    // "Insider-Trade Tracking" replaces "Filing-Type Analysis" (7A).
    expect(titles).toEqual(expect.arrayContaining([expect.stringMatching(/insider/i)]));
    // "Investment-Grade Quality" must NOT exist anywhere (5A — credit-rating term).
    expect(titles.join(' ')).not.toMatch(/investment[-\s]grade/i);
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
