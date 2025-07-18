/**
 * SEC Filing Extractor Factory
 * 
 * Provides a factory pattern for creating filing-specific extractors
 * to eliminate duplicate extraction logic
 */

import * as cheerio from 'cheerio';
import { FilingType } from '../sec-edgar/types';
import { extractXmlContent, cleanHtmlContent } from './filing-extractor-utils.js';

// Interface for filing extractors
export interface FilingExtractor {
  extract(content: string, $: cheerio.CheerioAPI): string;
}

// Regex patterns for identifying specific content
export const PATTERNS = {
  // Pattern to identify Form 4 XML
  FORM4_XML: /<(?:ownershipDocument|sec:ownershipDocument)/i,
  // Pattern to identify Form 144 XML
  FORM144_XML: /<(?:intentToSell|sec:intentToSell)/i,
};

// Form 424B2 extractor - Prospectus
class Form424B2Extractor implements FilingExtractor {
  extract(content: string, $: cheerio.CheerioAPI): string {
    // For 424B2, focus on the main content and remove navigation/headers
    const mainContent = $('.main-content, .body, #main-content, .filing-content').first();
    if (mainContent.length) {
      return cleanHtmlContent(mainContent.html() || '');
    }
    // Fallback to standard HTML cleaning if specific elements not found
    return cleanHtmlContent(content);
  }
}

// Form 11-K extractor - Employee Stock Purchase Plans
class Form11KExtractor implements FilingExtractor {
  extract(content: string, $: cheerio.CheerioAPI): string {
    // For 11-K, prioritize tables and financial data
    const tables = $('table');
    if (tables.length) {
      let tableContent = '';
      tables.each((_, table) => {
        tableContent += $(table).text() + '\n\n';
      });
      if (tableContent.length > 500) { // Only use tables if substantial content found
        return tableContent;
      }
    }
    // Fallback to standard HTML cleaning
    return cleanHtmlContent(content);
  }
}

// Form 4 extractor - Insider Trading
class Form4Extractor implements FilingExtractor {
  extract(content: string, $: cheerio.CheerioAPI): string {
    // For Form 4, check if it's XML format
    if (PATTERNS.FORM4_XML.test(content)) {
      return extractXmlContent(content, 'ownershipDocument');
    }
    // Otherwise treat as HTML
    return cleanHtmlContent(content);
  }
}

// Form 144 extractor - Notice of Proposed Sale
class Form144Extractor implements FilingExtractor {
  extract(content: string, $: cheerio.CheerioAPI): string {
    // For Form 144, check if it's XML format
    if (PATTERNS.FORM144_XML.test(content)) {
      return extractXmlContent(content, 'intentToSell');
    }
    // Otherwise treat as HTML
    return cleanHtmlContent(content);
  }
}

// CORRESP extractor - Correspondence
class CorrespExtractor implements FilingExtractor {
  extract(content: string, $: cheerio.CheerioAPI): string {
    // For correspondence, preserve formatting but clean HTML
    return cleanHtmlContent(content, { preserveFormatting: true });
  }
}

// PX14A6G extractor - Notice of exempt solicitation
class PX14A6GExtractor implements FilingExtractor {
  extract(content: string, $: cheerio.CheerioAPI): string {
    // For PX14A6G, focus on the main content
    const mainContent = $('.main-content, .body, #main-content').first();
    if (mainContent.length) {
      return cleanHtmlContent(mainContent.html() || '');
    }
    // Fallback to standard HTML cleaning
    return cleanHtmlContent(content);
  }
}

// Default extractor for all other forms
class DefaultExtractor implements FilingExtractor {
  extract(content: string, $: cheerio.CheerioAPI): string {
    return cleanHtmlContent(content);
  }
}

// Factory class for creating filing extractors
export class FilingExtractorFactory {
  // Map of filing types to their extractors
  private static extractors: Record<string, FilingExtractor> = {
    '424B2': new Form424B2Extractor(),
    '11-K': new Form11KExtractor(),
    '4': new Form4Extractor(),
    '144': new Form144Extractor(),
    'CORRESP': new CorrespExtractor(),
    'UPLOAD': new CorrespExtractor(), // Reuse CORRESP extractor for UPLOAD
    'PX14A6G': new PX14A6GExtractor(),
    'default': new DefaultExtractor()
  };

  /**
   * Get the appropriate extractor for a filing type
   * @param filingType - The type of SEC filing
   * @returns The appropriate filing extractor
   */
  static getExtractor(filingType: FilingType): FilingExtractor {
    return this.extractors[filingType as string] || this.extractors['default'];
  }
}
