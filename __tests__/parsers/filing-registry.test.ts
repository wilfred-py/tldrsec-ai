/**
 * Tests for the Filing Type Registry
 */

import { FilingTypeRegistry } from '../../lib/parsers/filing-type-registry';

describe('Filing Type Registry', () => {
  test('should register all supported filing types', () => {
    const allTypes = FilingTypeRegistry.getAllTypes();

    // Check that we have all our expected filing types
    expect(allTypes).toContain('10-K');
    expect(allTypes).toContain('10-Q');
    expect(allTypes).toContain('8-K');
    expect(allTypes).toContain('Form4');
    expect(allTypes).toContain('4');
    expect(allTypes).toContain('DEFA14A');
    expect(allTypes).toContain('DEFA 14A');
    expect(allTypes).toContain('SC 13D');
    expect(allTypes).toContain('SC13D');
    expect(allTypes).toContain('144');
    expect(allTypes).toContain('Form 144');
  });

  test('should get section configuration for a filing type', () => {
    const config = FilingTypeRegistry.getSectionConfig('10-K');

    expect(config).toBeDefined();
    expect(config?.importantSections).toContain('Risk Factors');
    expect(config?.importantSections).toContain('Management\'s Discussion and Analysis');
  });

  test('should return empty array for unsupported filing type', () => {
    const sections = FilingTypeRegistry.getImportantSections('UNKNOWN');

    expect(sections).toEqual([]);
  });

  test('should provide descriptions for all filing types', () => {
    const descriptions = FilingTypeRegistry.getFilingTypeDescriptions();

    expect(descriptions.size).toBeGreaterThan(0);
    expect(descriptions.get('10-K')).toContain('Annual report');
    expect(descriptions.get('DEFA14A')).toContain('Additional proxy soliciting materials');
  });
});
