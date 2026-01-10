/**
 * Form S-1 (IPO Registration) Data Extractor
 *
 * Extracts structured data from Form S-1 summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * Form S-1 = IPO Registration Statement filed when a company goes public.
 * Key data includes:
 * - Offering size and price range
 * - Use of proceeds
 * - Business description
 * - Financial highlights
 * - Risk factors
 * - Underwriters
 *
 * @module s1-data-extractor
 */

import {
  extractBulletPoints,
  extractFinancialHighlightsFromProse,
  // extractMoneyValue, // TODO: Use in future implementation
  cleanChange,
  type FinancialHighlight,
} from './extractor-utils';

/**
 * Extracted data from Form S-1 IPO registration
 */
export interface FormS1ExtractedData {
  offeringSize?: string;
  priceRange?: string;
  sharesOffered?: string;
  businessDescription?: string;
  useOfProceeds: string[];
  financialHighlights: FinancialHighlight[];
  riskFactors: string[];
  underwriters: string[];
  expectedTradingDate?: string;
  exchangeListing?: string;
}

/**
 * Extract structured Form S-1 data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extractS1Data(summaryText: string): FormS1ExtractedData {
  const result: FormS1ExtractedData = {
    useOfProceeds: [],
    financialHighlights: [],
    riskFactors: [],
    underwriters: [],
  };

  if (!summaryText) {
    return result;
  }

  // Extract offering size
  result.offeringSize = extractOfferingSize(summaryText);

  // Extract price range
  result.priceRange = extractPriceRange(summaryText);

  // Extract shares offered
  result.sharesOffered = extractSharesOffered(summaryText);

  // Extract business description
  result.businessDescription = extractBusinessDescription(summaryText);

  // Extract use of proceeds
  result.useOfProceeds = extractUseOfProceeds(summaryText);

  // Extract financial highlights from sections and prose
  result.financialHighlights = extractIPOFinancialHighlights(summaryText);

  // Extract risk factors
  result.riskFactors = extractRiskFactors(summaryText);

  // Extract underwriters
  result.underwriters = extractUnderwriters(summaryText);

  // Extract exchange listing
  result.exchangeListing = extractExchangeListing(summaryText);

  // Extract expected trading date
  result.expectedTradingDate = extractExpectedTradingDate(summaryText);

  return result;
}

/**
 * Extract offering size from IPO text
 *
 * Patterns:
 * - **Offering Size**: $500M
 * - raising $500 million
 * - IPO of $500M
 */
