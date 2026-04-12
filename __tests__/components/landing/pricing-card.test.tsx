import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { PricingCard } from '@/components/landing/pricing-card';

// Mock lucide-react icons to simple spans
jest.mock('lucide-react', () => ({
  Check: ({ className }: { className?: string }) => <span data-testid="check-icon" className={className} />,
  Loader2: ({ className }: { className?: string }) => <span data-testid="loader-icon" className={className} />,
  CheckCircle2: ({ className }: { className?: string }) => <span data-testid="check-circle-icon" className={className} />,
}));

// Default plan fixture
const proPlanFixture = {
  key: 'PRO',
  name: 'Pro',
  monthlyPrice: 199,
  annualPrice: 1990,
  description: 'Everything you need for serious investing',
  features: ['**25** companies to track', 'Real-time email alerts'],
  cta: 'Upgrade to Pro',
  href: '/onboarding?plan=pro',
  popular: true,
  disabled: false,
  icon: ({ className }: { className?: string }) => <span className={className}>icon</span>,
};

const maxPlan = {
  ...proPlanFixture,
  key: 'MAX',
  name: 'Max',
  monthlyPrice: 349,
  annualPrice: 3490,
  features: ['**Unlimited** companies', 'Dedicated support'],
  cta: 'Upgrade to Max',
  href: '/onboarding?plan=max',
  popular: false,
};

const defaultProps = {
  plan: proPlanFixture,
  billingInterval: 'monthly' as const,
  isCurrentPlan: false,
  isTrialEndingSoon: false,
  loading: false,
  checkoutLoading: false,
  hoveredCard: null as string | null,
  onMouseEnter: jest.fn(),
  onMouseLeave: jest.fn(),
  onCheckout: jest.fn(),
  getCtaText: (plan: typeof proPlanFixture) => plan.cta,
  getPrice: (plan: typeof proPlanFixture) => plan.monthlyPrice,
  getMonthlyEquivalent: () => null,
  getSavings: () => null,
};

describe('PricingCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders plan name, price, and features', () => {
    render(<PricingCard {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 3, name: /Pro/i })).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('Real-time email alerts')).toBeInTheDocument();
  });

  it('shows "Current Plan" badge when isCurrentPlan is true', () => {
    render(<PricingCard {...defaultProps} isCurrentPlan={true} />);

    expect(screen.getByRole('status')).toHaveTextContent('Current Plan');
  });

  it('disables button and shows "Current Plan" text when isCurrentPlan is true', () => {
    render(<PricingCard {...defaultProps} isCurrentPlan={true} />);

    const button = screen.getByRole('button', { name: /Current Plan/i });
    expect(button).toBeDisabled();
  });

  it('shows "Trial Ending Soon" badge when isTrialEndingSoon is true', () => {
    render(
      <PricingCard
        {...defaultProps}
        isCurrentPlan={true}
        isTrialEndingSoon={true}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Trial Ending Soon');
  });

  it('shows "Trial Ending Soon" in button when isTrialEndingSoon is true', () => {
    render(
      <PricingCard
        {...defaultProps}
        isCurrentPlan={true}
        isTrialEndingSoon={true}
      />
    );

    const button = screen.getByRole('button', { name: /Trial Ending Soon/i });
    expect(button).toBeDisabled();
  });

  it('shows Skeleton when loading is true', () => {
    const { container } = render(<PricingCard {...defaultProps} loading={true} />);

    // Skeleton is rendered instead of button
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // Skeleton has a specific class
    expect(container.querySelector('[class*="skeleton"]') || container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  });

  it('hides "Current Plan" badge when loading', () => {
    render(
      <PricingCard {...defaultProps} isCurrentPlan={true} loading={true} />
    );

    // Badge uses role="status" - should not be present while loading
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows "Popular" badge for popular plans', () => {
    render(<PricingCard {...defaultProps} />);

    expect(screen.getByText('Popular')).toBeInTheDocument();
  });

  it('shows both Popular and Current Plan badges', () => {
    render(
      <PricingCard {...defaultProps} isCurrentPlan={true} />
    );

    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Current Plan');
  });

  it('shows spinner when checkoutLoading is true', () => {
    render(<PricingCard {...defaultProps} checkoutLoading={true} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });

  it('calls onCheckout with plan key when CTA is clicked', () => {
    const onCheckout = jest.fn();
    render(<PricingCard {...defaultProps} onCheckout={onCheckout} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onCheckout).toHaveBeenCalledWith('PRO');
  });

  it('renders bold text within features using **markdown** syntax', () => {
    render(<PricingCard {...defaultProps} />);

    // Bold text should be in a <strong> element
    const strongElement = screen.getByText('25');
    expect(strongElement.tagName).toBe('STRONG');
  });

  it('shows "Everything in Pro" footer for MAX plan', () => {
    render(<PricingCard {...defaultProps} plan={maxPlan} />);

    expect(screen.getByText('Everything in Pro')).toBeInTheDocument();
  });

  it('does not show "Everything in" footer for PRO plan', () => {
    render(<PricingCard {...defaultProps} />);

    expect(screen.queryByText(/Everything in/)).not.toBeInTheDocument();
  });

  describe('hover interactions', () => {
    it('shows blue border on popular card when no card is hovered', () => {
      const { container } = render(<PricingCard {...defaultProps} hoveredCard={null} />);

      const card = container.querySelector('[role="article"]') as HTMLElement;
      expect(card.getAttribute('data-highlighted')).toBe('true');
    });

    it('removes blue border from Pro when Max is hovered', () => {
      const { container } = render(<PricingCard {...defaultProps} hoveredCard="MAX" />);

      const card = container.querySelector('[role="article"]') as HTMLElement;
      expect(card.getAttribute('data-highlighted')).toBe('false');
    });

    it('shows blue border on Max card when Max is hovered', () => {
      const { container } = render(
        <PricingCard {...defaultProps} plan={maxPlan} hoveredCard="MAX" />
      );

      const card = container.querySelector('[role="article"]') as HTMLElement;
      expect(card.getAttribute('data-highlighted')).toBe('true');
    });

    it('applies depth styles when card is hovered', () => {
      const { container } = render(
        <PricingCard {...defaultProps} hoveredCard="PRO" />
      );

      const card = container.querySelector('[role="article"]') as HTMLElement;
      expect(card.getAttribute('data-hovered')).toBe('true');
      const style = card.getAttribute('style') || '';
      expect(style).toContain('scale(1.02)');
      expect(style).toContain('z-index: 10');
    });

    it('uses brand-button-primary on CTA when card is hovered', () => {
      render(<PricingCard {...defaultProps} hoveredCard="PRO" />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('brand-button-primary');
    });

    it('keeps brand-button-secondary on CTA when checkoutLoading even if hovered', () => {
      render(
        <PricingCard {...defaultProps} hoveredCard="PRO" checkoutLoading={true} />
      );

      const button = screen.getByRole('button');
      expect(button.className).toContain('brand-button-secondary');
    });

    it('calls onMouseEnter and onMouseLeave handlers', () => {
      const onMouseEnter = jest.fn();
      const onMouseLeave = jest.fn();
      const { container } = render(
        <PricingCard
          {...defaultProps}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
      );

      const card = container.querySelector('[role="article"]') as HTMLElement;
      fireEvent.mouseEnter(card);
      expect(onMouseEnter).toHaveBeenCalledTimes(1);

      fireEvent.mouseLeave(card);
      expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });
  });
});
