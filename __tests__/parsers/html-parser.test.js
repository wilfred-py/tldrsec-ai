import { parseHTML, FilingSectionType } from '../../lib/parsers/html-parser';
describe('HTML Parser', () => {
    const sampleHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test SEC Filing</title>
      </head>
      <body>
        <div>
          <h1>Company Name - Test Filing</h1>
          <p>This is a sample SEC filing document for testing purposes.</p>
          
          <h2>Risk Factors</h2>
          <p>Sample risk factor text here.</p>
          
          <h2>Management's Discussion and Analysis</h2>
          <p>Sample MD&A text here.</p>
          
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
                <td>$100M</td>
                <td>$20M</td>
              </tr>
              <tr>
                <td>Q2 2023</td>
                <td>$110M</td>
                <td>$22M</td>
              </tr>
            </tbody>
          </table>
          
          <h3>Risk Mitigation</h3>
          <ul>
            <li>Risk item 1</li>
            <li>Risk item 2</li>
            <li>Risk item 3</li>
          </ul>
        </div>
      </body>
    </html>
  `;
    test('should parse HTML and extract title', () => {
        const sections = parseHTML(sampleHTML);
        // Should find title section
        const titleSection = sections.find(s => s.type === FilingSectionType.TITLE);
        expect(titleSection).toBeDefined();
        expect(titleSection === null || titleSection === void 0 ? void 0 : titleSection.content).toBe('Test SEC Filing');
    });
    test('should extract document structure', () => {
        const sections = parseHTML(sampleHTML);
        // Should find at least one section
        expect(sections.length).toBeGreaterThan(1);
        // Section should have content
        const contentSections = sections.filter(s => s.type === FilingSectionType.SECTION);
        expect(contentSections.length).toBeGreaterThan(0);
        // Content should include heading text or part of the document content
        const sectionContent = contentSections[0].content;
        expect(sectionContent).toMatch(/sample SEC filing document|Risk Factors|Management/);
    });
    test('should extract tables', () => {
        var _a, _b, _c;
        const sections = parseHTML(sampleHTML, { extractTables: true });
        // Should find the table
        const tableSections = sections.filter(s => s.type === FilingSectionType.TABLE);
        expect(tableSections.length).toBe(1);
        // Table should have a title
        expect(tableSections[0].title).toBe('Financial Data');
        // Table should have data
        expect(tableSections[0].tableData).toBeDefined();
        // Table data should include headers and rows (might be 3 or 4 based on implementation)
        expect((_a = tableSections[0].tableData) === null || _a === void 0 ? void 0 : _a.length).toBeGreaterThanOrEqual(3);
        // Check table content - first row should have headers
        const foundHeader = (_b = tableSections[0].tableData) === null || _b === void 0 ? void 0 : _b.some(row => row.includes('Period'));
        expect(foundHeader).toBe(true);
        // Check some row has the data
        const foundData = (_c = tableSections[0].tableData) === null || _c === void 0 ? void 0 : _c.some(row => row.includes('Q1 2023'));
        expect(foundData).toBe(true);
    });
    test('should extract lists', () => {
        var _a, _b;
        const sections = parseHTML(sampleHTML, { extractLists: true });
        // Should find the list
        const listSections = sections.filter(s => s.type === FilingSectionType.LIST);
        expect(listSections.length).toBe(1);
        // List should have items
        expect(listSections[0].listItems).toBeDefined();
        expect((_a = listSections[0].listItems) === null || _a === void 0 ? void 0 : _a.length).toBe(3);
        // Check list content
        expect((_b = listSections[0].listItems) === null || _b === void 0 ? void 0 : _b[0]).toBe('Risk item 1');
    });
});
