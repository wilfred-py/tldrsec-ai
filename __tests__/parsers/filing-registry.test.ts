/**
 * Tests for the Filing Type Registry
 */

import { FilingTypeRegistry } from '../../lib/parsers/filing-type-registry';
import { createFilingParser, detectFilingType } from '../../lib/parsers/filing-parser-factory';

// Make sure the registry is initialized
import '../../lib/parsers/filing-types';

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
  
  test('should create a parser for each filing type', () => {
    const allTypes = FilingTypeRegistry.getAllTypes();
    
    for (const type of allTypes) {
      const parser = createFilingParser(type);
      expect(parser).toBeInstanceOf(Function);
    }
  });
  
  test('should throw error for unsupported filing type', () => {
    expect(() => {
      createFilingParser('UNKNOWN');
    }).toThrow('Unsupported filing type');
  });
  
  test('should detect filing type from HTML content', () => {
    const html10K = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>TESLA INC (0001318605) - Form 10-K - Filed on 01/31/2023</title>
        </head>
        <body>
          <h1>Annual Report</h1>
        </body>
      </html>
    `;
    
    const htmlDEFA14A = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>TESLA INC (0001318605) - DEFA14A - Additional Proxy Materials</title>
        </head>
        <body>
          <h1>Additional Proxy Soliciting Materials</h1>
        </body>
      </html>
    `;
    
    expect(detectFilingType(html10K)).toBe('10-K');
    expect(detectFilingType(htmlDEFA14A)).toBe('DEFA14A');
  });
  
  test('should return null for undetectable filing type', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unknown Document</title>
        </head>
        <body>
          <h1>Hello World</h1>
        </body>
      </html>
    `;
    
    expect(detectFilingType(html)).toBeNull();
  });
}); 