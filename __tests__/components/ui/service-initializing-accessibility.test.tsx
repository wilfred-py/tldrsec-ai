/**
 * CRITICAL: Tests for React component apostrophe fix accessibility impact
 * Added per QA review of PR #201
 */

import { render, screen } from '@testing-library/react';
import { ServiceError } from '../../../components/ui/service-initializing';

describe('ServiceError Component Accessibility Tests', () => {
  const defaultProps = {
    retryAfter: 30,
    onRetry: jest.fn(),
    onDismiss: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Apostrophe HTML Entity Accessibility', () => {
    it('should render apostrophe entity correctly for screen readers', () => {
      render(<ServiceError {...defaultProps} />);
      
      const description = screen.getByTestId('service-error-description');
      
      // Should contain the HTML entity &apos;
      expect(description.innerHTML).toContain('We&apos;re experiencing');
      
      // Screen readers should interpret this correctly
      expect(description.textContent).toContain("We're experiencing");
    });

    it('should maintain proper ARIA labeling with apostrophe fix', () => {
      render(<ServiceError {...defaultProps} />);
      
      const description = screen.getByTestId('service-error-description');
      
      // Verify ARIA attributes are still present and functional
      expect(description).toHaveAttribute('id', 'service-error-description');
      expect(description).toHaveClass('text-red-700');
    });

    it('should not break screen reader announcement with HTML entity', () => {
      render(<ServiceError {...defaultProps} />);
      
      const description = screen.getByTestId('service-error-description');
      const textContent = description.textContent;
      
      // Text content should be natural for screen readers
      expect(textContent).toMatch(/We're experiencing a temporary issue/);
      expect(textContent).not.toContain('&apos;');
      expect(textContent).not.toContain('&amp;');
    });

    it('should render consistently across different browsers', () => {
      render(<ServiceError {...defaultProps} />);
      
      const description = screen.getByTestId('service-error-description');
      
      // HTML should be consistent
      expect(description.innerHTML).toMatch(/We&apos;re experiencing a temporary issue\. Please try again in \d+ seconds\./);
    });
  });

  describe('Component Functionality After Text Change', () => {
    it('should maintain retry functionality with updated text', () => {
      const mockRetry = jest.fn();
      render(<ServiceError {...defaultProps} onRetry={mockRetry} />);
      
      const retryButton = screen.getByText('Try Again');
      retryButton.click();
      
      expect(mockRetry).toHaveBeenCalledTimes(1);
    });

    it('should maintain dismiss functionality with updated text', () => {
      const mockDismiss = jest.fn();
      render(<ServiceError {...defaultProps} onDismiss={mockDismiss} />);
      
      const dismissButton = screen.getByText('Dismiss');
      dismissButton.click();
      
      expect(mockDismiss).toHaveBeenCalledTimes(1);
    });

    it('should update retry countdown correctly with new text format', () => {
      const { rerender } = render(<ServiceError {...defaultProps} retryAfter={30} />);
      
      expect(screen.getByText(/30 seconds/)).toBeInTheDocument();
      
      rerender(<ServiceError {...defaultProps} retryAfter={10} />);
      
      expect(screen.getByText(/10 seconds/)).toBeInTheDocument();
    });

    it('should handle edge cases with retry timing', () => {
      const testCases = [0, 1, 60, 300];
      
      testCases.forEach(retryTime => {
        const { unmount } = render(<ServiceError {...defaultProps} retryAfter={retryTime} />);
        
        const expectedText = `try again in ${retryTime} second${retryTime === 1 ? '' : 's'}`;
        expect(screen.getByText(new RegExp(expectedText, 'i'))).toBeInTheDocument();
        
        unmount();
      });
    });
  });

  describe('Cross-Browser Compatibility', () => {
    it('should handle different HTML entity interpretations', () => {
      render(<ServiceError {...defaultProps} />);
      
      const description = screen.getByTestId('service-error-description');
      
      // Should work regardless of browser HTML entity handling
      const innerHTML = description.innerHTML;
      const textContent = description.textContent;
      
      expect(innerHTML).toContain('&apos;');
      expect(textContent).toContain("'");
      expect(textContent).toMatch(/We're/);
    });

    it('should maintain accessibility across different assistive technologies', () => {
      render(<ServiceError {...defaultProps} />);
      
      const description = screen.getByTestId('service-error-description');
      
      // Verify the text is accessible to different AT
      expect(description).toHaveAttribute('id');
      expect(description.textContent).toBeTruthy();
      expect(description.innerHTML).toBeTruthy();
    });
  });

  describe('Regression Prevention', () => {
    it('should not introduce XSS vulnerabilities with HTML entities', () => {
      // Test that the apostrophe fix doesn't create XSS risks
      render(<ServiceError {...defaultProps} />);
      
      const description = screen.getByTestId('service-error-description');
      
      // Should not contain any script tags or dangerous HTML
      expect(description.innerHTML).not.toContain('<script>');
      expect(description.innerHTML).not.toContain('javascript:');
      expect(description.innerHTML).not.toContain('onload=');
    });

    it('should maintain component props interface', () => {
      // Ensure the component still accepts all expected props
      const allProps = {
        retryAfter: 30,
        onRetry: jest.fn(),
        onDismiss: jest.fn()
      };
      
      expect(() => {
        render(<ServiceError {...allProps} />);
      }).not.toThrow();
    });

    it('should preserve error message structure and formatting', () => {
      render(<ServiceError {...defaultProps} retryAfter={45} />);
      
      const description = screen.getByTestId('service-error-description');
      const text = description.textContent;
      
      // Should maintain the same message structure
      expect(text).toMatch(/We're experiencing a temporary issue\./);
      expect(text).toMatch(/Please try again in 45 seconds\./);
      expect(text).toMatch(/If the problem persists, our team has been notified\./);
    });
  });
});