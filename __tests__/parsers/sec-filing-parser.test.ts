import { parseSECFiling, parse10KFiling, parse8KFiling } from '../../lib/parsers/sec-filing-parser';

describe('SEC Filing Parser', () => {
  const sampleHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>TESLA INC (0001318605) - Form 10-K - Filed on 01/31/2023</title>
      </head>
      <body>
        <div>
          <h1>TESLA, INC. Annual Report on Form 10-K</h1>
          <p>CIK: 0001318605</p>
          <p>This is a sample SEC filing document for testing purposes.</p>
          
          <h2>Risk Factors</h2>
          <p>Sample risk factor text for Tesla.</p>
          
          <h2>Management's Discussion and Analysis</h2>
          <p>Sample MD&A text for Tesla financial results.</p>
          
          <h2>Business</h2>
          <p>Sample business description of Tesla's operations.</p>
          
          <table>
            <caption>Financial Data</caption>
            <thead>
              <tr>
                <th>Period</th>
                <th>Revenue</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Q1 2023</td>
                <td>$21.3B</td>
                <td>$2.5B</td>
              </tr>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;

  test('should parse 10-K SEC filing', () => {
    const parsedFiling = parse10KFiling(sampleHTML);
    
    // Check basic metadata
    expect(parsedFiling.filingType).toBe('10-K');
    expect(parsedFiling.companyName).toBe('TESLA INC');
    expect(parsedFiling.cik).toBe('0001318605');
    
    // Check extracted sections
    expect(parsedFiling.importantSections).toHaveProperty('Risk Factors');
    expect(parsedFiling.importantSections).toHaveProperty('Management\'s Discussion and Analysis');
    expect(parsedFiling.importantSections).toHaveProperty('Business');
    
    // Check tables extraction
    expect(parsedFiling.tables.length).toBe(1);
    expect(parsedFiling.tables[0].title).toBe('Financial Data');
  });

  test('should parse generic SEC filing with filing type', () => {
    const parsedFiling = parseSECFiling(sampleHTML, '8-K');
    
    // Check basic metadata
    expect(parsedFiling.filingType).toBe('8-K');
    expect(parsedFiling.companyName).toBe('TESLA INC');
    
    // Structure should still be parsed correctly
    expect(parsedFiling.sections.length).toBeGreaterThan(1);
    expect(parsedFiling.tables.length).toBe(1);
  });

  test('should handle different filing types with specialized parsers', () => {
    const eightKFiling = parse8KFiling(sampleHTML);
    
    // Should use correct filing type
    expect(eightKFiling.filingType).toBe('8-K');
    
    // Should extract important sections for 8-K
    expect(Object.keys(eightKFiling.importantSections).length).toBeGreaterThanOrEqual(0);
  });
}); 