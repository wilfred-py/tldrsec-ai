/**
 * Template Selection Consistency Tests
 *
 * Tests for Phase 3 of Summary Generation Accuracy Improvements
 * Ensures correct template selection for all supported form types
 */

import { TemplateRegistry } from '@/lib/email/template-registry';

describe('Template Selection Consistency', () => {
  describe('Template Registry Lookup', () => {
    it('should select Form4MinimalistTemplate for Form 4 filings', () => {
      const template = TemplateRegistry.getTemplate('Form 4');
      expect(template.displayName).toBe('Form4MinimalistTemplate');
    });

    it('should select Form4MinimalistTemplate for numeric 4 filings', () => {
      const template = TemplateRegistry.getTemplate('4');
      expect(template.displayName).toBe('Form4MinimalistTemplate');
    });

    it('should select Form10KMinimalistTemplate for 10-K filings', () => {
      const template = TemplateRegistry.getTemplate('10-K');
      expect(template.displayName).toBe('Form10KMinimalistTemplate');
    });

    it('should select Form10QMinimalistTemplate for 10-Q filings', () => {
      const template = TemplateRegistry.getTemplate('10-Q');
      expect(template.displayName).toBe('Form10QMinimalistTemplate');
    });

    it('should select Form8KMinimalistTemplate for 8-K filings', () => {
      const template = TemplateRegistry.getTemplate('8-K');
      expect(template.displayName).toBe('Form8KMinimalistTemplate');
    });

    it('should select Form144MinimalistTemplate for Form 144 filings', () => {
      const template = TemplateRegistry.getTemplate('Form 144');
      expect(template.displayName).toBe('Form144MinimalistTemplate');
    });

    it('should select GenericMinimalistTemplate for unknown form types', () => {
      const template = TemplateRegistry.getTemplate('UNKNOWN-FORM');
      expect(template.displayName).toBe('GenericMinimalistTemplate');
    });
  });

  describe('Template Registry Comprehensive Mappings', () => {
    const testCases = [
      // Form 4 variants
      { formType: 'Form 4', expected: 'Form4MinimalistTemplate' },
      { formType: 'FORM 4', expected: 'Form4MinimalistTemplate' },
      { formType: 'FORM4', expected: 'Form4MinimalistTemplate' },
      { formType: '4', expected: 'Form4MinimalistTemplate' },

      // Form 3 and 5 (use Form 4 template for insider trading)
      { formType: 'Form 3', expected: 'Form4MinimalistTemplate' },
      { formType: '3', expected: 'Form4MinimalistTemplate' },
      { formType: 'Form 5', expected: 'Form4MinimalistTemplate' },
      { formType: '5', expected: 'Form4MinimalistTemplate' },

      // 10-K variants
      { formType: '10-K', expected: 'Form10KMinimalistTemplate' },
      { formType: '10K', expected: 'Form10KMinimalistTemplate' },
      { formType: 'Form 10-K', expected: 'Form10KMinimalistTemplate' },

      // 10-Q variants
      { formType: '10-Q', expected: 'Form10QMinimalistTemplate' },
      { formType: '10Q', expected: 'Form10QMinimalistTemplate' },
      { formType: 'Form 10-Q', expected: 'Form10QMinimalistTemplate' },

      // 8-K variants
      { formType: '8-K', expected: 'Form8KMinimalistTemplate' },
      { formType: '8K', expected: 'Form8KMinimalistTemplate' },
      { formType: 'Form 8-K', expected: 'Form8KMinimalistTemplate' },
      { formType: 'FORM 8-K', expected: 'Form8KMinimalistTemplate' },

      // Form 144 variants
      { formType: '144', expected: 'Form144MinimalistTemplate' },
      { formType: 'Form 144', expected: 'Form144MinimalistTemplate' },
      { formType: 'FORM 144', expected: 'Form144MinimalistTemplate' },

      // Generic fallback
      { formType: 'UNKNOWN', expected: 'GenericMinimalistTemplate' },
      { formType: 'DEF 14A', expected: 'FormDEF14AEmailTemplate' },
      { formType: 'Schedule 13D', expected: 'Schedule13DEmailTemplate' },
    ];

    testCases.forEach(({ formType, expected }) => {
      it(`should select ${expected} for "${formType}"`, () => {
        const template = TemplateRegistry.getTemplate(formType);
        expect(template.displayName).toBe(expected);
      });
    });
  });

  describe('Template Registry Performance', () => {
    it('should have O(1) lookup performance using Map', () => {
      // The registry uses a Map for O(1) lookup
      expect(TemplateRegistry.isMapBased()).toBe(true);
    });

    it('should have all required form type mappings registered', () => {
      const requiredMappings = [
        'Form 4', '10-K', '10-Q', '8-K', 'Form 144'
      ];

      requiredMappings.forEach(formType => {
        expect(TemplateRegistry.hasTemplate(formType)).toBe(true);
      });
    });
  });

  describe('Template Existence Validation', () => {
    it('should verify all registered templates are importable', () => {
      const formTypes = ['Form 4', '10-K', '10-Q', '8-K', 'Form 144'];

      formTypes.forEach(formType => {
        const template = TemplateRegistry.getTemplate(formType);
        expect(template).toBeDefined();
        expect(typeof template).toBe('function');
      });
    });
  });

  describe('No Duplicate Mappings', () => {
    it('should not have conflicting template mappings', () => {
      // Verify that case variations map to the same template
      const form4Template = TemplateRegistry.getTemplate('Form 4');
      const form4UpperTemplate = TemplateRegistry.getTemplate('FORM 4');

      expect(form4Template.displayName).toBe(form4UpperTemplate.displayName);
    });

    it('should use identical templates for Form 3, 4, and 5 (insider trading)', () => {
      const form3 = TemplateRegistry.getTemplate('Form 3');
      const form4 = TemplateRegistry.getTemplate('Form 4');
      const form5 = TemplateRegistry.getTemplate('Form 5');

      expect(form3.displayName).toBe(form4.displayName);
      expect(form4.displayName).toBe(form5.displayName);
    });
  });
});
