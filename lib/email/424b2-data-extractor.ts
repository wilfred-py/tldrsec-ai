/**
 * 424B2 (Prospectus Supplement) Data Extractor
 *
 * Extracts structured data from 424B2 summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * 424B2 = Prospectus Supplement filed for securities offerings.
 * Can be for debt (bonds/notes), equity (stock), or structured products.
 * Key data includes:
 * - Offering type (Debt/Equity/Structured Notes)
 * - Offering amount
 * - Interest rate (for debt)
 * - Maturity date (for debt)
 * - Price per share (for equity)
 *
 * @module 424b2-data-extractor
 */

import { extractBulletPoints } from './extractor-utils';

/**
 * Extracted data from 424B2 prospectus supplement
 */
export interface Form424B2ExtractedData {
  offeringType?: string;
  offeringAmount?: string;
  interestRate?: string;
  maturityDate?: string;
  sharesOffered?: string;
  pricePerShare?: string;
  linkedTo?: string;
  settlementDate?: string;
  useOfProceeds?: string;
  underwriters: string[];
}

/**
 * Extract structured 424B2 data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extract424B2Data(summaryText: string): Form424B2ExtractedData {
  const result: Form424B2ExtractedData = {
    underwriters: [],
  };

  if (!summaryText) {
    return result;
  }

  // Extract offering type
  result.offeringType = extractOfferingType(summaryText);

  // Extract offering amount
  result.offeringAmount = extractOfferingAmount(summaryText);

  // Extract interest rate (for debt offerings)
  result.interestRate = extractInterestRate(summaryText);

  // Extract maturity date
  result.maturityDate = extractMaturityDate(summaryText);

  // Extract shares offered (for equity offerings)
  result.sharesOffered = extractSharesOffered(summaryText);

  // Extract price per share
  result.pricePerShare = extractPricePerShare(summaryText);

  // Extract linked index (for structured notes)
  result.linkedTo = extractLinkedTo(summaryText);

  // Extract settlement date
  result.settlementDate = extractSettlementDate(summaryText);

  // Extract use of proceeds
  result.useOfProceeds = extractUseOfProceeds(summaryText);

  // Extract underwriters
  result.underwriters = extractUnderwriters(summaryText);

  return result;
}

/**
 * Extract offering type from text
 *
 * Patterns:
 * - **Offering Type**: Senior Notes
 * - offering of common stock
 * - structured notes linked to
 */
function extractOfferingType(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Offering\s+Type\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Detect debt offerings
  const debtPatterns = [
    /(?:Senior|Subordinated)\s+(?:Notes|Bonds)/i,
    /(?:Fixed|Floating)\s+Rate\s+(?:Notes|Bonds)/i,
    /aggregate\s+principal\s+amount/i,
  ];

  for (const pattern of debtPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  // Pattern 3: Detect equity offerings
  if (/(?:shares?\s+of\s+)?common\s+stock/i.test(text) &&
      /(?:offering|public\s+offering)/i.test(text)) {
    return 'Equity - Common Stock';
  }

  // Pattern 4: Detect structured notes
  if (/structured\s+notes?/i.test(text)) {
    return 'Structured Notes';
  }

  return undefined;
}

/**
 * Extract offering amount from text
 *
 * Patterns:
 * - **Offering Amount**: $2,000,000,000
 * - $2 billion aggregate principal
 * - raise approximately $2.5 billion
 */
function extractOfferingAmount(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Offering\s+Amount\*\*:\s*(\$[\d,]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Principal amount with full number
  const principalMatch = text.match(/(\$[\d,]+)\s+(?:aggregate\s+)?principal\s+amount/i);
  if (principalMatch) {
    return principalMatch[1];
  }

  // Pattern 3: Billion/million format
  const billionMatch = text.match(/(\$[\d.]+)\s*billion/i);
  if (billionMatch) {
    return `${billionMatch[1]}B`;
  }

  const millionMatch = text.match(/(\$[\d.]+)\s*million/i);
  if (millionMatch) {
    return `${millionMatch[1]}M`;
  }

  // Pattern 4: Gross proceeds
  const proceedsMatch = text.match(/(?:gross\s+)?proceeds\s+(?:of\s+)?(?:approximately\s+)?(\$[\d,.]+\s*(?:billion|million)?)/i);
  if (proceedsMatch) {
    let value = proceedsMatch[1];
    value = value.replace(/\s*billion/i, 'B').replace(/\s*million/i, 'M');
    return value.replace(/\s+/g, '');
  }

  // Pattern 5: Offering at a price
  const offeringMatch = text.match(/offering\s+(\$[\d,]+)/i);
  if (offeringMatch) {
    return offeringMatch[1];
  }

  return undefined;
}

/**
 * Extract interest rate from text
 *
 * Patterns:
 * - **Interest Rate**: 5.25%
 * - 5.25% Senior Notes
 * - bearing interest at 5.25%
 * - coupon of 5.25%
 */
function extractInterestRate(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Interest\s+Rate\*\*:\s*([\d.]+%)/i);
  if (boldMatch) {
    return boldMatch[1];
  }

  // Pattern 2: Interest rate patterns
  const patterns = [
    /interest\s+(?:rate\s+)?(?:of\s+)?([\d.]+)\s*%/i,
    /([\d.]+)\s*%\s*(?:Senior|Subordinated)?\s*Notes?/i,
    /(?:coupon|rate)\s+(?:of\s+)?([\d.]+)\s*%/i,
    /([\d.]+)\s*%\s+coupon/i,
    /bearing\s+interest\s+(?:at\s+)?([\d.]+)\s*%/i,
    /([\d.]+)\s*%\s+per\s+annum/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return `${match[1]}%`;
    }
  }

  return undefined;
}

