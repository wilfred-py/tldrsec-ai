/**
 * Tests for Reddit Filing Type Schemas
 *
 * Phase 4 of Summary Generation Quality Improvement Plan:
 * - Form S-1 (IPO Registration)
 * - Form S-3 (Secondary Offering Registration)
 * - DEF 14A (Proxy Statement)
 * - Form 11-K (Employee Stock Plan Annual Report)
 *
 * These filing types were identified from Reddit discussions as commonly
 * referenced but lacking dedicated schema support.
 */

import { FORM_SCHEMAS, getSchemaForFormType, isFormTypeSupported } from '@/lib/ai/prompts/unified-prompts';

describe('Reddit Filing Type Schemas', () => {
  describe('Form S-1 (IPO Registration)', () => {
    it('should have dedicated schema with IPO-specific fields', () => {
      const schema = FORM_SCHEMAS['S-1'];
      expect(schema).toBeDefined();
      expect(schema.properties.offeringSize).toBeDefined();
      expect(schema.properties.useOfProceeds).toBeDefined();
      expect(schema.properties.riskFactors).toBeDefined();
      expect(schema.properties.businessDescription).toBeDefined();
    });

    it('should have priceRange field for IPO pricing', () => {
      const schema = FORM_SCHEMAS['S-1'];
      expect(schema.properties.priceRange).toBeDefined();
      expect(schema.properties.priceRange.maxLength).toBeLessThanOrEqual(50);
    });

    it('should have underwriters array', () => {
      const schema = FORM_SCHEMAS['S-1'];
      expect(schema.properties.underwriters).toBeDefined();
      expect(schema.properties.underwriters.type).toBe('array');
      expect(schema.properties.underwriters.maxItems).toBeLessThanOrEqual(5);
    });

    it('should have financialHighlights for pre-IPO metrics', () => {
      const schema = FORM_SCHEMAS['S-1'];
      expect(schema.properties.financialHighlights).toBeDefined();
      expect(schema.properties.financialHighlights.type).toBe('array');
    });

    it('should require company, summary, and offeringSize', () => {
      const schema = FORM_SCHEMAS['S-1'];
      expect(schema.required).toContain('company');
      expect(schema.required).toContain('summary');
      expect(schema.required).toContain('offeringSize');
    });

    it('should be recognized as supported form type', () => {
      expect(isFormTypeSupported('S-1')).toBe(true);
    });
  });

  describe('Form S-3 (Secondary Offering)', () => {
    it('should have dedicated schema with offering-specific fields', () => {
      const schema = FORM_SCHEMAS['S-3'];
      expect(schema).toBeDefined();
      expect(schema.properties.offeringType).toBeDefined();
      expect(schema.properties.sharesOffered).toBeDefined();
      expect(schema.properties.dilutionImpact).toBeDefined();
    });

    it('should have offeringAmount field', () => {
      const schema = FORM_SCHEMAS['S-3'];
      expect(schema.properties.offeringAmount).toBeDefined();
      expect(schema.properties.offeringAmount.maxLength).toBeLessThanOrEqual(50);
    });

    it('should have sellingShareholders array for registered holders', () => {
      const schema = FORM_SCHEMAS['S-3'];
      expect(schema.properties.sellingShareholders).toBeDefined();
      expect(schema.properties.sellingShareholders.type).toBe('array');
    });

    it('should have shelfRegistration field for shelf offerings', () => {
      const schema = FORM_SCHEMAS['S-3'];
      expect(schema.properties.shelfRegistration).toBeDefined();
    });

    it('should require company, summary, and offeringType', () => {
      const schema = FORM_SCHEMAS['S-3'];
      expect(schema.required).toContain('company');
      expect(schema.required).toContain('summary');
      expect(schema.required).toContain('offeringType');
    });

    it('should be recognized as supported form type', () => {
      expect(isFormTypeSupported('S-3')).toBe(true);
    });
  });

  describe('DEF 14A (Proxy Statement)', () => {
    it('should have dedicated schema with governance fields', () => {
      const schema = FORM_SCHEMAS['DEF 14A'];
      expect(schema).toBeDefined();
      expect(schema.properties.executiveCompensation).toBeDefined();
      expect(schema.properties.boardProposals).toBeDefined();
      expect(schema.properties.shareholderProposals).toBeDefined();
    });

    it('should have meetingDate field', () => {
      const schema = FORM_SCHEMAS['DEF 14A'];
      expect(schema.properties.meetingDate).toBeDefined();
    });

    it('should have ceoPayRatio field', () => {
      const schema = FORM_SCHEMAS['DEF 14A'];
      expect(schema.properties.ceoPayRatio).toBeDefined();
      expect(schema.properties.ceoPayRatio.maxLength).toBeLessThanOrEqual(50);
    });

    it('should have directorNominees array', () => {
      const schema = FORM_SCHEMAS['DEF 14A'];
      expect(schema.properties.directorNominees).toBeDefined();
      expect(schema.properties.directorNominees.type).toBe('array');
    });

    it('should have sayOnPay field for shareholder advisory vote', () => {
      const schema = FORM_SCHEMAS['DEF 14A'];
      expect(schema.properties.sayOnPay).toBeDefined();
    });

    it('should require company, summary, and meetingDate', () => {
      const schema = FORM_SCHEMAS['DEF 14A'];
      expect(schema.required).toContain('company');
      expect(schema.required).toContain('summary');
      expect(schema.required).toContain('meetingDate');
    });

    it('should be recognized as supported form type', () => {
      expect(isFormTypeSupported('DEF 14A')).toBe(true);
    });
  });

  describe('Form 11-K (Employee Stock Plan)', () => {
    it('should have dedicated schema with plan-specific fields', () => {
      const schema = FORM_SCHEMAS['11-K'];
      expect(schema).toBeDefined();
      expect(schema.properties.planAssets).toBeDefined();
      expect(schema.properties.participantCount).toBeDefined();
    });

    it('should have planName field', () => {
      const schema = FORM_SCHEMAS['11-K'];
      expect(schema.properties.planName).toBeDefined();
      expect(schema.properties.planName.maxLength).toBeLessThanOrEqual(200);
    });

    it('should have contributionsReceived field', () => {
      const schema = FORM_SCHEMAS['11-K'];
      expect(schema.properties.contributionsReceived).toBeDefined();
    });

    it('should have benefitsDistributed field', () => {
      const schema = FORM_SCHEMAS['11-K'];
      expect(schema.properties.benefitsDistributed).toBeDefined();
    });

    it('should have investmentOptions array', () => {
      const schema = FORM_SCHEMAS['11-K'];
      expect(schema.properties.investmentOptions).toBeDefined();
      expect(schema.properties.investmentOptions.type).toBe('array');
    });

    it('should have planFiscalYear field', () => {
      const schema = FORM_SCHEMAS['11-K'];
      expect(schema.properties.planFiscalYear).toBeDefined();
    });

    it('should require company, summary, and planAssets', () => {
      const schema = FORM_SCHEMAS['11-K'];
      expect(schema.required).toContain('company');
      expect(schema.required).toContain('summary');
      expect(schema.required).toContain('planAssets');
    });

    it('should be recognized as supported form type', () => {
      expect(isFormTypeSupported('11-K')).toBe(true);
    });
  });

  describe('All New Schemas', () => {
    const newFormTypes = ['S-1', 'S-3', 'DEF 14A', '11-K'];

    newFormTypes.forEach(formType => {
      it(`${formType} should have company field (required)`, () => {
        const schema = FORM_SCHEMAS[formType];
        expect(schema.required).toContain('company');
      });

      it(`${formType} should have summary field (required)`, () => {
        const schema = FORM_SCHEMAS[formType];
        expect(schema.required).toContain('summary');
      });

      it(`${formType} should have filingDate field`, () => {
        const schema = FORM_SCHEMAS[formType];
        expect(schema.properties.filingDate).toBeDefined();
      });

      it(`${formType} should be retrievable via getSchemaForFormType`, () => {
        const schema = getSchemaForFormType(formType);
        expect(schema).not.toBe(FORM_SCHEMAS['Generic']);
        expect(schema.type).toBe('object');
      });
    });
  });
});
