import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PricingSection3Tier } from '@/components/landing/pricing-section-3-tier';

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe('PricingSection3Tier - PRO + MAX (CC-required trial)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Display only PRO and MAX tiers (no FREE)
  it('should display PRO and MAX tiers with trial framing', () => {
    render(<PricingSection3Tier />);

    expect(screen.getByText('PRO')).toBeInTheDocument();
    expect(screen.getByText('MAX')).toBeInTheDocument();
    expect(screen.getByText('$199')).toBeInTheDocument();
    expect(screen.getByText('$349')).toBeInTheDocument();
    expect(screen.getByText('25 companies to track')).toBeInTheDocument();
    expect(screen.getByText('Unlimited companies')).toBeInTheDocument();
    // Trial framing text
    expect(screen.getByText('7-day free trial — then $199/mo')).toBeInTheDocument();
    expect(screen.getByText('7-day free trial — then $349/mo')).toBeInTheDocument();
    // Outcome-first heading
    expect(screen.getByText('Never miss another filing')).toBeInTheDocument();
  });

  // Test 2: API call for PRO plan via "Start Free Trial" buttons
  it('should call checkout API for PRO plan', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionUrl: 'https://checkout.stripe.com/test' })
    });
    global.fetch = mockFetch;

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    render(<PricingSection3Tier />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    // PRO card is "popular" and rendered first — click the first "Start Free Trial"
    const buttons = screen.getAllByText('Start Free Trial');
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          planType: 'PRO'
        })
      });
    });
  });

  // Test 3: API call for MAX plan
  it('should call checkout API for MAX plan', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionUrl: 'https://checkout.stripe.com/test' })
    });
    global.fetch = mockFetch;

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    render(<PricingSection3Tier />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    // MAX card is second — click the second "Start Free Trial"
    const buttons = screen.getAllByText('Start Free Trial');
    fireEvent.click(buttons[1]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          planType: 'MAX'
        })
      });
    });
  });

  // Test 4: Both buttons say "Start Free Trial"
  it('should show "Start Free Trial" on both plan buttons', () => {
    render(<PricingSection3Tier />);
    const buttons = screen.getAllByText('Start Free Trial');
    expect(buttons).toHaveLength(2);
  });
});
