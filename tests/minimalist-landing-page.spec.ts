/**
 * Comprehensive E2E Tests for Minimalist Landing Page
 * Testing full conversion flow, success states, error handling, and mobile responsiveness
 * 
 * This test file validates the complete user journey from landing page visit
 * to successful email subscription, ensuring all critical conversion paths work.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// Test configuration
const TEST_TIMEOUT = 30000;
const MOBILE_VIEWPORT = { width: 375, height: 667 };
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

// Test data
const VALID_EMAIL = 'test@example.com';
const INVALID_EMAIL = 'invalid-email';
const LONG_EMAIL = 'a'.repeat(100) + '@example.com';
const SPECIAL_EMAIL = 'test+tag@sub-domain.example-site.com';

test.describe('Minimalist Landing Page E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses for consistent testing
    await page.route('/api/newsletter/subscribe', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      
      if (postData.email === 'error@example.com') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else if (postData.email === 'existing@example.com') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ 
            success: true, 
            alreadySubscribed: true,
            message: 'You are already subscribed!' 
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ 
            success: true, 
            message: 'Successfully subscribed!' 
          }),
        });
      }
    });
  });

  test.describe('Page Loading and Initial State', () => {
    test('loads landing page successfully', async ({ page }) => {
      await page.goto('/');
      
      // Verify page loads and core elements are visible
      await expect(page).toHaveTitle(/SEC Filing Insights for Value Investors/);
      await expect(page.locator('h1')).toContainText('Skip the 100-page SEC filings');
      await expect(page.locator('[data-testid="waitlist-form"]')).toBeVisible();
    });

    test('displays correct meta information', async ({ page }) => {
      await page.goto('/');
      
      // Check meta tags
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toContain('Cut through complex legal jargon');
      
      // Check Open Graph tags
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      expect(ogTitle).toContain('SEC Filing Insights for Value Investors');
    });

    test('has proper heading hierarchy', async ({ page }) => {
      await page.goto('/');
      
      // Verify single H1 tag
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
      
      // Verify main landmark
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Form Interaction and Validation', () => {
    test('email input accepts valid email and enables submit button', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      // Initially disabled
      await expect(submitButton).toBeDisabled();
      
      // Type valid email
      await emailInput.fill(VALID_EMAIL);
      await expect(submitButton).toBeEnabled();
    });

    test('validates email format and shows error message', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      // Type invalid email and try to submit
      await emailInput.fill(INVALID_EMAIL);
      await submitButton.click();
      
      // Verify error message appears
      await expect(page.locator('text=Please enter a valid email address')).toBeVisible();
    });

    test('form submission shows loading state', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      // Check loading state
      await expect(page.locator('text=Securing your spot...')).toBeVisible();
      await expect(submitButton).toBeDisabled();
      await expect(emailInput).toBeDisabled();
    });

    test('handles special characters in email addresses', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(SPECIAL_EMAIL);
      await submitButton.click();
      
      // Should proceed to success state
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
    });
  });

  test.describe('Success State Handling', () => {
    test('displays success message on successful subscription', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      // Verify success state
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
      await expect(page.locator('text=🎉 Welcome to Early Access')).toBeVisible();
      await expect(page.locator('text=Check your email for confirmation')).toBeVisible();
    });

    test('handles already subscribed users correctly', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill('existing@example.com');
      await submitButton.click();
      
      // Verify already subscribed message
      await expect(page.locator('text=You were already subscribed')).toBeVisible();
      await expect(page.locator('text=continue to receive updates')).toBeVisible();
    });

    test('success state shows trust indicators', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      // Verify trust indicators in success state
      await expect(page.locator('text=Value-focused')).toBeVisible();
      await expect(page.locator('text=Secure & private')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('displays error message on API failure', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill('error@example.com');
      await submitButton.click();
      
      // Verify error message
      await expect(page.locator('text=Something went wrong. Please try again.')).toBeVisible();
      
      // Form should be re-enabled for retry
      await expect(submitButton).toBeEnabled();
      await expect(emailInput).toBeEnabled();
    });

    test('allows retry after error', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      // First attempt with error email
      await emailInput.fill('error@example.com');
      await submitButton.click();
      await expect(page.locator('text=Something went wrong. Please try again.')).toBeVisible();
      
      // Clear and retry with valid email
      await emailInput.clear();
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      // Should succeed
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('renders correctly on mobile viewport', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto('/');
      
      // Verify mobile layout
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
      
      // Check responsive text classes
      const headingClasses = await heading.getAttribute('class');
      expect(headingClasses).toContain('text-4xl');
      expect(headingClasses).toContain('md:text-5xl');
      
      // Verify form is accessible on mobile
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await expect(emailInput).toBeVisible();
      await expect(submitButton).toBeVisible();
    });

    test('form interaction works on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      // Test form interaction on mobile
      await emailInput.fill(VALID_EMAIL);
      await expect(submitButton).toBeEnabled();
      
      await submitButton.click();
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
    });

    test('success state displays correctly on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      // Verify mobile success state layout
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
      await expect(page.locator('text=🎉 Welcome to Early Access')).toBeVisible();
      
      // Trust indicators should be visible on mobile
      await expect(page.locator('text=Value-focused')).toBeVisible();
      await expect(page.locator('text=Secure & private')).toBeVisible();
    });
  });

  test.describe('Analytics Integration', () => {
    test('tracks UTM parameters from URL', async ({ page }) => {
      // Navigate with UTM parameters
      await page.goto('/?utm_source=test&utm_medium=social&utm_campaign=landing');
      
      let requestBody: any;
      page.on('request', request => {
        if (request.url().includes('/api/newsletter/subscribe')) {
          requestBody = request.postDataJSON();
        }
      });
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      // Wait for request and verify UTM parameters
      await page.waitForResponse('/api/newsletter/subscribe');
      expect(requestBody.utm_source).toBe('test');
      expect(requestBody.utm_medium).toBe('social');
      expect(requestBody.utm_campaign).toBe('landing');
    });

    test('includes correct source parameter', async ({ page }) => {
      await page.goto('/');
      
      let requestBody: any;
      page.on('request', request => {
        if (request.url().includes('/api/newsletter/subscribe')) {
          requestBody = request.postDataJSON();
        }
      });
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      await page.waitForResponse('/api/newsletter/subscribe');
      expect(requestBody.source).toBe('waitlist_home');
    });
  });

  test.describe('Accessibility', () => {
    test('has proper ARIA labels and roles', async ({ page }) => {
      await page.goto('/');
      
      // Check main landmark
      const main = page.locator('main');
      await expect(main).toBeVisible();
      
      // Check form accessibility
      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toHaveAttribute('placeholder', 'Enter your email for early access');
      
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toHaveAttribute('type', 'submit');
    });

    test('error messages are announced properly', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(INVALID_EMAIL);
      await submitButton.click();
      
      // Error should be in an alert role for screen readers
      const errorAlert = page.locator('[role="alert"]');
      await expect(errorAlert).toBeVisible();
      await expect(errorAlert).toContainText('Please enter a valid email address');
    });

    test('keyboard navigation works correctly', async ({ page }) => {
      await page.goto('/');
      
      // Tab to email input
      await page.keyboard.press('Tab');
      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toBeFocused();
      
      // Type email and tab to button
      await page.keyboard.type(VALID_EMAIL);
      await page.keyboard.press('Tab');
      
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeFocused();
      
      // Submit with Enter
      await page.keyboard.press('Enter');
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
    });
  });

  test.describe('Performance and Loading', () => {
    test('page loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/');
      
      // Wait for main content to be visible
      await expect(page.locator('h1')).toBeVisible();
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000); // 5 second threshold
    });

    test('form submission is responsive', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      
      const startTime = Date.now();
      await submitButton.click();
      
      // Success state should appear quickly
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(3000); // 3 second threshold
    });

    test('prevents double submission', async ({ page }) => {
      await page.goto('/');
      
      let requestCount = 0;
      page.on('request', request => {
        if (request.url().includes('/api/newsletter/subscribe')) {
          requestCount++;
        }
      });
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      
      // Double click rapidly
      await submitButton.click();
      await submitButton.click();
      
      await page.waitForResponse('/api/newsletter/subscribe');
      
      // Only one request should have been made
      expect(requestCount).toBe(1);
    });
  });

  test.describe('Edge Cases', () => {
    test('handles very long email addresses', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(LONG_EMAIL);
      await submitButton.click();
      
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
    });

    test('handles network timeouts gracefully', async ({ page }) => {
      // Mock slow API response
      await page.route('/api/newsletter/subscribe', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Successfully subscribed!' }),
        });
      });
      
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      // Should show loading state
      await expect(page.locator('text=Securing your spot...')).toBeVisible();
      
      // Eventually should succeed
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible({ timeout: 10000 });
    });

    test('handles browser back button correctly', async ({ page }) => {
      await page.goto('/');
      
      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button[type="submit"]');
      
      await emailInput.fill(VALID_EMAIL);
      await submitButton.click();
      
      // Wait for success state
      await expect(page.locator('text=You\'re officially on the list!')).toBeVisible();
      
      // Navigate to different page and back
      await page.goto('/dashboard');
      await page.goBack();
      
      // Should return to initial form state
      await expect(page.locator('h1')).toContainText('Skip the 100-page SEC filings');
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });
  });
});