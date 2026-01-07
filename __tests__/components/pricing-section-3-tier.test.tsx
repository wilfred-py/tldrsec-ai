import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PricingSection3Tier } from '@/components/landing/pricing-section-3-tier';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('PricingSection3Tier - FREE + PRO + MAX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Display all three tiers
  it('should display FREE, PRO, and MAX tiers', () => {
    render(<PricingSection3Tier />);
    
    expect(screen.getByText('FREE')).toBeInTheDocument();
    expect(screen.getByText('PRO')).toBeInTheDocument();
    expect(screen.getByText('MAX')).toBeInTheDocument();
    expect(screen.getByText('$199')).toBeInTheDocument();
    expect(screen.getByText('$349')).toBeInTheDocument();
    expect(screen.getByText('3 companies to track')).toBeInTheDocument();
    expect(screen.getByText('25 companies to track')).toBeInTheDocument();
    expect(screen.getByText('Unlimited companies')).toBeInTheDocument();
  });

  // Test 2: API call for PRO plan
  it('should call checkout API for PRO plan', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionUrl: 'https://checkout.stripe.com/test' })
    });
    global.fetch = mockFetch;

    render(<PricingSection3Tier />);
    
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Start PRO'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/checkout/direct', {
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

    render(<PricingSection3Tier />);
    
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Start MAX'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/checkout/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          planType: 'MAX'
        })
      });
    });
  });

  // Test 4: FREE plan immediate redirect
  it('should handle FREE plan with immediate redirect', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ redirectUrl: '/onboarding', planType: 'FREE' })
    });
    global.fetch = mockFetch;

    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    render(<PricingSection3Tier />);
    
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Start FREE Trial'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/checkout/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          planType: 'FREE'
        })
      });
    });
  });
});