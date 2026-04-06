import { SECTORS, ONBOARDING_STEPS, MAX_TICKERS, TOTAL_STEPS } from '../../../../app/(auth)/onboarding/types';

describe('Onboarding types and constants', () => {
  it('defines 11 GICS sectors', () => {
    expect(SECTORS).toHaveLength(11);
    const ids = SECTORS.map((s) => s.id);
    expect(ids).toContain('information-technology');
    expect(ids).toContain('financials');
    expect(ids).toContain('real-estate');
  });

  it('each sector has required fields', () => {
    for (const sector of SECTORS) {
      expect(sector.id).toBeTruthy();
      expect(sector.name).toBeTruthy();
      expect(sector.icon).toBeTruthy();
      expect(sector.description).toBeTruthy();
      expect(sector.color).toBeTruthy();
    }
  });

  it('defines 3 onboarding steps', () => {
    expect(ONBOARDING_STEPS).toHaveLength(3);
    expect(ONBOARDING_STEPS[0].label).toBe('Sectors');
    expect(ONBOARDING_STEPS[1].label).toBe('Companies');
    expect(ONBOARDING_STEPS[2].label).toBe('Profile');
  });

  it('TOTAL_STEPS matches ONBOARDING_STEPS length', () => {
    expect(TOTAL_STEPS).toBe(ONBOARDING_STEPS.length);
  });

  it('MAX_TICKERS is a positive number', () => {
    expect(MAX_TICKERS).toBeGreaterThan(0);
  });
});
