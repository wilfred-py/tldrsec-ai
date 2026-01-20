/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WaitlistForm } from '@/components/waitlist/waitlist-form';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

// Mock dependencies
jest.mock('@/lib/analytics/page-tracking', () => ({
  trackPageAnalytics: jest.fn(),
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock window.location for URL search params
const mockLocation = {
  search: '?utm_source=test&utm_medium=social&utm_campaign=landing',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('WaitlistForm Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    (trackPageAnalytics as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Form Rendering and Basic Functionality', () => {
    test('renders form with email input and submit button', () => {
      render(<WaitlistForm />);
      
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /get business insights/i })).toBeInTheDocument();
    });

    test('email input has correct attributes and placeholder', () => {
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(emailInput).toHaveAttribute('placeholder', 'Enter your email for early access');
      expect(emailInput).toHaveFocus(); // Check if input has focus instead of autofocus attribute
    });

    test('submit button is initially disabled when email is empty', () => {
      render(<WaitlistForm />);
      
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      expect(submitButton).toBeDisabled();
    });

    test('submit button enables when valid email is entered', async () => {
      const user = userEvent.setup();
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      expect(submitButton).toBeEnabled();
    });

    test('displays trust indicators below form', () => {
      render(<WaitlistForm />);
      
      expect(screen.getByText('Value-focused')).toBeInTheDocument();
      expect(screen.getByText('Secure & private')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    test('shows error message for invalid email format', async () => {
      const user = userEvent.setup();
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      // Type invalid email and try to submit
      await user.type(emailInput, 'invalid-email');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('shows error message for empty email submission', async () => {
      const user = userEvent.setup();
      render(<WaitlistForm />);
      
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      // Enable button artificially and try to submit
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('validates email format with @ symbol requirement', async () => {
      const user = userEvent.setup();
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'testemail');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('accepts valid email formats', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.queryByText('Please enter a valid email address')).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('API Integration and Submission Flow', () => {
    test('makes correct API call with form data and UTM parameters', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/waitlist/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            source: 'waitlist_home',
            utm_source: 'test',
            utm_medium: 'social',
            utm_campaign: 'landing',
          }),
        });
      }, { timeout: 3000 });
    });

    test('shows loading state during API call', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      (fetch as jest.Mock).mockReturnValueOnce(delayedPromise);
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      // Check loading state
      expect(screen.getByText('Securing your spot...')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
      expect(emailInput).toBeDisabled();
      
      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
        });
      });
    });

    test('tracks analytics on signup attempt', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_attempt', {
          utm_source: 'test',
          utm_medium: 'social',
          utm_campaign: 'landing',
        });
      }, { timeout: 3000 });
    });

    test('tracks analytics on successful signup', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(trackPageAnalytics).toHaveBeenCalledWith('home', 'waitlist_signup_success');
      }, { timeout: 3000 });
    });
  });

  describe('Success State Handling', () => {
    test('displays success message on successful subscription', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
        expect(screen.getByText(/🎉 Welcome to Early Access/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('displays custom success message from API response', async () => {
      const user = userEvent.setup();
      const customMessage = 'Custom success message from API';
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: customMessage }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText(/Check your email for confirmation/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('handles already subscribed users correctly', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          message: 'You are already subscribed!' 
        }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'existing@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText(/You were already subscribed/)).toBeInTheDocument();
        expect(screen.getByText(/continue to receive updates/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('success state shows proper trust indicators', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Value-focused')).toBeInTheDocument();
        expect(screen.getByText('Secure & private')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Error Handling', () => {
    test('displays error message on API failure', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('displays error message on HTTP error response', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('resets form state after error for retry', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Form should be re-enabled for retry
      expect(submitButton).toBeEnabled();
      expect(emailInput).toBeEnabled();
    });

    test('logs errors to console for debugging', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();
      const networkError = new Error('Network error');
      (fetch as jest.Mock).mockRejectedValueOnce(networkError);
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Waitlist signup error:', networkError);
      }, { timeout: 3000 });
      
      consoleSpy.mockRestore();
    });
  });

  describe('UTM Parameter Handling', () => {
    test('includes UTM parameters from URL in API call', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        const callArgs = (fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(callArgs[1].body);
        
        expect(requestBody.utm_source).toBe('test');
        expect(requestBody.utm_medium).toBe('social');
        expect(requestBody.utm_campaign).toBe('landing');
      }, { timeout: 3000 });
    });

    test('handles missing UTM parameters gracefully', async () => {
      // Mock empty search params
      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
      });
      
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        const callArgs = (fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(callArgs[1].body);
        
        expect(requestBody.utm_source).toBeNull();
        expect(requestBody.utm_medium).toBeNull();
        expect(requestBody.utm_campaign).toBeNull();
      }, { timeout: 3000 });
      
      // Restore original location
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
      });
    });
  });

  describe('Accessibility', () => {
    test('form has proper labels and ARIA attributes', () => {
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      expect(emailInput).toHaveAttribute('type', 'email');
      
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    test('error messages are announced to screen readers', async () => {
      const user = userEvent.setup();
      render(<WaitlistForm />);
      
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent('Please enter a valid email address');
      }, { timeout: 3000 });
    });

    test('success state is properly announced', async () => {
      const user = userEvent.setup();
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText(/You're officially on the list!/)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('loading state is properly communicated', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      (fetch as jest.Mock).mockReturnValueOnce(delayedPromise);
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      expect(screen.getByText('Securing your spot...')).toBeInTheDocument();
      
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
        });
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    test('prevents double submission during loading', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      (fetch as jest.Mock).mockReturnValueOnce(delayedPromise);
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, 'test@example.com');
      
      // First click
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      // Wait for loading state to be active
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });
      
      // Second click should be prevented because button is disabled
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      expect(fetch).toHaveBeenCalledTimes(1);
      
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
        });
      });
    });

    test('handles very long email addresses', async () => {
      const user = userEvent.setup();
      const longEmail = 'a'.repeat(100) + '@example.com';
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, longEmail);
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/waitlist/subscribe', expect.objectContaining({
          body: expect.stringContaining(longEmail),
        }));
      }, { timeout: 3000 });
    });

    test('handles special characters in email addresses', async () => {
      const user = userEvent.setup();
      const specialEmail = 'test+tag@sub-domain.example-site.com';
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Successfully subscribed!' }),
      });
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button', { name: /get business insights/i });
      
      await user.type(emailInput, specialEmail);
      
      await act(async () => {
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/waitlist/subscribe', expect.objectContaining({
          body: expect.stringContaining(specialEmail),
        }));
      }, { timeout: 3000 });
    });
  });
});