/**
 * Table Extractor Tests
 * 
 * Tests the table extraction functionality for SEC filings
 */

import { extractFilingTableData } from '../filings/extractors/tableExtractor';

// Mock the logger to prevent console output during tests
jest.mock('../../utils/logger', () => ({
  secLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Table Extractor', () => {
  test('should extract table data from HTML content', async () => {
    // Arrange
    const mockHtml = `
      <div>
        <TABLE>
          <TR><TH>Header 1</TH><TH>Header 2</TH><TH>Header 3</TH></TR>
          <TR><TD>Row 1, Cell 1</TD><TD>Row 1, Cell 2</TD><TD>Row 1, Cell 3</TD></TR>
          <TR><TD>Row 2, Cell 1</TD><TD>Row 2, Cell 2</TD><TD>Row 2, Cell 3</TD></TR>
        </TABLE>
      </div>
    `;

    // Act
    const result = await extractFilingTableData(mockHtml);

    // Assert
    expect(result).toHaveProperty('table_0');
    expect(result.table_0).toHaveLength(3);
    expect(result.table_0[0]).toBe('Header 1 | Header 2 | Header 3');
    expect(result.table_0[1]).toBe('Row 1, Cell 1 | Row 1, Cell 2 | Row 1, Cell 3');
    expect(result.table_0[2]).toBe('Row 2, Cell 1 | Row 2, Cell 2 | Row 2, Cell 3');
  });

  test('should extract multiple tables from HTML content', async () => {
    // Arrange
    const mockHtml = `
      <div>
        <TABLE>
          <TR><TH>Table 1 Header</TH></TR>
          <TR><TD>Table 1 Data</TD></TR>
        </TABLE>
        <p>Some text between tables</p>
        <TABLE>
          <TR><TH>Table 2 Header</TH></TR>
          <TR><TD>Table 2 Data</TD></TR>
        </TABLE>
      </div>
    `;

    // Act
    const result = await extractFilingTableData(mockHtml);

    // Assert
    expect(Object.keys(result)).toHaveLength(2);
    expect(result).toHaveProperty('table_0');
    expect(result).toHaveProperty('table_1');
    expect(result.table_0[0]).toBe('Table 1 Header');
    expect(result.table_0[1]).toBe('Table 1 Data');
    expect(result.table_1[0]).toBe('Table 2 Header');
    expect(result.table_1[1]).toBe('Table 2 Data');
  });

  test('should handle tables with nested HTML tags', async () => {
    // Arrange
    const mockHtml = `
      <TABLE>
        <TR><TD><span>Formatted</span> <b>Text</b></TD></TR>
      </TABLE>
    `;

    // Act
    const result = await extractFilingTableData(mockHtml);

    // Assert
    expect(result).toHaveProperty('table_0');
    // The regex replacement in extractFilingTableData replaces tags with spaces
    // which can result in multiple spaces between words
    expect(result.table_0[0].replace(/\s+/g, ' ').trim()).toBe('Formatted Text');
  });

  test('should handle empty tables gracefully', async () => {
    // Arrange
    const mockHtml = `
      <TABLE></TABLE>
      <TABLE><TR></TR></TABLE>
    `;

    // Act
    const result = await extractFilingTableData(mockHtml);

    // Assert
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('should handle malformed tables gracefully', async () => {
    // Arrange
    const mockHtml = `
      <TABLE>
        <TR><TD>Missing closing tags</TD></TR>
      </TABLE>
    `;

    // Act
    const result = await extractFilingTableData(mockHtml);

    // Assert
    expect(result).toHaveProperty('table_0');
    expect(result.table_0[0]).toBe('Missing closing tags');
  });

  test('should return empty object when no tables are found', async () => {
    // Arrange
    const mockHtml = '<div>No tables here</div>';

    // Act
    const result = await extractFilingTableData(mockHtml);

    // Assert
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('should handle error gracefully', async () => {
    // Arrange - passing null should cause an error
    const mockHtml = null as unknown as string;

    // Act
    const result = await extractFilingTableData(mockHtml);

    // Assert
    expect(Object.keys(result)).toHaveLength(0);
  });
});
