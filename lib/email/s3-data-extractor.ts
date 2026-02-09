/**
 * Form S-3 (Secondary Offering) Data Extractor
 *
 * Extracts structured data from Form S-3 summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * Form S-3 = Secondary Offering Registration Statement filed by public companies.
 * Key data includes:
 * - Offering type (primary, secondary, shelf, ATM)
 * - Offering amount and dilution
 * - Selling shareholders
 * - Shelf registration details
 *
 * @module s3-data-extractor
 */

import {
  extractBulletPoints,
  extractMoneyValue as _extractMoneyValue,
  cleanChange as _cleanChange,
} from './extractor-utils';

/**
 * Selling shareholder details
 */
export interface SellingShareholder {
  name: string;
  shares: string;
}

/**
 * Shelf registration details
 */
export interface ShelfRegistration {
  totalAuthorized?: string;
  remainingCapacity?: string;
  expirationDate?: string;
}

/**
 * Extracted data from Form S-3 secondary offering
 */
export interface FormS3ExtractedData {
  offeringType?: string;
  offeringAmount?: string;
  sharesOffered?: string;
  dilutionImpact?: string;
  sellingShareholders: SellingShareholder[];
  shelfRegistration?: ShelfRegistration;
  useOfProceeds: string[];
  pricePerShare?: string;
}

/**
 * Extract structured Form S-3 data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extractS3Data(summaryText: string): FormS3ExtractedData {
  const result: FormS3ExtractedData = {
    sellingShareholders: [],
    useOfProceeds: [],
  };

  if (!summaryText) {
    return result;
  }

  // Extract offering type
  result.offeringType = extractOfferingType(summaryText);

  // Extract offering amount
  result.offeringAmount = extractOfferingAmount(summaryText);

  // Extract shares offered
  result.sharesOffered = extractSharesOffered(summaryText);

  // Extract dilution impact
  result.dilutionImpact = extractDilutionImpact(summaryText);

  // Extract selling shareholders
  result.sellingShareholders = extractSellingShareholders(summaryText);

  // Extract shelf registration details
  result.shelfRegistration = extractShelfRegistration(summaryText);

  // Extract use of proceeds
  result.useOfProceeds = extractUseOfProceeds(summaryText);

  // Extract price per share
  result.pricePerShare = extractPricePerShare(summaryText);

  return result;
}

/**
 * Extract offering type from S-3 text
 */
function extractOfferingType(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Offering\s+Type\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Identify by keywords
  const textLower = text.toLowerCase();
  if (textLower.includes('at-the-market') || textLower.includes('atm')) {
    return 'ATM Program';
  }
  if (textLower.includes('shelf registration') || textLower.includes('shelf offering')) {
    return 'Shelf Registration';
  }
  if (textLower.includes('secondary offering') || textLower.includes('selling shareholders')) {
    return 'Secondary Offering';
  }
  if (textLower.includes('primary offering')) {
    return 'Primary Offering';
  }

  return undefined;
}

/**
 * Extract offering amount
 */
