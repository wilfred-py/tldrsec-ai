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
    const tableMatches = content.matchAll(tablePattern);
    
    if (!tableMatches) return {};
    
    const tables: { [key: string]: string[] } = {};
    let tableIndex = 0;
    
    for (const match of tableMatches) {
      if (match[1]) {
        // Extract rows from the table
        const rowPattern = /<TR[^>]*>([\s\S]*?)<\/TR>/gi;
        const rowMatches = match[1].matchAll(rowPattern);
        
        if (!rowMatches) continue;
        
        const tableData: string[] = [];
        
        for (const rowMatch of rowMatches) {
          if (rowMatch[1]) {
            // Extract cells from the row
            const cellPattern = /<T[HD][^>]*>([\s\S]*?)<\/T[HD]>/gi;
            const cellMatches = rowMatch[1].matchAll(cellPattern);
            
            if (!cellMatches) continue;
            
            const rowData: string[] = [];
            
            for (const cellMatch of cellMatches) {
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
