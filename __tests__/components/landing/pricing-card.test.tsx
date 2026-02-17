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
const freePlan = {
  key: 'FREE',
  name: 'Free',
  monthlyPrice: 0,
  annualPrice: 0,
  description: 'Get started with SEC filings',
  features: ['3 companies to track', 'Real-time email alerts'],
  cta: 'Get Started',
  href: '/onboarding',
  popular: false,
  disabled: false,
  icon: ({ className }: { className?: string }) => <span className={className}>icon</span>,
};

const proPlan = {
  ...freePlan,
  key: 'PRO',
  name: 'Pro',
  monthlyPrice: 199,
  annualPrice: 1990,
  features: ['**25** companies to track', 'Priority processing queue'],
  cta: 'Upgrade to Pro',
  href: '/onboarding?plan=pro',
  popular: true,
};

const defaultProps = {
  plan: freePlan,
  billingInterval: 'monthly' as const,
  isCurrentPlan: false,
  isTrialEndingSoon: false,
  loading: false,
  checkoutLoading: false,
  onCheckout: jest.fn(),
  getCtaText: (plan: typeof freePlan) => plan.cta,
  getPrice: (plan: typeof freePlan) => plan.monthlyPrice,
  getMonthlyEquivalent: () => null,
  getSavings: () => null,
};

describe('PricingCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders plan name, price, and features', () => {
    render(<PricingCard {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 3, name: /Free/i })).toBeInTheDocument();
    expect(screen.getByText('3 companies to track')).toBeInTheDocument();
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
    render(<PricingCard {...defaultProps} plan={proPlan} />);

    expect(screen.getByText('Popular')).toBeInTheDocument();
  });

  it('shows both Popular and Current Plan badges', () => {
    render(
      <PricingCard {...defaultProps} plan={proPlan} isCurrentPlan={true} />
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

    expect(onCheckout).toHaveBeenCalledWith('FREE');
  });

  it('renders bold text within features using **markdown** syntax', () => {
    render(<PricingCard {...defaultProps} plan={proPlan} />);

    // Bold text should be in a <strong> element
    const strongElement = screen.getByText('25');
    expect(strongElement.tagName).toBe('STRONG');
  });

  it('shows "Everything in Free" footer for PRO plan', () => {
    render(<PricingCard {...defaultProps} plan={proPlan} />);

    expect(screen.getByText('Everything in Free')).toBeInTheDocument();
  });
});
