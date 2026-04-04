import { canonicalizeFormType } from '@/lib/ai/utils/form-type-utils';

describe('canonicalizeFormType', () => {
  describe('amendment detection', () => {
    it('detects 10-K/A as amendment of 10-K', () => {
      const result = canonicalizeFormType('10-K/A');
      expect(result).toEqual({ type: '10-K', isAmendment: true });
    });

    it('detects 10-Q/A as amendment of 10-Q', () => {
      const result = canonicalizeFormType('10-Q/A');
      expect(result).toEqual({ type: '10-Q', isAmendment: true });
    });

    it('detects SC 13G/A as amendment of SC 13G', () => {
      const result = canonicalizeFormType('SC 13G/A');
      expect(result).toEqual({ type: 'SC 13G', isAmendment: true });
    });

    it('detects SC 13D/A as amendment of SC 13D', () => {
      const result = canonicalizeFormType('SC 13D/A');
      expect(result).toEqual({ type: 'SC 13D', isAmendment: true });
    });

    it('non-amendment types have isAmendment false', () => {
      const result = canonicalizeFormType('10-K');
      expect(result.isAmendment).toBe(false);
    });

    it('handles non-aliased amendment variants by stripping /A before lookup', () => {
      // 'Form 4/A' is not in FORM_TYPE_ALIASES directly, but 'Form 4' maps to '4'
      expect(canonicalizeFormType('Form 4/A')).toEqual({ type: '4', isAmendment: true });
      expect(canonicalizeFormType('Form4/A')).toEqual({ type: '4', isAmendment: true });
      expect(canonicalizeFormType('SCHEDULE 13D/A')).toEqual({ type: 'SC 13D', isAmendment: true });
      expect(canonicalizeFormType('SCHEDULE 13G/A')).toEqual({ type: 'SC 13G', isAmendment: true });
      expect(canonicalizeFormType('Form 3/A')).toEqual({ type: '3', isAmendment: true });
    });
  });

  describe('Schedule 13G/D aliases', () => {
    it('normalizes SCHEDULE 13G to SC 13G', () => {
      expect(canonicalizeFormType('SCHEDULE 13G').type).toBe('SC 13G');
    });

    it('normalizes SCHEDULE 13D to SC 13D', () => {
      expect(canonicalizeFormType('SCHEDULE 13D').type).toBe('SC 13D');
    });

    it('normalizes bare 13G to SC 13G', () => {
      expect(canonicalizeFormType('13G').type).toBe('SC 13G');
    });

    it('normalizes bare 13D to SC 13D', () => {
      expect(canonicalizeFormType('13D').type).toBe('SC 13D');
    });
  });

  describe('Form 4 variants', () => {
    it('normalizes Form4 to 4', () => {
      expect(canonicalizeFormType('Form4').type).toBe('4');
    });

    it('normalizes Form 4 (with space) to 4', () => {
      expect(canonicalizeFormType('Form 4').type).toBe('4');
    });

    it('normalizes form4 (lowercase) to 4', () => {
      expect(canonicalizeFormType('form4').type).toBe('4');
    });

    it('passes through canonical 4 unchanged', () => {
      expect(canonicalizeFormType('4').type).toBe('4');
    });
  });

  describe('Form 3 variants', () => {
    it('normalizes Form 3 to 3', () => {
      expect(canonicalizeFormType('Form 3').type).toBe('3');
    });

    it('normalizes Form3 to 3', () => {
      expect(canonicalizeFormType('Form3').type).toBe('3');
    });

    it('passes through canonical 3 unchanged', () => {
      expect(canonicalizeFormType('3').type).toBe('3');
    });
  });

  describe('Form 144 variants', () => {
    it('normalizes Form 144 to 144', () => {
      expect(canonicalizeFormType('Form 144').type).toBe('144');
    });

    it('normalizes Form144 to 144', () => {
      expect(canonicalizeFormType('Form144').type).toBe('144');
    });

    it('passes through canonical 144 unchanged', () => {
      expect(canonicalizeFormType('144').type).toBe('144');
    });
  });

  describe('production DB truncated types', () => {
    it('normalizes bare SCHEDULE to SC 13G', () => {
      expect(canonicalizeFormType('SCHEDULE').type).toBe('SC 13G');
    });

    it('normalizes bare DEF to DEF 14A', () => {
      expect(canonicalizeFormType('DEF').type).toBe('DEF 14A');
    });

    it('detects 4/A as amendment of Form 4', () => {
      const result = canonicalizeFormType('4/A');
      expect(result).toEqual({ type: '4', isAmendment: true });
    });

    it('detects 8-K/A as amendment of 8-K', () => {
      const result = canonicalizeFormType('8-K/A');
      expect(result).toEqual({ type: '8-K', isAmendment: true });
    });
  });

  describe('passthrough for canonical types', () => {
    const canonicalTypes = ['10-K', '10-Q', '8-K', 'SC 13G', 'SC 13D', 'DEF 14A', 'S-1', 'S-3', '424B2', '11-K', 'Generic'];

    for (const type of canonicalTypes) {
      it(`passes through ${type} unchanged`, () => {
        const result = canonicalizeFormType(type);
        expect(result.type).toBe(type);
        expect(result.isAmendment).toBe(false);
      });
    }
  });
});