function extractOfferingAmount(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Offering\s+Amount\*\*:\s*([\$\d,.]+[KMBkmb]?)/i);
  if (boldMatch) {
    return normalizeMoneyValue(boldMatch[1]);
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:raise|raising)\s+(?:up\s+to\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
    /offering\s+(?:of\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
    /([\$\d,.]+\s*(?:billion|million|B|M)?)\s+(?:secondary|shelf|equity)\s+offering/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeMoneyValue(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract shares offered
 */
function extractSharesOffered(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Shares\s+Offered\*\*:\s*([\d,]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:register|offering)\s+([\d,]+)\s+shares/i,
    /([\d,]+)\s+shares\s+(?:being\s+)?(?:registered|offered)/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Extract dilution impact
 */
function extractDilutionImpact(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Dilution\s+Impact\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:dilution|dilutive)\s+(?:impact\s+)?(?:of\s+)?(?:approximately\s+)?(\d+\.?\d*%)/i,
    /(\d+\.?\d*%)\s+dilution/i,
    /approximately\s+(\d+\.?\d*%)\s+(?:at\s+current|dilution)/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim() + ' dilution';
    }
  }

  return undefined;
}

/**
 * Extract selling shareholders
 */
function extractSellingShareholders(text: string): SellingShareholder[] {
  const shareholders: SellingShareholder[] = [];

  // Look for selling shareholders section
  const sectionMatch = text.match(/(?:##?\s*)?Selling\s+Shareholders?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    const sectionText = sectionMatch[1];
    // Pattern: - Name: X,XXX shares or - Name: X,XXX,XXX shares
    const bulletPattern = /[-*•]\s*([^:]+):\s*([\d,]+)\s*shares/gi;
    let match;
    while ((match = bulletPattern.exec(sectionText)) !== null && shareholders.length < 5) {
      shareholders.push({
        name: match[1].trim(),
        shares: match[2].trim(),
      });
    }
  }

  return shareholders;
}

/**
 * Extract shelf registration details
 */
function extractShelfRegistration(text: string): ShelfRegistration | undefined {
  const shelf: ShelfRegistration = {};

  // Look for shelf registration section or inline mentions
  const sectionMatch = text.match(/(?:##?\s*)?Shelf\s+Registration[:\s]*([\s\S]*?)(?:##|$)/i);
  const searchText = sectionMatch ? sectionMatch[1] : text;

  // Total authorized/capacity - handle both "Total Authorized: $1B" and "total capacity of $1B" formats
  const totalPatterns = [
    /Total\s+Authorized:\s*([\$\d,.]+[KMBkmb]?)/i,
    /(?:total\s+)?(?:capacity|authorized)\s*(?:of\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
  ];
  for (const pattern of totalPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      shelf.totalAuthorized = normalizeMoneyValue(match[1]);
      break;
    }
  }

  // Remaining capacity - handle both "Remaining Capacity: $700M" and "remaining capacity of $700M" formats
  const remainingPatterns = [
    /Remaining\s+Capacity:\s*([\$\d,.]+[KMBkmb]?)/i,
    /(?:remaining|available)\s+(?:capacity\s+)?(?:of\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
  ];
  for (const pattern of remainingPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      shelf.remainingCapacity = normalizeMoneyValue(match[1]);
      break;
    }
  }

  // Expiration date - handle both "Expiration Date: 2027-03-15" and "expires on ..." formats
  const expirationPatterns = [
    /Expiration\s+Date:\s*(\d{4}-\d{2}-\d{2})/i,
    /(?:expir(?:es?|ation))\s+(?:on\s+|date\s+)?(\d{4}-\d{2}-\d{2}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];
  for (const pattern of expirationPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      shelf.expirationDate = match[1].trim();
      break;
    }
  }

  // Return only if we found something
  if (shelf.totalAuthorized || shelf.remainingCapacity || shelf.expirationDate) {
    return shelf;
  }

  return undefined;
}

/**
 * Extract use of proceeds
 */
function extractUseOfProceeds(text: string): string[] {
  // Look for use of proceeds section
  const sectionMatch = text.match(/(?:##?\s*)?Use\s+of\s+Proceeds[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    return extractBulletPoints(sectionMatch[1]).slice(0, 3);
  }

  return [];
}

/**
 * Extract price per share
 */
function extractPricePerShare(text: string): string | undefined {
  const patterns = [
    /(?:price\s+per\s+share|share\s+price)\s+(?:of\s+)?(\$[\d,.]+)/i,
    /(\$[\d,.]+)\s+per\s+share/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Normalize money value to standard format
 */
function normalizeMoneyValue(value: string): string {
  let normalized = value.trim();
  normalized = normalized.replace(/\s*billion\s*/i, 'B');
  normalized = normalized.replace(/\s*million\s*/i, 'M');
  normalized = normalized.replace(/\s+/g, '');
  if (!normalized.startsWith('$')) {
    normalized = '$' + normalized;
  }
  return normalized;
}
