/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomePage from '@/app/page';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';
import { WaitlistForm } from '@/components/waitlist/waitlist-form';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

// Mock dependencies
jest.mock('@/lib/analytics/page-tracking', () => ({
  trackPageAnalytics: jest.fn(),
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock window.location for URL parameters
Object.defineProperty(window, 'location', {
  value: {
    search: '?utm_source=test&utm_medium=social&utm_campaign=landing',
    href: 'https://tldrsec.app/?utm_source=test&utm_medium=social&utm_campaign=landing',
  },
  writable: true,
});

// Mock localStorage for visitor ID generation
const localStorageMock = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Landing Page Comprehensive Coverage Tests', () => {
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

  describe('Critical Conversion Paths', () => {
    test('successful email submission and conversion', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          message: 'Successfully subscribed!',
          alreadySubscribed: false
        }),
      });

      render(<HomePage />);

      // 1. Verify landing page loads correctly
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Skip the 100-page SEC filings/);

      // 2. Verify form is present and functional
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      expect(emailInput).toHaveAttribute('placeholder', 'Enter your email for early access');
      expect(submitButton).toBeDisabled(); // Initially disabled

      // 3. User enters valid email
      await user.type(emailInput, 'success@example.com');
      expect(submitButton).toBeEnabled();

      // 4. User submits form
      await user.click(submitButton);

      // 5. Verify API call was made correctly
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/waitlist/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'success@example.com',
            source: 'waitlist_home',
            utm_source: 'test',
            utm_medium: 'social',
            utm_campaign: 'landing',
          }),
        });
      });

      // 6. Verify success state appears
      await waitFor(() => {
        expect(screen.getByText('You\'re officially on the list!')).toBeInTheDocument();
        expect(screen.getByText('🎉 Welcome to Early Access')).toBeInTheDocument();
      });

      // 7. Verify analytics tracking
      expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_attempt', {
        utm_source: 'test',
        utm_medium: 'social',
        utm_campaign: 'landing',
      });
      expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_success');
    });

    test('form validation prevents invalid submissions', async () => {
      const user = userEvent.setup();
      
      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      // Test invalid email
      await user.type(emailInput, 'invalid-email');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });

      // No API call should be made
      expect(fetch).not.toHaveBeenCalled();
    });

    test('error handling and retry capability', async () => {
      const user = userEvent.setup();
      
      // First call fails, second succeeds
      (fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
        });

      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      // First attempt
      await user.type(emailInput, 'retry@example.com');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
      });

      // Form should be re-enabled for retry
      expect(submitButton).toBeEnabled();
      expect(emailInput).toBeEnabled();

      // Second attempt
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('You\'re officially on the list!')).toBeInTheDocument();
      });
    });
  });

  describe('Mobile Responsiveness Validation', () => {
    test('responsive classes are correctly applied', () => {
      render(<FocusedInvestorHero />);

      // Test responsive typography
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveClass('text-4xl', 'md:text-5xl');

      const subheading = screen.getByText(/Cut through the noise/);
      expect(subheading).toHaveClass('text-lg', 'md:text-xl');
    });

    test('layout works on various screen sizes', () => {
      render(<FocusedInvestorHero />);

      // Test container and layout classes
      const main = screen.getByRole('main');
      expect(main).toHaveClass('min-h-screen', 'bg-white');

      const container = main.querySelector('.container');
      expect(container).toHaveClass('mx-auto', 'px-4', 'py-24');

      const contentWrapper = container?.querySelector('.max-w-2xl');
      expect(contentWrapper).toHaveClass('max-w-2xl', 'mx-auto', 'text-center');
    });
  });

  describe('Analytics Integration Validation', () => {
    test('UTM parameters are correctly tracked', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      await user.type(emailInput, 'utm@example.com');
      await user.click(submitButton);

      // Verify analytics call includes UTM parameters
      await waitFor(() => {
        expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_attempt', {
          utm_source: 'test',
          utm_medium: 'social',
          utm_campaign: 'landing',
        });
      });

      // Verify API call includes UTM parameters
      await waitFor(() => {
        const apiCall = (fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(apiCall[1].body);
        
        expect(requestBody.utm_source).toBe('test');
        expect(requestBody.utm_medium).toBe('social');
        expect(requestBody.utm_campaign).toBe('landing');
        expect(requestBody.source).toBe('waitlist_home');
      });
    });

    test('visitor ID is generated and stored', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      await user.type(emailInput, 'visitor@example.com');
      await user.click(submitButton);

      // Should generate and store visitor ID
      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith('visitor_id', expect.any(String));
      });
    });
  });

  describe('Accessibility Compliance', () => {
    test('proper heading hierarchy', () => {
      render(<FocusedInvestorHero />);

      // Should have exactly one h1
      const h1Elements = screen.getAllByRole('heading', { level: 1 });
      expect(h1Elements).toHaveLength(1);

      // Should have main landmark
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    test('form accessibility attributes', () => {
      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      expect(emailInput).toHaveAttribute('type', 'email');

      const submitButton = screen.getByRole('button');
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    test('error messages are accessible', async () => {
      const user = userEvent.setup();
      
      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      await user.type(emailInput, 'invalid');
      fireEvent.click(submitButton);

      await waitFor(() => {
        const errorMessage = screen.getByText('Please enter a valid email address');
        expect(errorMessage.closest('[role="alert"]')).toBeInTheDocument();
      });
    });

    test('keyboard navigation works', async () => {
      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      
      // Tab to email input
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(emailInput).toHaveFocus();

      // Type email
      fireEvent.change(emailInput, { target: { value: 'keyboard@example.com' } });

      // Tab to submit button
      fireEvent.keyDown(emailInput, { key: 'Tab' });
      
      const submitButton = screen.getByRole('button');
      expect(submitButton).toHaveFocus();
    });
  });

  describe('Content and Messaging Validation', () => {
    test('value investor messaging is accurate', () => {
      render(<FocusedInvestorHero />);

      // Key value investing terms
      expect(screen.getByText(/focused investors/i)).toBeInTheDocument();
      expect(screen.getByText(/economic moats/i)).toBeInTheDocument();
      expect(screen.getByText(/enduring brands/i)).toBeInTheDocument();
      expect(screen.getByText(/great businesses/i)).toBeInTheDocument();
    });

    test('problem statement is clear', () => {
      render(<FocusedInvestorHero />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent(/100-page SEC filings/);
      expect(heading).toHaveTextContent(/complex legal and financial jargon/);
    });

    test('solution positioning is clear', () => {
      render(<FocusedInvestorHero />);

      const subheading = screen.getByText(/Cut through the noise/);
      expect(subheading).toHaveTextContent(/clear insights/);
      expect(subheading).toHaveTextContent(/portfolio/);
    });

    test('trust indicators are present', () => {
      render(<FocusedInvestorHero />);

      expect(screen.getByText(/247\+ focused investors/)).toBeInTheDocument();
    });

    test('CTA messaging is compelling', () => {
      render(<WaitlistForm />);

      const submitButton = screen.getByRole('button');
      expect(submitButton).toHaveTextContent('Get Business Insights');

      const emailInput = screen.getByRole('textbox');
      expect(emailInput).toHaveAttribute('placeholder', 'Enter your email for early access');
    });
  });

  describe('Performance and Edge Cases', () => {
    test('prevents double submissions', async () => {
      const user = userEvent.setup();
      
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      (fetch as jest.Mock).mockReturnValueOnce(delayedPromise);

      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      await user.type(emailInput, 'double@example.com');
      
      // Double click rapidly
      await user.click(submitButton);
      await user.click(submitButton);

      // Only one API call should be made
      expect(fetch).toHaveBeenCalledTimes(1);

      // Resolve the promise
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
    });

    test('handles special characters in emails', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });

      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      const specialEmail = 'test+tag@sub-domain.example-site.com';
      await user.type(emailInput, specialEmail);
      await user.click(submitButton);

      await waitFor(() => {
        const apiCall = (fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(apiCall[1].body);
        expect(requestBody.email).toBe(specialEmail);
      });
    });

    test('component renders efficiently', () => {
      const { rerender } = render(<FocusedInvestorHero />);
      
      const initialMain = screen.getByRole('main');
      
      // Re-render should not create new DOM nodes unnecessarily
      rerender(<FocusedInvestorHero />);
      
      const afterRerender = screen.getByRole('main');
      expect(afterRerender).toBe(initialMain);
    });
  });

  describe('Success State Validation', () => {
    test('success state displays correctly', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          message: 'Successfully subscribed!',
          alreadySubscribed: false
        }),
      });

      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      await user.type(emailInput, 'success@example.com');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('You\'re officially on the list!')).toBeInTheDocument();
        expect(screen.getByText('🎉 Welcome to Early Access')).toBeInTheDocument();
        expect(screen.getByText(/Check your email for confirmation/)).toBeInTheDocument();
      });

      // Trust indicators should still be visible
      expect(screen.getByText('Value-focused')).toBeInTheDocument();
      expect(screen.getByText('Secure & private')).toBeInTheDocument();
    });

    test('handles already subscribed users', async () => {
      const user = userEvent.setup();
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          message: 'You are already subscribed!',
          alreadySubscribed: true
        }),
      });

      render(<WaitlistForm />);

      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');

      await user.type(emailInput, 'existing@example.com');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('You\'re officially on the list!')).toBeInTheDocument();
        expect(screen.getByText(/You were already subscribed/)).toBeInTheDocument();
        expect(screen.getByText(/continue to receive updates/)).toBeInTheDocument();
      });
    });
  });
});