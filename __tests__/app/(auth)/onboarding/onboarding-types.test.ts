import {
  SECTORS,
  ONBOARDING_STEPS,
  MAX_TICKERS,
  TOTAL_STEPS,
  ONBOARDING_STEPS_BASE,
  ONBOARDING_STEPS_WITH_CONFIRM,
  getOnboardingSteps,
} from '../../../../app/(auth)/onboarding/types';

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

  describe('A/B variant step configuration', () => {
    it('ONBOARDING_STEPS_BASE is the 3-step layout (Variant B)', () => {
      expect(ONBOARDING_STEPS_BASE).toHaveLength(3);
      expect(ONBOARDING_STEPS_BASE.map((s) => s.key)).toEqual([
        'sectors',
        'companies',
        'profile',
      ]);
    });

    it('ONBOARDING_STEPS_WITH_CONFIRM appends a "confirm" step (Variant A)', () => {
      expect(ONBOARDING_STEPS_WITH_CONFIRM).toHaveLength(4);
      expect(ONBOARDING_STEPS_WITH_CONFIRM[3].key).toBe('confirm');
      expect(ONBOARDING_STEPS_WITH_CONFIRM[3].label).toBe('Review');
    });

    it('getOnboardingSteps("step4") returns the 4-step layout', () => {
      expect(getOnboardingSteps('step4')).toBe(ONBOARDING_STEPS_WITH_CONFIRM);
      expect(getOnboardingSteps('step4')).toHaveLength(4);
    });

    it('getOnboardingSteps("inline") returns the 3-step layout', () => {
      expect(getOnboardingSteps('inline')).toBe(ONBOARDING_STEPS_BASE);
      expect(getOnboardingSteps('inline')).toHaveLength(3);
    });

    it('back-compat ONBOARDING_STEPS still equals the base layout', () => {
      expect(ONBOARDING_STEPS).toBe(ONBOARDING_STEPS_BASE);
      expect(TOTAL_STEPS).toBe(3);
    });
  });
});
