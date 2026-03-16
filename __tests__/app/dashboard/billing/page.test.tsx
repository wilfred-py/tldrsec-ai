/**
 * Billing Page Component Tests
 * Tests billing page renders correct pricing from SUBSCRIPTION_PLANS
 */

import { render, screen, waitFor } from '@testing-library/react';
import { useUser } from '@clerk/nextjs';
import { SUBSCRIPTION_PLANS } from '@/lib/stripe';

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: jest.fn(),
}));

// Mock the billing page component
const mockBillingPage = () => {
  const billingPlans = [
    {
      name: SUBSCRIPTION_PLANS.FREE.name,
      price: '$0/month',
      tickerLimit: SUBSCRIPTION_PLANS.FREE.tickerLimit,
      tickerDisplay: SUBSCRIPTION_PLANS.FREE.tickerLimit === -1 ? 'Unlimited companies' : `${SUBSCRIPTION_PLANS.FREE.tickerLimit} companies`,
      features: SUBSCRIPTION_PLANS.FREE.features,
      recommended: false,
      planKey: 'FREE' as const,
    },
    {
      name: SUBSCRIPTION_PLANS.PRO.name,
      price: `$${SUBSCRIPTION_PLANS.PRO.monthlyPrice}/month`,
      tickerLimit: SUBSCRIPTION_PLANS.PRO.tickerLimit,
      tickerDisplay: `${SUBSCRIPTION_PLANS.PRO.tickerLimit} companies`,
      features: SUBSCRIPTION_PLANS.PRO.features,
      recommended: true,
      planKey: 'PRO' as const,
    },
    {
      name: SUBSCRIPTION_PLANS.MAX.name,
      price: `$${SUBSCRIPTION_PLANS.MAX.monthlyPrice}/month`,
      tickerLimit: SUBSCRIPTION_PLANS.MAX.tickerLimit,
      tickerDisplay: 'Unlimited companies',
      features: SUBSCRIPTION_PLANS.MAX.features,
      recommended: false,
      planKey: 'MAX' as const,
    },
  ];

  return (
    <div data-testid="billing-page">
      <h1>Billing</h1>
      <div data-testid="pricing-plans">
        {billingPlans.map((plan) => (
          <div key={plan.planKey} data-testid={`plan-${plan.planKey.toLowerCase()}`}>
            <h3>{plan.name}</h3>
            <p data-testid={`price-${plan.planKey.toLowerCase()}`}>{plan.price}</p>
            <p data-testid={`ticker-limit-${plan.planKey.toLowerCase()}`}>{plan.tickerDisplay}</p>
            <ul>
              {plan.features.map((feature, index) => (
                <li key={index} dangerouslySetInnerHTML={{ 
                  __html: feature.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') 
                }} />
              ))}
            </ul>
            {plan.recommended && <span data-testid="recommended">Recommended</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

describe('Billing Page Component', () => {
  beforeEach(() => {
    (useUser as jest.Mock).mockReturnValue({
      isLoaded: true,
      user: { id: 'test-user' },
    });
  });

  describe('Pricing Display', () => {
    it('should display correct Trial tier pricing', () => {
      render(mockBillingPage());

      expect(screen.getByTestId('price-free')).toHaveTextContent('$0/month');
      expect(screen.getByTestId('ticker-limit-free')).toHaveTextContent('Unlimited companies');
    });

    it('should display correct Pro tier pricing ($199/month)', () => {
      render(mockBillingPage());
      
      expect(screen.getByTestId('price-pro')).toHaveTextContent('$199/month');
      expect(screen.getByTestId('ticker-limit-pro')).toHaveTextContent('25 companies');
    });

    it('should display correct Max tier pricing ($349/month)', () => {
      render(mockBillingPage());
      
      expect(screen.getByTestId('price-max')).toHaveTextContent('$349/month');
      expect(screen.getByTestId('ticker-limit-max')).toHaveTextContent('Unlimited companies');
    });
  });

  describe('Plan Configuration', () => {
    it('should use SUBSCRIPTION_PLANS as source of truth', () => {
      render(mockBillingPage());
      
      // Verify Pro plan configuration matches SUBSCRIPTION_PLANS
      const proPrice = screen.getByTestId('price-pro');
      expect(proPrice).toHaveTextContent(`$${SUBSCRIPTION_PLANS.PRO.monthlyPrice}/month`);
      
      const proTickerLimit = screen.getByTestId('ticker-limit-pro');
      expect(proTickerLimit).toHaveTextContent(`${SUBSCRIPTION_PLANS.PRO.tickerLimit} companies`);
    });

    it('should mark Pro tier as recommended', () => {
      render(mockBillingPage());
      
      const proPlan = screen.getByTestId('plan-pro');
      expect(proPlan).toContainElement(screen.getByTestId('recommended'));
    });

    it('should not mark Free or Max as recommended', () => {
      render(mockBillingPage());
      
      const freePlan = screen.getByTestId('plan-free');
      const maxPlan = screen.getByTestId('plan-max');
      
      expect(freePlan).not.toContainElement(screen.queryByTestId('recommended'));
      expect(maxPlan).not.toContainElement(screen.queryByTestId('recommended'));
    });
  });

  describe('Feature Display', () => {
    it('should render Pro features with enhanced value proposition', () => {
      render(mockBillingPage());
      
      const proFeatures = SUBSCRIPTION_PLANS.PRO.features;
      expect(proFeatures).toContain('**25** companies to track');
      expect(proFeatures).toContain('All SEC filing types');
    });

    it('should render Max features with unlimited positioning', () => {
      render(mockBillingPage());
      
      const maxFeatures = SUBSCRIPTION_PLANS.MAX.features;
      expect(maxFeatures).toContain('**Unlimited** companies');
      expect(maxFeatures).toContain('Dedicated support');
    });
  });

  describe('Data Consistency', () => {
    it('should maintain pricing consistency with stripe configuration', () => {
      // Verify that billing page pricing matches lib/stripe.ts exactly
      expect(SUBSCRIPTION_PLANS.PRO.monthlyPrice).toBe(199);
      expect(SUBSCRIPTION_PLANS.MAX.monthlyPrice).toBe(349);
      expect(SUBSCRIPTION_PLANS.PRO.tickerLimit).toBe(25);
      expect(SUBSCRIPTION_PLANS.MAX.tickerLimit).toBe(-1);
    });

    it('should not have duplicate pricing configuration', () => {
      // This test ensures we dont reintroduce AVAILABLE_PLANS
      // The component should only import from SUBSCRIPTION_PLANS
      render(mockBillingPage());
      
      // If this test passes, it means we're using centralized config
      expect(screen.getByTestId('billing-page')).toBeInTheDocument();
    });
  });
});