/**
 * Extract maturity date from text
 *
 * Patterns:
 * - **Maturity Date**: March 15, 2034
 * - due March 15, 2034
 * - matures on 2034-03-15
 */
function extractMaturityDate(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Maturity(?:\s+Date)?\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Due date patterns (ordered by specificity)
  const patterns = [
    // ISO date format first (most specific)
    /(?:due|matures?\s+(?:on\s+)?)\s*(\d{4}-\d{2}-\d{2})/i,
    // Full date with day number
    /(?:due|matures?\s+(?:on\s+)?)\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    // Maturity date of Month Day, Year
    /maturity(?:\s+date)?(?:\s+of)?:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    // Maturity date of Month Year (no day)
    /maturity(?:\s+date)?(?:\s+of)?:?\s*([A-Za-z]+\s+\d{4})/i,
    // Due/matures Month Year (no day)
    /(?:due|matures?)\s+(?:in\s+)?([A-Za-z]+\s+\d{4})/i,
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
 * Extract shares offered from text
 *
 * Patterns:
 * - offering 10 million shares
 * - 10,000,000 shares of common stock
 */
function extractSharesOffered(text: string): string | undefined {
  // Pattern 1: Million format
  const millionMatch = text.match(/(?:offering|offer)\s+(\d+)\s+million\s+shares/i);
  if (millionMatch) {
    return `${millionMatch[1]} million`;
  }

  // Pattern 2: Full number format
  const fullMatch = text.match(/(?:offering|offer)\s+([\d,]+)\s+shares/i);
  if (fullMatch) {
    return fullMatch[1];
  }

  // Pattern 3: Shares of common stock
  const stockMatch = text.match(/([\d,]+)\s+shares?\s+(?:of\s+)?common\s+stock/i);
  if (stockMatch) {
    return stockMatch[1];
  }

  return undefined;
}

/**
 * Extract price per share from text
 *
 * Patterns:
 * - price of $250.00 per share
 * - offering price of $250
 * - at $250.00 per share
 */
function extractPricePerShare(text: string): string | undefined {
  const patterns = [
    /(?:public\s+)?(?:offering\s+)?price\s+(?:of\s+)?(\$[\d,.]+)\s*(?:per\s+share)?/i,
    /(?:at|price:?)\s*(\$[\d,.]+)\s+per\s+share/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Extract linked index for structured notes
 *
 * Patterns:
 * - **Linked To**: S&P 500 Index
 * - linked to the S&P 500
 * - linked to the performance of
 */
function extractLinkedTo(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Linked\s+To\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const patterns = [
    /linked\s+to\s+(?:the\s+)?(?:performance\s+of\s+)?(?:the\s+)?([A-Z][A-Za-z0-9\s&]+(?:Index|ETF))/i,
    /(?:underlying|reference)\s+(?:index|asset):?\s*([A-Za-z0-9\s&]+(?:Index)?)/i,
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
 * Extract settlement date
 *
 * Patterns:
 * - Settlement Date: January 25, 2024
 * - settles on January 25, 2024
 */
function extractSettlementDate(text: string): string | undefined {
  const patterns = [
    /Settlement\s+Date:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /settl(?:es?|ement)\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
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
 * Extract use of proceeds
 */
function extractUseOfProceeds(text: string): string | undefined {
  // Look for use of proceeds section
  const sectionMatch = text.match(/(?:##?\s*)?Use\s+of\s+Proceeds[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    const firstLine = sectionMatch[1].split('\n')[0].trim();
    if (firstLine && firstLine.length > 10) {
      return firstLine;
    }
  }

  // Inline patterns
  const patterns = [
    /(?:net\s+)?proceeds\s+(?:will\s+be\s+used|for)\s+([^.]+)/i,
    /intend(?:s)?\s+to\s+use\s+(?:the\s+)?(?:net\s+)?proceeds\s+(?:for\s+)?([^.]+)/i,
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
 * Extract underwriters from text
 */
function extractUnderwriters(text: string): string[] {
  const underwriters: string[] = [];

  // Look for underwriters section
  const sectionMatch = text.match(/(?:##?\s*)?Underwriters?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    const points = extractBulletPoints(sectionMatch[1]);
    if (points.length > 0) {
      return points.slice(0, 5);
    }

    // Check for comma-separated list
    const listMatch = sectionMatch[1].match(/^([A-Z][A-Za-z\s&.,]+(?:LLC|Inc\.?)(?:,\s*[A-Z][A-Za-z\s&.,]+(?:LLC|Inc\.?))*)/);
    if (listMatch) {
      return listMatch[1].split(/,\s*/).slice(0, 5);
    }
  }

  // Look for known underwriters in text
  const knownUnderwriters = [
    'Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'JP Morgan', 'J.P. Morgan',
    'Bank of America', 'BofA Securities', 'Citigroup', 'Barclays',
    'Credit Suisse', 'Deutsche Bank', 'UBS', 'Wells Fargo',
  ];

  for (const uw of knownUnderwriters) {
    if (text.includes(uw)) {
      underwriters.push(uw);
    }
  }

  return underwriters.slice(0, 5);
}
