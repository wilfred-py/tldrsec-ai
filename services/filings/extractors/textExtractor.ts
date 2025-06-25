/**
 * Text Extraction Module
 * 
 * Provides utilities for extracting text content from SEC filings
 */

import { secLogger } from '../../../utils/logger';

/**
 * Extracts text content from an XML node
 * @param node XML Element node
 * @returns Extracted text content
 */
export function extractNodeTextContent(node: Element): string {
  const textNodes = Array.from(node.childNodes)
    .filter(child => child.nodeType === 3) // Text nodes only
    .map(child => child.textContent?.trim())
    .filter(text => text && text.length > 0);

  return textNodes.join(' ');
}

/**
 * Extracts text content from a filing
 * @param content The filing content
 * @returns Extracted text content
 */
export async function extractTextContent(content: string): Promise<string> {
  try {
    const textPattern = /<TEXT>([\s\S]*?)<\/TEXT>/gi;
    const textMatches = content.match(textPattern);
    if (!textMatches) return '';

    const textContent = textMatches
      .map(match => {
        const textOnly = match.replace(/<\/?TEXT>/gi, '');
        return textOnly.trim();
      })
      .join('\n\n');

    return textContent;
  } catch (error) {
    secLogger.error('Error extracting text content:', error);
    return '';
  }
}
