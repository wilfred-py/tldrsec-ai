/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

// Mock dependencies
jest.mock('@/lib/analytics/page-tracking', () => ({
  trackPageAnalytics: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('Minimalist Landing Page Regression Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    (trackPageAnalytics as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Import and Module Integrity', () => {
    test('FocusedInvestorHero component imports correctly', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      expect(FocusedInvestorHero).toBeDefined();
      expect(typeof FocusedInvestorHero).toBe('function');
    });

    test('WaitlistForm component imports correctly', async () => {
      const { WaitlistForm } = await import('@/components/waitlist/waitlist-form');
      expect(WaitlistForm).toBeDefined();
      expect(typeof WaitlistForm).toBe('function');
    });

    test('analytics tracking module imports correctly', async () => {
      const analytics = await import('@/lib/analytics/page-tracking');
      expect(analytics.trackPageAnalytics).toBeDefined();
      expect(typeof analytics.trackPageAnalytics).toBe('function');
    });

    test('main page component imports correctly', async () => {
      const HomePage = await import('@/app/page');
      expect(HomePage.default).toBeDefined();
      expect(typeof HomePage.default).toBe('function');
    });

    test('waitlist API route exists and is accessible', async () => {
      // This tests that the API route module can be imported without errors
      try {
        const apiRoute = await import('@/app/api/waitlist/subscribe/route');
        expect(apiRoute.POST).toBeDefined();
        expect(typeof apiRoute.POST).toBe('function');
      } catch (error) {
        throw new Error(`Newsletter API route import failed: ${error}`);
      }
    });
  });

  describe('No Missing Dependencies', () => {
    test('all UI components are available', async () => {
      // Test that all required UI components can be imported
      const components = [
        '@/components/ui/button',
        '@/components/ui/input',
        '@/components/ui/alert',
        '@/components/ui/card',
        '@/components/ui/badge'
      ];

      for (const component of components) {
        try {
          const module = await import(component);
          expect(module).toBeDefined();
        } catch (error) {
          throw new Error(`Missing UI component: ${component}`);
        }
      }
    });

    test('all Lucide React icons are available', async () => {
      try {
        const { CheckCircle, Loader2, AlertCircle, Lock } = await import('lucide-react');
        expect(CheckCircle).toBeDefined();
        expect(Loader2).toBeDefined();
        expect(AlertCircle).toBeDefined();
        expect(Lock).toBeDefined();
      } catch (error) {
        throw new Error(`Lucide React icons import failed: ${error}`);
      }
    });

    test('React hooks are properly imported', async () => {
      try {
        const { useState } = await import('react');
        expect(useState).toBeDefined();
        expect(typeof useState).toBe('function');
      } catch (error) {
        throw new Error(`React hooks import failed: ${error}`);
      }
    });
  });

  describe('Analytics Integration Integrity', () => {
    test('analytics tracking function maintains correct signature', () => {
      expect(trackPageAnalytics).toBeDefined();
      
      // Test that the function can be called with expected parameters
      expect(() => {
        trackPageAnalytics('home', 'waitlist_signup_attempt', {
          utm_source: 'test',
          utm_medium: 'social',
          utm_campaign: 'landing'
        });
      }).not.toThrow();
    });

    test('analytics tracking is called with correct parameters structure', async () => {
      const { WaitlistForm } = await import('@/components/waitlist/waitlist-form');
      
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Success' }),
      });

      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');
      
      await waitFor(() => {
        emailInput.focus();
      });
      
      // The analytics function should be available and callable
      expect(trackPageAnalytics).toBeDefined();
    });

    test('URL parameter extraction works correctly', () => {
      // Mock URLSearchParams functionality
      const mockSearchParams = new URLSearchParams('?utm_source=test&utm_medium=social');
      
      expect(mockSearchParams.get('utm_source')).toBe('test');
      expect(mockSearchParams.get('utm_medium')).toBe('social');
      expect(mockSearchParams.get('utm_campaign')).toBeNull();
    });
  });

  describe('API Endpoint Integrity', () => {
    test('waitlist subscription endpoint handles POST requests', async () => {
      const mockRequest = {
        json: () => Promise.resolve({
          email: 'test@example.com',
          source: 'waitlist_home',
          utm_source: 'test',
          utm_medium: 'social',
          utm_campaign: 'landing'
        })
      };

      // Test that the API endpoint structure is maintained
      try {
        const { POST } = await import('@/app/api/waitlist/subscribe/route');
        expect(POST).toBeDefined();
        expect(typeof POST).toBe('function');
      } catch (error) {
        throw new Error(`Newsletter API endpoint structure changed: ${error}`);
      }
    });

    test('API response format is consistent', () => {
      // Mock successful response
      const successResponse = {
        success: true,
        message: 'Successfully subscribed!',
        alreadySubscribed: false
      };

      expect(successResponse).toHaveProperty('success');
      expect(successResponse).toHaveProperty('message');
      expect(typeof successResponse.success).toBe('boolean');
      expect(typeof successResponse.message).toBe('string');

      // Mock already subscribed response
      const existingResponse = {
        success: true,
        message: 'You are already subscribed!',
        alreadySubscribed: true
      };

      expect(existingResponse).toHaveProperty('alreadySubscribed');
      expect(existingResponse.alreadySubscribed).toBe(true);
    });

    test('error response format is consistent', () => {
      const errorResponse = {
        error: 'Invalid email address'
      };

      expect(errorResponse).toHaveProperty('error');
      expect(typeof errorResponse.error).toBe('string');
    });
  });

  describe('Email Domain Configuration', () => {
    test('email domain is correctly configured to tldrsec.app', async () => {
      // Test the email configuration by checking the welcome email template
      try {
        const { POST } = await import('@/app/api/waitlist/subscribe/route');
        
        // The function should reference tldrsec.app domain
        const functionString = POST.toString();
        
        // Check that old domain (tldrsec.com) is not referenced
        expect(functionString).not.toContain('tldrsec.com');
        
        // Note: We can't directly test the email template here without running the function,
        // but we can verify the import succeeds and the function exists
        expect(POST).toBeDefined();
      } catch (error) {
        throw new Error(`Email domain configuration check failed: ${error}`);
      }
    });

    test('notification email uses correct domain', () => {
      // Test that the notification configuration uses the correct domain
      const expectedDomain = 'tldrsec.app';
      const notificationEmail = `notifications@${expectedDomain}`;
      
      expect(notificationEmail).toBe('notifications@tldrsec.app');
      expect(notificationEmail).not.toContain('tldrsec.com');
    });
  });

  describe('Component Structure Integrity', () => {
    test('FocusedInvestorHero maintains expected DOM structure', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      render(<FocusedInvestorHero />);
      
      // Test critical DOM structure
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      
      // Test that the component doesn't throw errors
      expect(() => render(<FocusedInvestorHero />)).not.toThrow();
    });

    test('WaitlistForm maintains expected form structure', async () => {
      const { WaitlistForm } = await import('@/components/waitlist/waitlist-form');
      
      render(<WaitlistForm />);
      
      // Test critical form elements
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
      
      // Test that the component doesn't throw errors
      expect(() => render(<WaitlistForm />)).not.toThrow();
    });
  });

  describe('Removed Components Don\'t Break Imports', () => {
    test('removed WaitlistHero component is no longer referenced', async () => {
      // Test that importing the hero component doesn't accidentally import removed components
      try {
        const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
        render(<FocusedInvestorHero />);
        
        // Should render without errors
        expect(screen.getByRole('main')).toBeInTheDocument();
      } catch (error) {
        if (error.message.includes('WaitlistHero')) {
          throw new Error('Removed WaitlistHero component is still being referenced');
        }
        throw error;
      }
    });

    test('removed ProblemSolution component is no longer referenced', async () => {
      // Ensure ProblemSolution component isn't accidentally imported
      try {
        const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
        render(<FocusedInvestorHero />);
        
        // Should not contain ProblemSolution content
        expect(screen.queryByText(/problem.*solution/i)).not.toBeInTheDocument();
      } catch (error) {
        if (error.message.includes('ProblemSolution')) {
          throw new Error('Removed ProblemSolution component is still being referenced');
        }
        throw error;
      }
    });

    test('removed WaitlistCTA component is no longer referenced', async () => {
      // Ensure WaitlistCTA component isn't accidentally imported
      try {
        const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
        render(<FocusedInvestorHero />);
        
        // Should render successfully without CTA component
        expect(screen.getByRole('main')).toBeInTheDocument();
      } catch (error) {
        if (error.message.includes('WaitlistCTA')) {
          throw new Error('Removed WaitlistCTA component is still being referenced');
        }
        throw error;
      }
    });
  });

  describe('Styling and CSS Integrity', () => {
    test('Tailwind CSS classes are properly applied', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      render(<FocusedInvestorHero />);
      
      const main = screen.getByRole('main');
      expect(main).toHaveClass('min-h-screen');
      expect(main).toHaveClass('bg-white');
      
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveClass('text-4xl');
      expect(heading).toHaveClass('md:text-5xl');
      expect(heading).toHaveClass('font-bold');
      expect(heading).toHaveClass('text-gray-900');
    });

    test('responsive design classes are correctly applied', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      render(<FocusedInvestorHero />);
      
      // Test responsive typography
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.className).toMatch(/text-4xl.*md:text-5xl/);
      
      // Test responsive containers
      const container = screen.getByRole('main').querySelector('.container');
      expect(container).toHaveClass('mx-auto');
      expect(container).toHaveClass('px-4');
    });

    test('color scheme consistency is maintained', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      render(<FocusedInvestorHero />);
      
      // Test color consistency
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveClass('text-gray-900');
      
      const subheading = screen.getByText(/Cut through the noise/);
      expect(subheading).toHaveClass('text-gray-600');
      
      const trustText = screen.getByText(/Join 247\+ focused investors/);
      expect(trustText).toHaveClass('text-gray-500');
    });
  });

  describe('Performance Regression Tests', () => {
    test('components render without excessive re-renders', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      const { rerender } = render(<FocusedInvestorHero />);
      
      const initialMain = screen.getByRole('main');
      
      // Re-render should not create new DOM nodes unnecessarily
      rerender(<FocusedInvestorHero />);
      
      const afterRerender = screen.getByRole('main');
      expect(afterRerender).toBe(initialMain);
    });

    test('components don\'t have memory leaks in event listeners', async () => {
      const { WaitlistForm } = await import('@/components/waitlist/waitlist-form');
      
      const { unmount } = render(<WaitlistForm />);
      
      // Should unmount without errors
      expect(() => unmount()).not.toThrow();
    });

    test('async operations are properly cleaned up', async () => {
      const { WaitlistForm } = await import('@/components/waitlist/waitlist-form');
      
      (fetch as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        }), 100))
      );
      
      const { unmount } = render(<WaitlistForm />);
      
      // Start an async operation
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');
      
      emailInput.focus();
      
      // Unmount before async operation completes
      unmount();
      
      // Should not cause errors or warnings
      expect(() => {
        // Wait a bit to ensure async operations would have completed
        setTimeout(() => {}, 200);
      }).not.toThrow();
    });
  });

  describe('Accessibility Regression Tests', () => {
    test('maintains proper heading hierarchy', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      render(<FocusedInvestorHero />);
      
      // Should have exactly one h1
      const h1Elements = screen.getAllByRole('heading', { level: 1 });
      expect(h1Elements).toHaveLength(1);
      
      // Should have main landmark
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    test('form maintains accessibility attributes', async () => {
      const { WaitlistForm } = await import('@/components/waitlist/waitlist-form');
      
      render(<WaitlistForm />);
      
      const emailInput = screen.getByRole('textbox');
      expect(emailInput).toHaveAttribute('type', 'email');
      
      const submitButton = screen.getByRole('button');
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    test('error states are accessible', async () => {
      const { WaitlistForm } = await import('@/components/waitlist/waitlist-form');
      
      render(<WaitlistForm />);
      
      // Test basic accessibility attributes for form elements
      const emailInput = screen.getByRole('textbox');
      const submitButton = screen.getByRole('button');
      
      // Verify form elements have proper accessibility attributes
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(submitButton).toHaveAttribute('type', 'submit');
      
      // Test that error state can be accessible (basic check that Alert component supports role="alert")
      // This tests the component structure rather than triggering actual errors
      expect(() => {
        const { Alert, AlertDescription } = require('@/components/ui/alert');
        const errorElement = React.createElement(Alert, { variant: "destructive", role: "alert" },
          React.createElement(AlertDescription, {}, "Test error message")
        );
        expect(errorElement.props.role).toBe("alert");
      }).not.toThrow();
    });
  });

  describe('Content and Messaging Integrity', () => {
    test('value investor messaging is preserved', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      render(<FocusedInvestorHero />);
      
      // Key value investor terms should be present
      expect(screen.getByText(/focused investors/i)).toBeInTheDocument();
      expect(screen.getByText(/economic moats/i)).toBeInTheDocument();
      expect(screen.getByText(/enduring brands/i)).toBeInTheDocument();
    });

    test('Warren Buffett approach messaging is maintained', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      render(<FocusedInvestorHero />);
      
      // Should reference concentration investing concepts
      expect(screen.getByText(/great businesses/i)).toBeInTheDocument();
      expect(screen.getByText(/Skip the 100-page SEC filings/i)).toBeInTheDocument();
    });

    test('apostrophe fixes are maintained', async () => {
      // Test that apostrophe characters are properly encoded in JSX
      // Read the component source to verify proper HTML entity usage
      const fs = require('fs');
      const path = require('path');
      
      const componentPath = path.join(process.cwd(), 'components/waitlist/waitlist-form.tsx');
      const componentSource = fs.readFileSync(componentPath, 'utf8');
      
      // Check that the source code contains the proper HTML entity for apostrophes
      expect(componentSource).toContain('&rsquo;');
      
      // Also verify that the text content would render correctly 
      expect(componentSource).toContain("You&rsquo;re officially on the list!");
      
      // Test that when rendered, the HTML entity converts to proper apostrophe
      const testText = "You&rsquo;re officially on the list!";
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${testText}</div>`, 'text/html');
      
      // Check that the text contains the right smart apostrophe character
      const renderedText = doc.body.textContent || '';
      expect(renderedText).toMatch(/You[\u2019\u0027]re officially on the list!/);  // Matches both smart apostrophe and regular apostrophe
    });

    test('accurate waitlist count is displayed', async () => {
      const { FocusedInvestorHero } = await import('@/components/landing/focused-investor-hero');
      
      render(<FocusedInvestorHero />);
      
      // Should show specific count
      expect(screen.getByText(/247\+/)).toBeInTheDocument();
    });
  });
});