function extractOfferingSize(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Offering\s+Size\*\*:\s*([\$\d,.]+[KMBkmb]?)/i);
  if (boldMatch) {
    return normalizeMoneyValue(boldMatch[1]);
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:raising|IPO\s+of|offering\s+of|initial\s+public\s+offering\s+of)\s+([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
    /([\$\d,.]+\s*(?:billion|million|B|M)?)\s+(?:IPO|initial\s+public\s+offering)/i,
    /offering\s+of\s+approximately\s+([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
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
 * Extract price range for IPO
 *
 * Patterns:
 * - **Price Range**: $18-$21 per share
 * - price range of $18-$21
 * - expected price of $18 to $21
 */
function extractPriceRange(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Price\s+Range\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /price\s+range\s+(?:of\s+)?(\$[\d.,]+\s*[-–to]+\s*\$[\d.,]+(?:\s+per\s+share)?)/i,
    /expected\s+price\s+(?:of\s+)?(\$[\d.,]+\s*[-–to]+\s*\$[\d.,]+(?:\s+per\s+share)?)/i,
    /(\$[\d.,]+\s*[-–to]+\s*\$[\d.,]+)\s+per\s+share/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      let range = match[1].trim();
      // Normalize "to" to dash
      range = range.replace(/\s+to\s+/i, '-');
      return range;
    }
  }

  return undefined;
}

/**
 * Extract number of shares being offered
 */
function extractSharesOffered(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Shares\s+Offered\*\*:\s*([\d,]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:offering|offer)\s+([\d,]+)\s+shares/i,
    /([\d,]+)\s+(?:shares|common\s+stock)\s+(?:being\s+)?offered/i,
    /(?:selling|issuing)\s+([\d,]+)\s+shares/i,
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
 * Extract business description
 */
function extractBusinessDescription(text: string): string | undefined {
  // Look for business description section
  const sectionMatch = text.match(/(?:##?\s*)?Business\s+Description[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    // Get first non-empty line
    const lines = sectionMatch[1].split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      return lines[0].trim();
    }
  }

  // Pattern: "provides/is a ..." sentences
  const descPatterns = [
    /(?:company|firm)\s+(?:is\s+a|provides?)\s+([^.]+\.)/i,
    /(?:leading|premier)\s+(?:provider|developer)\s+of\s+([^.]+\.)/i,
  ];

  for (const pattern of descPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim().slice(0, 200);
    }
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
    return extractBulletPoints(sectionMatch[1]).slice(0, 4);
  }

  // Look for inline mentions
  const proceeds: string[] = [];
  const patterns = [
    /proceeds\s+will\s+be\s+used\s+for\s+([^.]+)/i,
    /use\s+proceeds\s+for\s+([^.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Split on commas/and
      const items = match[1].split(/,\s*(?:and\s+)?/);
      for (const item of items) {
        if (item.trim().length > 5) {
          proceeds.push(item.trim());
        }
      }
    }
  }

  return proceeds.slice(0, 4);
}

/**
 * Extract risk factors
 */
function extractRiskFactors(text: string): string[] {
  // Look for risk section
  const sectionMatch = text.match(/(?:##?\s*)?Risk(?:\s+Factors?)?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    return extractBulletPoints(sectionMatch[1]).slice(0, 3);
  }

  return [];
}

/**
 * Extract underwriters
 */
function extractUnderwriters(text: string): string[] {
  const underwriters: string[] = [];

  // Look for underwriters section
  const sectionMatch = text.match(/(?:##?\s*)?Underwriters?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    const points = extractBulletPoints(sectionMatch[1]);
    return points.slice(0, 5);
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

/**
 * Extract exchange listing
 */
function extractExchangeListing(text: string): string | undefined {
  const patterns = [
    /list(?:ed|ing)\s+on\s+(?:the\s+)?(NYSE|NASDAQ|New\s+York\s+Stock\s+Exchange)/i,
    /trade\s+(?:under|on)\s+(?:the\s+)?(NYSE|NASDAQ)/i,
    /(NYSE|NASDAQ)\s+(?:under\s+)?(?:ticker\s+)?(?:symbol\s+)?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return undefined;
}

/**
 * Extract expected trading date
 */
function extractExpectedTradingDate(text: string): string | undefined {
  const patterns = [
    /expected\s+to\s+(?:begin\s+)?trad(?:e|ing)\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /trading\s+(?:expected\s+)?(?:to\s+)?(?:begin|start)\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
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
 * Extract financial highlights from IPO text
 *
 * Handles:
 * - ## Financial Highlights section with bullet points
 * - Prose format
 */
function extractIPOFinancialHighlights(text: string): FinancialHighlight[] {
  const highlights: FinancialHighlight[] = [];
  const seenLabels = new Set<string>();

  // First try to find Financial Highlights section
  const sectionMatch = text.match(/(?:##?\s*)?Financial\s+Highlights?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    const sectionText = sectionMatch[1];
    // Extract bullet points: - Revenue: $450M (+45% YoY)
    const bulletPattern = /[-*•]\s*([^:]+):\s*([\$\d,.]+[KMBkmb]?%?)\s*(?:\(([^)]+)\))?/gi;
    let match;
    while ((match = bulletPattern.exec(sectionText)) !== null) {
      const label = match[1].trim();
      const labelKey = label.toLowerCase();

      if (!seenLabels.has(labelKey) && highlights.length < 4) {
        seenLabels.add(labelKey);
        highlights.push({
          label,
          value: match[2].trim(),
          change: cleanChange(match[3]),
        });
      }
    }
  }

  // If we didn't get enough from sections, try prose extraction
  if (highlights.length < 4) {
    const proseHighlights = extractFinancialHighlightsFromProse(text, 4);
    for (const h of proseHighlights) {
      if (!seenLabels.has(h.label.toLowerCase()) && highlights.length < 4) {
        seenLabels.add(h.label.toLowerCase());
        highlights.push(h);
      }
    }
  }

  return highlights;
}

/**
 * Normalize money value to standard format
 */
function normalizeMoneyValue(value: string): string {
  let normalized = value.trim();
  // Convert "500 million" to "500M"
  normalized = normalized.replace(/\s*billion\s*/i, 'B');
  normalized = normalized.replace(/\s*million\s*/i, 'M');
  // Remove spaces
  normalized = normalized.replace(/\s+/g, '');
  // Ensure $ prefix
  if (!normalized.startsWith('$')) {
    normalized = '$' + normalized;
  }
  return normalized;
}
