import { SUBSCRIPTION_PLANS, getPlanConfig, calculateSavingsPercentage } from '@/lib/stripe';

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
    it('should have $199/month price', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.monthlyPrice).toBe(199);
    });

    it('should have $1990/year annual price (~17% savings)', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.annualPrice).toBe(1990);
    });

    it('should have 25 ticker limit', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.tickerLimit).toBe(25);
    });
  });

  describe('Max Tier', () => {
    it('should have $349/month price', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.monthlyPrice).toBe(349);
    });

    it('should have $3490/year annual price (~17% savings)', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.annualPrice).toBe(3490);
    });

    it('should have unlimited tickers', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.tickerLimit).toBe(-1);
    });
  });

  describe('calculateSavingsPercentage', () => {
    it('should calculate ~17% savings for Pro annual', () => {
      const savings = calculateSavingsPercentage('PRO');
      // $199 * 12 = $2388, annual = $1990, savings = $398 = 17%
      expect(savings).toBe(17);
    });

    it('should calculate ~17% savings for Max annual', () => {
      const savings = calculateSavingsPercentage('MAX');
      // $349 * 12 = $4188, annual = $3490, savings = $698 = 17%
      expect(savings).toBe(17);
    });

    it('should return 0 for Free tier', () => {
      const savings = calculateSavingsPercentage('FREE');
      expect(savings).toBe(0);
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

    it('Pro tier should have ALL filing types at $199 tier', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.filingTypes).toEqual(['ALL']);
    });

    it('Max tier should have ALL filing types', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.filingTypes).toEqual(['ALL']);
    });

    it('Pro tier features should mention 25 companies', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.features.some(f => f.includes('25'))).toBe(true);
    });

    it('Max tier features should mention unlimited companies', () => {
      const plan = getPlanConfig('MAX');
      expect(plan?.features.some(f => f.toLowerCase().includes('unlimited'))).toBe(true);
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
