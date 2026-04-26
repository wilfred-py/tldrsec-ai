import {
  EMAIL_NOTICE_PROMISE,
  SETTINGS_HELPER,
  pluralize,
} from '@/lib/onboarding/email-notice-constants';

describe('email-notice-constants', () => {
  describe('pluralize', () => {
    it('returns the singular form when n === 1', () => {
      expect(pluralize(1, 'company', 'companies')).toBe('company');
    });

    it('returns the plural form for n === 0', () => {
      expect(pluralize(0, 'company', 'companies')).toBe('companies');
    });

    it('returns the plural form for n > 1', () => {
      expect(pluralize(2, 'company', 'companies')).toBe('companies');
      expect(pluralize(15, 'company', 'companies')).toBe('companies');
    });
  });

  describe('EMAIL_NOTICE_PROMISE', () => {
    it('uses "company" (singular) for exactly 1 ticker', () => {
      expect(EMAIL_NOTICE_PROMISE(1)).toBe(
        "We'll email you when new filings are posted for 1 company."
      );
    });

    it('uses "companies" (plural) for 0', () => {
      expect(EMAIL_NOTICE_PROMISE(0)).toContain('0 companies');
    });

    it('uses "companies" (plural) for n > 1', () => {
      expect(EMAIL_NOTICE_PROMISE(7)).toBe(
        "We'll email you when new filings are posted for 7 companies."
      );
    });
  });

  it('SETTINGS_HELPER copy matches the spec', () => {
    expect(SETTINGS_HELPER).toBe('Change anytime in Settings.');
  });
});
