/**
 * Regression tests for `getPlanTypeFromPriceId` in `lib/stripe/index.ts`.
 *
 * Adding the Founding Lifetime priceId branch (ADR-0004) created risk that
 * existing PRO/MAX mappings could shadow or be shadowed by the new branch.
 * These tests lock in the behavior for every configured priceId class
 * plus the unknown/null fallback.
 *
 * Mandatory regression test per /plan-eng-review iron rule.
 */

import { getPlanTypeFromPriceId, isFoundingLifetimePriceId } from '@/lib/stripe';

describe('getPlanTypeFromPriceId — regression after Founding Lifetime added', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      STRIPE_PRO_MONTHLY_PRICE_ID: 'price_pro_monthly_test',
      STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pro_annual_test',
      STRIPE_MAX_MONTHLY_PRICE_ID: 'price_max_monthly_test',
      STRIPE_MAX_ANNUAL_PRICE_ID: 'price_max_annual_test',
      STRIPE_FOUNDING_LIFETIME_PRICE_ID: 'price_founding_lifetime_test',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('maps PRO monthly priceId to PRO', () => {
    expect(getPlanTypeFromPriceId('price_pro_monthly_test')).toBe('PRO');
  });

  it('maps PRO annual priceId to PRO', () => {
    expect(getPlanTypeFromPriceId('price_pro_annual_test')).toBe('PRO');
  });

  it('maps MAX monthly priceId to MAX', () => {
    expect(getPlanTypeFromPriceId('price_max_monthly_test')).toBe('MAX');
  });

  it('maps MAX annual priceId to MAX', () => {
    expect(getPlanTypeFromPriceId('price_max_annual_test')).toBe('MAX');
  });

  it('maps Founding lifetime priceId to MAX (Founding entitlement is MAX)', () => {
    expect(getPlanTypeFromPriceId('price_founding_lifetime_test')).toBe('MAX');
  });

  it('returns FREE for unknown priceId', () => {
    expect(getPlanTypeFromPriceId('price_does_not_exist')).toBe('FREE');
  });

  it('returns FREE for undefined priceId', () => {
    expect(getPlanTypeFromPriceId(undefined)).toBe('FREE');
  });

  it('returns FREE for empty string priceId', () => {
    expect(getPlanTypeFromPriceId('')).toBe('FREE');
  });
});

describe('isFoundingLifetimePriceId', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      STRIPE_FOUNDING_LIFETIME_PRICE_ID: 'price_founding_lifetime_test',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns true for the Founding lifetime priceId', () => {
    expect(isFoundingLifetimePriceId('price_founding_lifetime_test')).toBe(true);
  });

  it('returns false for PRO/MAX priceIds', () => {
    expect(isFoundingLifetimePriceId('price_pro_monthly')).toBe(false);
    expect(isFoundingLifetimePriceId('price_max_annual')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isFoundingLifetimePriceId(undefined)).toBe(false);
  });

  it('returns false when env var is not set', () => {
    delete process.env.STRIPE_FOUNDING_LIFETIME_PRICE_ID;
    expect(isFoundingLifetimePriceId('any_price_id')).toBe(false);
  });
});
