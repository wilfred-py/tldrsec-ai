/**
 * Table Extraction Module
 * 
 * Provides utilities for extracting table data from SEC filings
 */

import { secLogger } from '../../../utils/logger';

/**
 * Extracts table data from an XML table element
 * @param table XML table Element
 * @returns 2D array of table cell contents
 */
export function extractTableData(table: Element): string[][] {
  const rows = Array.from(table.getElementsByTagName('tr'));
  return rows.map(row => {
    const cells = Array.from(row.getElementsByTagName('td'));
    return cells.map(cell => cell.textContent?.trim() || '');
  });
}

/**
 * Extracts table data from a filing content
 * @param content The filing content
 * @returns Extracted table data
 */
export async function extractFilingTableData(content: string): Promise<{ [key: string]: string[] }> {
  try {
    // Extract tables using regex
    const tablePattern = /<TABLE[^>]*>([\s\S]*?)<\/TABLE>/gi;
    const tables: { [key: string]: string[] } = {};
    let tableIndex = 0;
    
    // Use exec in a loop instead of matchAll for better TypeScript compatibility
    let tableMatch;
    while ((tableMatch = tablePattern.exec(content)) !== null) {
      if (tableMatch[1]) {
        // Extract rows from the table
        const rowPattern = /<TR[^>]*>([\s\S]*?)<\/TR>/gi;
        const tableData: string[] = [];
        
        // Use exec in a loop for row matching
        let rowMatch;
        while ((rowMatch = rowPattern.exec(tableMatch[1])) !== null) {
          if (rowMatch[1]) {
            // Extract cells from the row
            const cellPattern = /<T[HD][^>]*>([\s\S]*?)<\/T[HD]>/gi;
            const rowData: string[] = [];
            
            // Use exec in a loop for cell matching
            let cellMatch;
            while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
              if (cellMatch[1]) {
                // Clean up cell content
                const cellContent = cellMatch[1].replace(/<[^>]+>/g, ' ').trim();
                rowData.push(cellContent);
              }
            }
            
            if (rowData.length > 0) {
              tableData.push(rowData.join(' | '));
            }
          }
        }
        
        if (tableData.length > 0) {
          tables[`table_${tableIndex}`] = tableData;
          tableIndex++;
        }
      }
    }
    
    return tables;
  } catch (error) {
    secLogger.error('Error extracting table data:', error);
    return {};
  }
}
