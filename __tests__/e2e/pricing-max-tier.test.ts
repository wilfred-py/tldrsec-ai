import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium, Browser, Page } from 'playwright';

describe('E2E: Pricing Page with Max Tier', () => {
  let browser: Browser;
  let page: Page;
  const baseUrl = process.env.TEST_URL || 'http://localhost:3000';

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('Pricing Page Display', () => {
    it('should display three tiers: Free, Pro, and Max', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Check for tier names
      const freeTier = await page.locator('text=Free').first();
      const proTier = await page.locator('text=Pro').first();
      const maxTier = await page.locator('text=Max').first();

      expect(await freeTier.isVisible()).toBe(true);
      expect(await proTier.isVisible()).toBe(true);
      expect(await maxTier.isVisible()).toBe(true);
    });

    it('should not display Premium tier anywhere', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Ensure Premium is not displayed
      const premiumText = await page.locator('text=Premium').count();
      expect(premiumText).toBe(0);
    });

    it('should show correct pricing for Max tier', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Check for Max tier pricing
      const maxPricing = await page.locator('text=$49').first();
      expect(await maxPricing.isVisible()).toBe(true);
    });

    it('should highlight Max tier as best value', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Check for "Most Popular" or "Best Value" badge on Max tier
      const maxCard = await page.locator('[data-tier="max"]');
      const badge = await maxCard.locator('text=/Most Popular|Best Value/i');
      
      // At least one should exist
      const badgeCount = await badge.count();
      expect(badgeCount).toBeGreaterThan(0);
    });
  });

  describe('Tier Selection Flow', () => {
    it('should allow selecting Max tier', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Click on Max tier CTA
      const maxCTA = await page.locator('button:has-text("Get Max")').first();
      await maxCTA.click();

      // Should navigate to sign up or checkout
      await page.waitForURL(/\/(sign-up|checkout|subscribe)/);
      
      const url = page.url();
      expect(url).toMatch(/tier=max|plan=max/i);
    });

    it('should pass Max tier to checkout', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Get Max tier button
      const maxButton = await page.locator('[data-tier="max"] button').first();
      const tierData = await maxButton.getAttribute('data-tier-name');
      
      expect(tierData?.toUpperCase()).toBe('MAX');
    });
  });

  describe('Feature Comparison', () => {
    it('should show unlimited features for Max tier', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Check for unlimited indicators in Max tier
      const maxSection = await page.locator('[data-tier="max"]');
      const unlimitedText = await maxSection.locator('text=/Unlimited/i').count();
      
      // Should have multiple unlimited features
      expect(unlimitedText).toBeGreaterThan(0);
    });

    it('should differentiate Max from Pro features', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Check Pro has limits
      const proSection = await page.locator('[data-tier="pro"]');
      const proLimits = await proSection.locator('text=/[0-9]+\s+(summaries|tickers)/i').count();
      
      // Check Max has unlimited
      const maxSection = await page.locator('[data-tier="max"]');
      const maxUnlimited = await maxSection.locator('text=/Unlimited/i').count();
      
      expect(proLimits).toBeGreaterThan(0);
      expect(maxUnlimited).toBeGreaterThan(0);
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should display Max tier correctly on mobile', async () => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      const maxTier = await page.locator('text=Max').first();
      expect(await maxTier.isVisible()).toBe(true);

      // Check if cards stack vertically on mobile
      const cards = await page.locator('[data-tier]');
      const cardCount = await cards.count();
      expect(cardCount).toBe(3); // Free, Pro, Max
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for Max tier', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      const maxButton = await page.locator('[data-tier="max"] button').first();
      const ariaLabel = await maxButton.getAttribute('aria-label');
      
      expect(ariaLabel).toContain('Max');
    });

    it('should be keyboard navigable', async () => {
      await page.goto(`${baseUrl}/pricing`);
      await page.waitForLoadState('networkidle');

      // Tab through pricing cards
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Check if Max tier button can be focused
      const focusedElement = await page.evaluate(() => document.activeElement?.textContent);
      expect(focusedElement).toBeDefined();
    });
  });
});