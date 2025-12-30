import { SUBSCRIPTION_PLANS, getPlanConfig } from '@/lib/stripe';

describe('Stripe Pricing Configuration', () => {
  describe('Free Tier', () => {
    it('should have $0 price and 3 ticker limit', () => {
      const plan = getPlanConfig('FREE');
      expect(plan).toBeDefined();
      expect(plan?.monthlyPrice).toBe(0);
      expect(plan?.tickerLimit).toBe(3);
    });
  });

  describe('Pro Tier', () => {
    it('should have $99/month price', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.monthlyPrice).toBe(99);
    });

    it('should have $990/year annual price (2 months free)', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.annualPrice).toBe(990);
    });

    it('should have 10 ticker limit', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.tickerLimit).toBe(10);
    });
  });

  describe('Max Tier', () => {
    it('should have $139/month price', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.monthlyPrice).toBe(139);
    });

    it('should have $1390/year annual price (2 months free)', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.annualPrice).toBe(1390);
    });

    it('should have unlimited tickers', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.tickerLimit).toBe(-1);
    });
  });

  describe('Valid Stripe Price IDs', () => {
    // Note: These tests validate price ID format when env vars are set
    // In CI/test environments without Stripe keys, price IDs may be empty strings
    it('should have valid monthly price IDs for paid tiers when configured', () => {
      const pro = getPlanConfig('PRO');
      const max = getPlanConfig('MAX');

      // monthlyPriceId should either be empty (not configured) or match price_ pattern
      if (pro?.monthlyPriceId) {
        expect(pro.monthlyPriceId).toMatch(/^price_/);
      }
      if (max?.monthlyPriceId) {
        expect(max.monthlyPriceId).toMatch(/^price_/);
      }

      // At minimum, the property should exist and be a string
      expect(typeof pro?.monthlyPriceId).toBe('string');
      expect(typeof max?.monthlyPriceId).toBe('string');
    });

    it('should have valid annual price IDs for paid tiers when configured', () => {
      const pro = getPlanConfig('PRO');
      const max = getPlanConfig('MAX');

      // annualPriceId should either be empty (not configured) or match price_ pattern
      if (pro?.annualPriceId) {
        expect(pro.annualPriceId).toMatch(/^price_/);
      }
      if (max?.annualPriceId) {
        expect(max.annualPriceId).toMatch(/^price_/);
      }

      // At minimum, the property should exist and be a string
      expect(typeof pro?.annualPriceId).toBe('string');
      expect(typeof max?.annualPriceId).toBe('string');
    });

    it('should have null price IDs for Free tier', () => {
      const free = getPlanConfig('FREE');
      expect(free?.monthlyPriceId).toBeNull();
      expect(free?.annualPriceId).toBeNull();
    });
  });

  describe('Plan Features', () => {
    it('Free tier should have limited filing types', () => {
      const plan = getPlanConfig('FREE');
      expect(plan?.filingTypes).toEqual(['10-K', '10-Q']);
    });

    it('Pro tier should have all filing types', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.filingTypes).toContain('10-K');
      expect(plan?.filingTypes).toContain('10-Q');
      expect(plan?.filingTypes).toContain('8-K');
      expect(plan?.filingTypes).toContain('FORM4');
    });

    it('Max tier should have all filing types', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.filingTypes).toEqual(['ALL']);
    });
  });

  describe('Email Frequency', () => {
    it('Free tier should have weekly email frequency', () => {
      const plan = getPlanConfig('FREE');
      expect(plan?.emailFrequency).toBe('weekly');
    });

    it('Pro tier should have realtime email frequency', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.emailFrequency).toBe('realtime');
    });

    it('Max tier should have realtime email frequency', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.emailFrequency).toBe('realtime');
    });
  });
});
