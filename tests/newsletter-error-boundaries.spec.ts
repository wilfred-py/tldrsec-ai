import { test, expect, Page } from '@playwright/test';

test.describe('Newsletter Error Boundaries', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Set up error tracking
    await page.goto('/');
    
    // Mock console to capture error logs
    await page.addInitScript(() => {
      window.errorLogs = [];
      const originalConsoleError = console.error;
      console.error = (...args) => {
        window.errorLogs.push(args.join(' '));
        originalConsoleError.apply(console, args);
      };
    });
  });

  test('should gracefully handle AI personalization timeout', async () => {
    // Intercept AI requests and force timeout
    await page.route('**/api/openrouter/**', async (route) => {
      // Delay response to simulate timeout
      await page.waitForTimeout(20000); // Longer than our 15s timeout
      await route.fulfill({ status: 408, body: 'Request Timeout' });
    });

    // Navigate to newsletter page
    await page.goto('/newsletter');

    // Wait for component to load and handle timeout
    await page.waitForTimeout(18000); // Give time for timeout to occur

    // Should show fallback content instead of crashing
    await expect(page.locator('h1')).toContainText('SEC Filings Made Simple');
    
    // Should not show error messages to user
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
    
    // Form should still be functional
    const emailInput = page.locator('input[type="email"]');
    const submitButton = page.locator('button[type="submit"]');
    
    await expect(emailInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    await expect(submitButton).not.toBeDisabled();
  });

  test('should handle malformed AI response gracefully', async () => {
    // Mock AI response with invalid JSON
    await page.route('**/api/openrouter/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: 'Invalid response without JSON format'
        })
      });
    });

    await page.goto('/newsletter');

    // Wait for personalization attempt
    await page.waitForTimeout(3000);

    // Should show fallback content
    await expect(page.locator('h1')).toContainText('SEC Filings Made Simple');
    
    // Should log error but not crash
    const errorLogs = await page.evaluate(() => window.errorLogs);
    expect(errorLogs.some(log => log.includes('personalization'))).toBeTruthy();
  });

  test('should handle network failure with circuit breaker', async () => {
    let requestCount = 0;
    
    // Mock network failures
    await page.route('**/api/openrouter/**', async (route) => {
      requestCount++;
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.goto('/newsletter');

    // Wait for multiple retry attempts
    await page.waitForTimeout(10000);

    // Should activate circuit breaker after multiple failures
    const errorLogs = await page.evaluate(() => window.errorLogs);
    expect(errorLogs.some(log => log.includes('circuit breaker'))).toBeTruthy();
    
    // Should still show functional form
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('should recover from temporary network issues', async () => {
    let failCount = 0;
    
    // Mock temporary network failure
    await page.route('**/api/openrouter/**', async (route) => {
      failCount++;
      if (failCount <= 2) {
        // Fail first 2 attempts
        await route.fulfill({ status: 503, body: 'Service Unavailable' });
      } else {
        // Succeed on 3rd attempt
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            content: JSON.stringify({
              headline: "Recovered Personalized Content",
              valueProposition: "Successfully recovered from network error",
              socialProof: "Recovery test passed",
              ctaText: "Subscribe Now",
              riskMitigation: "Free forever"
            })
          })
        });
      }
    });

    await page.goto('/newsletter');

    // Wait for recovery
    await page.waitForTimeout(8000);

    // Should show personalized content after recovery
    await expect(page.locator('h1')).toContainText('Recovered Personalized Content');
  });

  test('should handle component crash with error boundary', async () => {
    // Inject error into React component
    await page.addInitScript(() => {
      // Mock a component crash
      window.addEventListener('load', () => {
        setTimeout(() => {
          // Trigger an error in React component
          const event = new Error('Simulated React component crash');
          window.dispatchEvent(new CustomEvent('test-component-error', { detail: error }));
        }, 2000);
      });
    });

    await page.goto('/newsletter');

    // Wait for potential crash
    await page.waitForTimeout(5000);

    // Error boundary should catch the error and show fallback
    await expect(page.locator('h1')).toBeVisible();
    
    // Should not show browser error page
    await expect(page).not.toHaveTitle(/error/i);
  });

  test('should maintain form functionality during AI failures', async () => {
    // Mock AI service failure
    await page.route('**/api/openrouter/**', async (route) => {
      await route.fulfill({ status: 429, body: 'Rate Limited' });
    });

    await page.goto('/newsletter');
    
    // Wait for AI failure
    await page.waitForTimeout(3000);

    // Test email form functionality
    const emailInput = page.locator('input[type="email"]');
    const submitButton = page.locator('button[type="submit"]');

    await emailInput.fill('test@example.com');
    await expect(submitButton).not.toBeDisabled();

    // Mock successful subscription
    await page.route('**/api/newsletter/subscribe', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await submitButton.click();

    // Should show success message
    await expect(page.locator('text=Welcome to the Community')).toBeVisible();
  });

  test('should track error metrics correctly', async () => {
    // Mock AI failures
    await page.route('**/api/openrouter/**', async (route) => {
      await route.fulfill({ status: 500, body: 'Server Error' });
    });

    // Mock analytics tracking
    let trackedEvents = [];
    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('analytics')) {
        const postData = await route.request().postDataJSON();
        trackedEvents.push(postData);
        await route.fulfill({ status: 200, body: 'OK' });
      } else {
        await route.continue();
      }
    });

    await page.goto('/newsletter');
    
    // Wait for error tracking
    await page.waitForTimeout(5000);

    // Should track personalization failures
    expect(trackedEvents.some(event => 
      event.event === 'personalization_failed'
    )).toBeTruthy();
  });

  test('should show retry option for recoverable errors', async () => {
    let attemptCount = 0;
    
    await page.route('**/api/openrouter/**', async (route) => {
      attemptCount++;
      if (attemptCount < 4) {
        await route.fulfill({ status: 503, body: 'Temporary Error' });
      } else {
        await route.fulfill({ status: 200, body: 'Success' });
      }
    });

    await page.goto('/newsletter');
    
    // Wait for initial failure and retries
    await page.waitForTimeout(8000);

    // Check if retry mechanism is working
    const errorLogs = await page.evaluate(() => window.errorLogs);
    expect(errorLogs.some(log => log.includes('retry'))).toBeTruthy();
  });

  test('should perform within acceptable time limits', async () => {
    const startTime = Date.now();
    
    await page.goto('/newsletter');
    
    // Wait for page to be fully interactive
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 5 seconds even with error handling overhead
    expect(loadTime).toBeLessThan(5000);
    
    // Essential elements should be visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

test.describe('Error Recovery Performance', () => {
  test('should not cause memory leaks during repeated failures', async ({ page }) => {
    // Mock repeated AI failures
    await page.route('**/api/openrouter/**', async (route) => {
      await route.fulfill({ status: 500, body: 'Error' });
    });

    await page.goto('/newsletter');

    // Simulate prolonged usage with errors
    for (let i = 0; i < 10; i++) {
      await page.reload();
      await page.waitForTimeout(2000);
    }

    // Check memory usage doesn't grow excessively
    const memoryUsage = await page.evaluate(() => {
      if (window.performance && window.performance.memory) {
        return window.performance.memory.usedJSHeapSize;
      }
      return 0;
    });

    // Should not exceed 50MB (reasonable threshold)
    expect(memoryUsage).toBeLessThan(50 * 1024 * 1024);
  });

  test('should cleanup resources properly', async ({ page }) => {
    await page.goto('/newsletter');
    
    // Wait for component initialization
    await page.waitForTimeout(3000);

    // Navigate away to trigger cleanup
    await page.goto('/');
    
    // Wait for cleanup
    await page.waitForTimeout(1000);

    // Check that error tracking resources are cleaned up
    const errorLogs = await page.evaluate(() => window.errorLogs || []);
    
    // Should not have resource leaks logged
    expect(errorLogs.some(log => 
      log.includes('leak') || log.includes('timeout not cleared')
    )).toBeFalsy();
  });
});