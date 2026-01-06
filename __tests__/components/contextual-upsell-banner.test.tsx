import { render, screen } from '@testing-library/react';
import { ContextualUpsellBanner } from '@/components/dashboard/contextual-upsell-banner';

describe('ContextualUpsellBanner - FREE→PRO→MAX', () => {
  // Test 1: FREE to PRO upsell
  it('should show PRO upgrade for FREE users at limit', () => {
    render(
      <ContextualUpsellBanner 
        show={true}
        currentTier="FREE"
      />
    );
    
    expect(screen.getByText(/You've reached your 3 ticker limit/)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to/i)).toBeInTheDocument();
    expect(screen.getByText(/PRO/)).toBeInTheDocument();
    expect(screen.getByText(/199/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/billing');
  });

  // Test 2: PRO to MAX upsell
  it('should show MAX upgrade for PRO users at limit', () => {
    render(
      <ContextualUpsellBanner 
        show={true}
        currentTier="PRO"
      />
    );
    
    expect(screen.getByText(/You've reached your 25 ticker limit/)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to/i)).toBeInTheDocument();
    expect(screen.getByText(/MAX/)).toBeInTheDocument();
    expect(screen.getByText(/349/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/billing');
  });

  // Test 3: No upsell for MAX users
  it('should not show upsell for MAX users', () => {
    render(
      <ContextualUpsellBanner 
        show={true}
        currentTier="MAX"
      />
    );
    
    expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/limit/i)).not.toBeInTheDocument();
  });

  // Test 4: Hidden when show=false
  it('should not render when show is false', () => {
    render(
      <ContextualUpsellBanner 
        show={false}
        currentTier="FREE"
      />
    );
    
    expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/limit/i)).not.toBeInTheDocument();
  });
});