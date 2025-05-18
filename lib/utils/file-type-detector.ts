/**
 * File Type Detector Utilities
 * 
 * This module provides utilities for detecting file types based on content.
 */

/**
 * Enum for file types
 */
export enum FileType {
  PDF = 'pdf',
  HTML = 'html',
  UNKNOWN = 'unknown'
}

/**
 * Check if content is a PDF file based on its signature
 * 
 * @param content - The content to check (Buffer or string)
 * @returns True if the content appears to be a PDF file
 */
export function isPDF(content: Buffer | string): boolean {
  // Check for PDF signature at the beginning of the file
  if (Buffer.isBuffer(content)) {
    return content.length >= 5 && content.slice(0, 5).toString() === '%PDF-';
  } else if (typeof content === 'string') {
    return content.startsWith('%PDF-');
  }
  
  return false;
}

/**
 * Check if content is an HTML file based on common patterns
 * 
 * @param content - The content to check (Buffer or string)
 * @returns True if the content appears to be an HTML file
 */
export function isHTML(content: Buffer | string): boolean {
  const sample = Buffer.isBuffer(content) 
    ? content.slice(0, 1000).toString('utf8') 
    : content.substring(0, 1000);
  
  // Look for HTML tags
  return (
    /<html/i.test(sample) || 
    /<!DOCTYPE html/i.test(sample) || 
    /<body/i.test(sample) || 
    /<head/i.test(sample)
  );
}

/**
 * Detect the type of a file based on its content
 * 
 * @param content - The content to analyze
 * @returns The detected file type
 */
export function detectFileType(content: Buffer | string): FileType {
  if (isPDF(content)) {
    return FileType.PDF;
  } else if (isHTML(content)) {
    return FileType.HTML;
  }
  
  return FileType.UNKNOWN;
}

/**
 * Detect the SEC filing type (10-K, 10-Q, etc.) from content
 * 
 * @param content - The content to analyze
 * @returns The detected filing type or null if not detected
 */
export function detectFilingType(content: Buffer | string): string | null {
  // First determine if it's a PDF or HTML
  const fileType = detectFileType(content);
  
  // For PDF files, return a special indicator - actual detection would happen after parsing
  if (fileType === FileType.PDF) {
    return 'PDF';
  }
  
  // For HTML, extract and analyze the content
  const html = Buffer.isBuffer(content) ? content.toString('utf8', 0, 2000) : content;
  
  // Extract title if present
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  // Check for common patterns in the title
  if (/Form 10-K|Annual Report|10-K/i.test(title)) return '10-K';
  if (/Form 10-Q|Quarterly Report|10-Q/i.test(title)) return '10-Q';
  if (/Form 8-K|Current Report|8-K/i.test(title)) return '8-K';
  if (/Form 4|Statement of Changes|beneficial ownership/i.test(title)) return 'Form4';
  if (/DEFA14A|DEFA 14A|Additional Proxy Materials|Additional Proxy Soliciting/i.test(title)) return 'DEFA14A';
  if (/Schedule 13D|SC 13D|beneficial ownership report/i.test(title)) return 'SC 13D';
  if (/Form 144|Notice of Proposed Sale/i.test(title)) return '144';
  
  // Check content if title doesn't provide clear indication
  if (/Form 10-K/i.test(html)) return '10-K';
  if (/Form 10-Q/i.test(html)) return '10-Q';
  if (/Form 8-K/i.test(html)) return '8-K';
  if (/DEFA14A|DEFA 14A|Additional Proxy Materials/i.test(html)) return 'DEFA14A';
  
  // No recognized pattern found
  return null;
} 