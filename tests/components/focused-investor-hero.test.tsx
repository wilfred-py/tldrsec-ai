/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

// Mock dependencies
jest.mock('@/lib/analytics/page-tracking', () => ({
  trackPageAnalytics: jest.fn(),
}));

// Mock the WaitlistForm component
jest.mock('@/components/waitlist/waitlist-form', () => ({
  WaitlistForm: () => (
    <div data-testid="waitlist-form">
      <input 
        type="email" 
        placeholder="Enter your email for early access"
        data-testid="email-input"
      />
      <button type="submit" data-testid="submit-button">
        Get Business Insights
      </button>
    </div>
  ),
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe('FocusedInvestorHero Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    test('renders main heading with correct value proposition', () => {
      render(<FocusedInvestorHero />);
      
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent(/Skip the 100-page SEC filings/i);
      expect(heading).toHaveTextContent(/complex legal and financial jargon/i);
    });

    test('renders subheading with value investor messaging', () => {
      render(<FocusedInvestorHero />);
      
      const subheading = screen.getByText(/Cut through the noise/i);
      expect(subheading).toBeInTheDocument();
      expect(subheading).toHaveTextContent(/economic moats and enduring brands/i);
    });

    test('renders trust indicator with waitlist count', () => {
      render(<FocusedInvestorHero />);
      
      const trustText = screen.getByText(/Join 247\+ focused investors on the waitlist/i);
      expect(trustText).toBeInTheDocument();
    });

    test('renders waitlist form component', () => {
      render(<FocusedInvestorHero />);
      
      const waitlistForm = screen.getByTestId('waitlist-form');
      expect(waitlistForm).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    test('applies responsive text sizing classes', () => {
      render(<FocusedInvestorHero />);
      
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveClass('text-4xl', 'md:text-5xl');
      
      const subheading = screen.getByText(/Cut through the noise/i);
      expect(subheading).toHaveClass('text-lg', 'md:text-xl');
    });

    test('uses responsive container layout', () => {
      render(<FocusedInvestorHero />);
      
      const container = screen.getByRole('main');
      expect(container).toHaveClass('min-h-screen', 'bg-white');
      
      const innerContainer = container.querySelector('.container');
      expect(innerContainer).toHaveClass('mx-auto', 'px-4', 'py-24');
    });

    test('applies responsive spacing and layout constraints', () => {
      render(<FocusedInvestorHero />);
      
      const contentWrapper = screen.getByRole('main').querySelector('.max-w-2xl');
      expect(contentWrapper).toHaveClass('max-w-2xl', 'mx-auto', 'text-center');
    });
  });

  describe('Accessibility', () => {
    test('has proper heading hierarchy', () => {
      render(<FocusedInvestorHero />);
      
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      
      // Verify no other h1 elements
      const allH1s = screen.getAllByRole('heading', { level: 1 });
      expect(allH1s).toHaveLength(1);
    });

    test('has main landmark role', () => {
      render(<FocusedInvestorHero />);
      
      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });

    test('text content is readable and accessible', () => {
      render(<FocusedInvestorHero />);
      
      // Check for descriptive text content
      expect(screen.getByText(/Skip the 100-page SEC filings/i)).toBeInTheDocument();
      expect(screen.getByText(/Cut through the noise/i)).toBeInTheDocument();
      expect(screen.getByText(/Join 247\+ focused investors/i)).toBeInTheDocument();
    });

    test('has sufficient color contrast with proper text colors', () => {
      render(<FocusedInvestorHero />);
      
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveClass('text-gray-900');
      
      const subheading = screen.getByText(/Cut through the noise/i);
      expect(subheading).toHaveClass('text-gray-600');
      
      const trustText = screen.getByText(/Join 247\+ focused investors/i);
      expect(trustText).toHaveClass('text-gray-500');
    });
  });

  describe('Content Structure', () => {
    test('maintains proper content hierarchy', () => {
      render(<FocusedInvestorHero />);
      
      const main = screen.getByRole('main');
      const children = Array.from(main.children);
      
      // Verify container structure
      expect(children).toHaveLength(1);
      expect(children[0]).toHaveClass('container');
    });

    test('applies correct spacing and typography classes', () => {
      render(<FocusedInvestorHero />);
      
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveClass(
        'text-4xl',
        'md:text-5xl', 
        'font-bold',
        'text-gray-900',
        'leading-tight',
        'mb-6'
      );
      
      const subheading = screen.getByText(/Cut through the noise/i);
      expect(subheading).toHaveClass(
        'text-lg',
        'md:text-xl',
        'text-gray-600', 
        'mb-12',
        'leading-relaxed'
      );
    });

    test('form container has correct styling', () => {
      render(<FocusedInvestorHero />);
      
      const formContainer = screen.getByTestId('waitlist-form').parentElement;
      expect(formContainer).toHaveClass('max-w-md', 'mx-auto');
    });

    test('trust indicator has correct styling', () => {
      render(<FocusedInvestorHero />);
      
      const trustText = screen.getByText(/Join 247\+ focused investors/i);
      expect(trustText).toHaveClass('text-sm', 'text-gray-500', 'mt-8');
    });
  });

  describe('Edge Cases', () => {
    test('renders correctly with minimal props', () => {
      render(<FocusedInvestorHero />);
      
      // Should render without errors even with no props
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByTestId('waitlist-form')).toBeInTheDocument();
    });

    test('handles window resize events gracefully', () => {
      render(<FocusedInvestorHero />);
      
      // Simulate window resize
      global.innerWidth = 768;
      global.dispatchEvent(new Event('resize'));
      
      // Component should remain stable
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    test('component renders efficiently without unnecessary re-renders', () => {
      const { rerender } = render(<FocusedInvestorHero />);
      
      const initialHeading = screen.getByRole('heading', { level: 1 });
      
      // Re-render with same props
      rerender(<FocusedInvestorHero />);
      
      const afterRerender = screen.getByRole('heading', { level: 1 });
      expect(afterRerender).toBe(initialHeading);
    });

    test('component structure is optimized for layout', () => {
      render(<FocusedInvestorHero />);
      
      // Verify clean DOM structure
      const main = screen.getByRole('main');
      expect(main.children).toHaveLength(1); // Single container
      
      const container = main.children[0];
      expect(container.children).toHaveLength(1); // Single content wrapper
    });
  });

  describe('Content Accuracy', () => {
    test('messaging targets retail focused investors', () => {
      render(<FocusedInvestorHero />);
      
      // Verify value investor focused messaging
      expect(screen.getByText(/focused investors/i)).toBeInTheDocument();
      expect(screen.getByText(/economic moats/i)).toBeInTheDocument();
      expect(screen.getByText(/enduring brands/i)).toBeInTheDocument();
    });

    test('problem statement is clear and specific', () => {
      render(<FocusedInvestorHero />);
      
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent(/100-page SEC filings/i);
      expect(heading).toHaveTextContent(/complex legal and financial jargon/i);
    });

    test('solution is clearly positioned', () => {
      render(<FocusedInvestorHero />);
      
      const subheading = screen.getByText(/Cut through the noise/i);
      expect(subheading).toHaveTextContent(/clear insights/i);
      expect(subheading).toHaveTextContent(/great businesses/i);
    });

    test('waitlist count is accurate and compelling', () => {
      render(<FocusedInvestorHero />);
      
      const trustText = screen.getByText(/247\+/i);
      expect(trustText).toBeInTheDocument();
    });
  });

  describe('Integration Points', () => {
    test('integrates properly with WaitlistForm component', () => {
      render(<FocusedInvestorHero />);
      
      const form = screen.getByTestId('waitlist-form');
      expect(form).toBeInTheDocument();
      
      // Verify form is properly positioned
      const formContainer = form.parentElement;
      expect(formContainer).toHaveClass('max-w-md', 'mx-auto');
    });

    test('maintains consistent brand messaging', () => {
      render(<FocusedInvestorHero />);
      
      // Verify consistent tone and messaging
      expect(screen.getByText(/focused investors/i)).toBeInTheDocument();
      expect(screen.getByText(/business insights/i)).toBeInTheDocument();
    });
  });
});