/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomePage from '@/app/page';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

// Mock dependencies
jest.mock('@/lib/analytics/page-tracking', () => ({
  trackPageAnalytics: jest.fn(),
}));

// Mock Next.js metadata
jest.mock('@/app/page', () => {
  const { FocusedInvestorHero } = require('@/components/landing/focused-investor-hero');
  const Component = () => <FocusedInvestorHero />;
  Component.generateMetadata = jest.fn(() => Promise.resolve({
    title: 'SEC Filing Insights for Value Investors',
    description: 'Cut through complex legal jargon. Get clear insights on great businesses with economic moats and predictable earnings.',
  }));
  return {
    __esModule: true,
    default: Component,
    generateMetadata: Component.generateMetadata,
  };
});

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock window.location for URL parameters
const mockLocation = {
  search: '?utm_source=test&utm_medium=social&utm_campaign=landing',
  href: 'https://tldrsec.app/?utm_source=test&utm_medium=social&utm_campaign=landing',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

// Mock localStorage for visitor ID generation
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock window.navigator for user agent
Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
  writable: true,
});

describe('E2E Conversion Flow Simulation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    (trackPageAnalytics as jest.Mock).mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Conversion Journey', () => {
    test('full user journey from landing to successful conversion', async () => {
      const user = userEvent.setup();
      
      // Mock successful API response
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          message: 'Successfully subscribed!',
          alreadySubscribed: false
        }),
      });

      // Mock visitor ID generation
      localStorageMock.getItem.mockReturnValueOnce(null);

      // Render the full home page
      render(<HomePage />);

      // STEP 1: Page loads and displays correctly
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Skip the 100-page SEC filings/);
      expect(screen.getByText(/Cut through the noise/)).toBeInTheDocument();

      // STEP 2: User sees and reads value proposition
      expect(screen.getByText(/economic moats and enduring brands/)).toBeInTheDocument();
      expect(screen.getByText(/247\+ focused investors/)).toBeInTheDocument();

      // STEP 3: User interacts with email form
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('placeholder', 'Enter your email for early access');
      expect(submitButton).toBeDisabled(); // Initially disabled

      // STEP 4: User types valid email
      await user.type(emailInput, 'investor@example.com');
      expect(submitButton).toBeEnabled(); // Now enabled

      // STEP 5: User submits form
      await act(async () => {
        await user.click(submitButton);
      });

      // STEP 6: Loading state is shown
      await waitFor(() => {
        expect(screen.getByText('Securing your spot...')).toBeInTheDocument();
      }, { timeout: 3000 });
      expect(submitButton).toBeDisabled();
      expect(emailInput).toBeDisabled();

      // STEP 7: Analytics tracking is called correctly
      await waitFor(() => {
        expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_attempt', {
          utm_source: 'test',
          utm_medium: 'social',
          utm_campaign: 'landing',
        });
      }, { timeout: 3000 });

      // STEP 8: API call is made with correct data
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/waitlist/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'investor@example.com',
            source: 'waitlist_home',
            utm_source: 'test',
            utm_medium: 'social',
            utm_campaign: 'landing',
          }),
        });
      }, { timeout: 3000 });

      // STEP 9: Success state is displayed
      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
        expect(screen.getByText('🎉 Welcome to Early Access')).toBeInTheDocument();
        expect(screen.getByText(/Check your email for confirmation/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // STEP 10: Success analytics tracking is called
      await waitFor(() => {
        expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_success');
      }, { timeout: 3000 });

      // STEP 11: Success state shows trust indicators
      expect(screen.getByText('Value-focused')).toBeInTheDocument();
      expect(screen.getByText('Secure & private')).toBeInTheDocument();

      // STEP 12: Visitor ID is generated and stored
      expect(localStorageMock.setItem).toHaveBeenCalledWith('visitor_id', expect.any(String));
    });

    test('conversion journey with existing subscriber', async () => {
      const user = userEvent.setup();
      
      // Mock already subscribed response
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          message: 'You are already subscribed!',
          alreadySubscribed: true
        }),
      });

      render(<HomePage />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      await user.type(emailInput, 'existing@example.com');
      
      await act(async () => {
        await user.click(submitButton);
      });

      // Should show already subscribed message
      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
        expect(screen.getByText(/You were already subscribed/)).toBeInTheDocument();
        expect(screen.getByText(/continue to receive updates/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Analytics should still be tracked
      expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_success');
    });

    test('error handling and recovery flow', async () => {
      const user = userEvent.setup();
      
      // Mock error response for first attempt
      (fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
        });

      render(<HomePage />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      // First attempt fails
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        await user.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Form should be re-enabled for retry
      expect(submitButton).toBeEnabled();
      expect(emailInput).toBeEnabled();

      // Second attempt succeeds
      await act(async () => {
        await user.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Responsive Design Journey', () => {
    test('mobile viewport conversion flow', async () => {
      const user = userEvent.setup();
      
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 375,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        value: 667,
      });

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      // Verify mobile layout
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveClass('text-4xl', 'md:text-5xl');

      const subheading = screen.getByText(/Cut through the noise/);
      expect(subheading).toHaveClass('text-lg', 'md:text-xl');

      // Complete mobile conversion flow
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      await user.type(emailInput, 'mobile@example.com');
      
      await act(async () => {
        await user.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify mobile success state
      expect(screen.getByText('Value-focused')).toBeInTheDocument();
      expect(screen.getByText('Secure & private')).toBeInTheDocument();
    });

    test('desktop viewport conversion flow', async () => {
      const user = userEvent.setup();
      
      // Mock desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 1280,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        value: 720,
      });

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      // Verify desktop layout
      const main = screen.getByRole('main');
      expect(main).toHaveClass('min-h-screen', 'bg-white');

      // Complete desktop conversion flow
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      await user.type(emailInput, 'desktop@example.com');
      
      await act(async () => {
        await user.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Analytics and Tracking Journey', () => {
    test('UTM parameter tracking throughout conversion', async () => {
      const user = userEvent.setup();
      
      // Test with different UTM parameters
      Object.defineProperty(window, 'location', {
        value: {
          ...mockLocation,
          search: '?utm_source=facebook&utm_medium=cpc&utm_campaign=q4-launch',
        },
        writable: true,
      });

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      await user.type(emailInput, 'utm@example.com');
      
      await act(async () => {
        await user.click(submitButton);
      });

      // Verify UTM parameters are tracked in analytics
      await waitFor(() => {
        expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_attempt', {
          utm_source: 'facebook',
          utm_medium: 'cpc',
          utm_campaign: 'q4-launch',
        });
      }, { timeout: 3000 });

      // Verify UTM parameters are sent to API
      await waitFor(() => {
        const apiCall = (fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(apiCall[1].body);
        
        expect(requestBody.utm_source).toBe('facebook');
        expect(requestBody.utm_medium).toBe('cpc');
        expect(requestBody.utm_campaign).toBe('q4-launch');
      }, { timeout: 3000 });
    });

    test('visitor ID generation and persistence', async () => {
      const user = userEvent.setup();
      
      // First visit - no visitor ID
      localStorageMock.getItem.mockReturnValueOnce(null);
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      await user.type(emailInput, 'visitor@example.com');
      
      await act(async () => {
        await user.click(submitButton);
      });

      // Visitor ID should be generated and stored
      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith('visitor_id', expect.any(String));
      }, { timeout: 3000 });

      // Return visit - existing visitor ID
      const existingVisitorId = 'existing-visitor-123';
      localStorageMock.getItem.mockReturnValueOnce(existingVisitorId);

      render(<HomePage />);

      // Should use existing visitor ID
      expect(localStorageMock.getItem).toHaveBeenCalledWith('visitor_id');
    });

    test('referrer tracking in analytics', async () => {
      const user = userEvent.setup();
      
      // Mock document.referrer
      Object.defineProperty(document, 'referrer', {
        value: 'https://google.com',
        writable: true,
      });

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      await user.type(emailInput, 'referrer@example.com');
      
      await act(async () => {
        await user.click(submitButton);
      });

      // Analytics should include referrer information
      await waitFor(() => {
        expect(trackPageAnalytics).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('Accessibility Journey', () => {
    test('keyboard navigation conversion flow', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      // Tab to email input
      fireEvent.keyDown(document, { key: 'Tab' });
      
      const emailInput = screen.getByRole('textbox');
      expect(emailInput).toHaveFocus();

      // Type email using keyboard
      fireEvent.change(emailInput, { target: { value: 'keyboard@example.com' } });

      // Tab to submit button
      fireEvent.keyDown(emailInput, { key: 'Tab' });
      
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      expect(submitButton).toHaveFocus();

      // Submit using Enter key
      await act(async () => {
        fireEvent.keyDown(submitButton, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('screen reader accessible conversion flow', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      // Verify proper heading hierarchy
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();

      // Verify main landmark
      expect(screen.getByRole('main')).toBeInTheDocument();

      // Verify form accessibility
      const emailInput = screen.getByRole('textbox');
      expect(emailInput).toHaveAttribute('type', 'email');

      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      expect(submitButton).toHaveAttribute('type', 'submit');

      // Complete accessible form submission
      await act(async () => {
        fireEvent.change(emailInput, { target: { value: 'accessible@example.com' } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('error state accessibility', async () => {
      const user = userEvent.setup();
      
      render(<HomePage />);

      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      // Submit empty form to trigger error
      await act(async () => {
        await user.click(submitButton);
      });

      await waitFor(() => {
        // Error should be in alert role for screen readers
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent('Please enter a valid email address');
      }, { timeout: 3000 });
    });
  });

  describe('Edge Cases and Performance', () => {
    test('double submission prevention', async () => {
      const user = userEvent.setup();
      
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      (fetch as jest.Mock).mockReturnValueOnce(delayedPromise);

      render(<HomePage />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      await user.type(emailInput, 'double@example.com');
      
      // Double click rapidly
      await act(async () => {
        await user.click(submitButton);
        await user.click(submitButton);
      });

      // Only one API call should be made
      expect(fetch).toHaveBeenCalledTimes(1);

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
        });
      });
    });

    test('special characters in email handling', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      // Test email with special characters
      const specialEmail = 'test+tag@sub-domain.example-site.com';
      await user.type(emailInput, specialEmail);
      
      await act(async () => {
        await user.click(submitButton);
      });

      await waitFor(() => {
        const apiCall = (fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(apiCall[1].body);
        expect(requestBody.email).toBe(specialEmail);
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('very long email address handling', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<HomePage />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });

      // Test very long email
      const longEmail = 'a'.repeat(100) + '@example.com';
      await user.type(emailInput, longEmail);
      
      await act(async () => {
        await user.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });
});