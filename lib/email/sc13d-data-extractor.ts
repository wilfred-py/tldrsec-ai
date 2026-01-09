/**
 * SC 13D (Activist Beneficial Ownership) Data Extractor
 *
 * Extracts structured data from SC 13D summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * SC 13D = Schedule 13D filed when an entity acquires more than 5% of
 * a company's voting securities with intent to influence control.
 * Key data includes:
 * - Filer name (activist investor)
 * - Ownership percentage
 * - Shares owned
 * - Stated purpose/intentions
 *
 * @module sc13d-data-extractor
 */

import { extractBulletPoints } from './extractor-utils';

/**
 * Extracted data from SC 13D activist ownership filing
 */
export interface SC13DExtractedData {
  filerName?: string;
  ownershipPercentage?: string;
  sharesOwned?: string;
  purpose?: string;
  intentions: string[];
  isActivist: boolean;
  isGroupFiling: boolean;
  sourceOfFunds?: string;
}

/**
 * Extract structured SC 13D data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extractSC13DData(summaryText: string): SC13DExtractedData {
  const result: SC13DExtractedData = {
    intentions: [],
    isActivist: false,
    isGroupFiling: false,
  };

  if (!summaryText) {
    return result;
  }

  // Extract filer name
  result.filerName = extractFilerName(summaryText);

  // Extract ownership percentage
  result.ownershipPercentage = extractOwnershipPercentage(summaryText);

  // Extract shares owned
  result.sharesOwned = extractSharesOwned(summaryText);

  // Extract purpose
  result.purpose = extractPurpose(summaryText);

  // Extract intentions
  result.intentions = extractIntentions(summaryText);

  // Determine if activist
  result.isActivist = determineIfActivist(summaryText, result.purpose);

  // Check for group filing
  result.isGroupFiling = isGroupFiling(summaryText);

  // Extract source of funds
  result.sourceOfFunds = extractSourceOfFunds(summaryText);

  return result;
}

/**
 * Extract filer name from text
 *
 * Patterns:
 * - **Filer Name**: Elliott Management Corporation
 * - "Elliott Management, the activist hedge fund"
 * - "filed by Elliott Management"
 */
function extractFilerName(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Filer\s+Name\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Plain label format
  const labelMatch = text.match(/Filer(?:\s+Name)?:\s*([^\n]+)/i);
  if (labelMatch) {
    return labelMatch[1].trim();
  }

  // Pattern 3: Prose format - "XYZ has filed", "XYZ has disclosed", "filed by XYZ"
  const prosePatterns = [
    /(?:The\s+)?([A-Z][A-Za-z,.\s&]+(?:Inc\.?|LLC|LP|Corp\.?|Corporation|Partners|Group|Management|Capital|Fund|Advisors?))\s+(?:has\s+)?(?:filed|disclosed)/i,
    /filed\s+by\s+(?:The\s+)?([A-Z][A-Za-z,.\s&]+(?:Inc\.?|LLC|LP|Corp\.?|Corporation|Partners|Group|Management|Capital|Fund|Advisors?))/i,
    /([A-Z][A-Za-z,.\s&]+(?:Management|Capital|Partners|Fund)),\s+(?:the\s+)?(?:activist|hedge\s+fund)/i,
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
 * Extract ownership percentage from text
 *
 * Patterns:
 * - **Ownership Percentage**: 12.3%
 * - beneficial ownership of 12.3%
 * - 12.3% stake
 */
function extractOwnershipPercentage(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Ownership\s+Percentage\*\*:\s*([\d.]+%?)/i);
  if (boldMatch) {
    return normalizePercentage(boldMatch[1]);
  }

  // Pattern 2: Various prose formats
  const prosePatterns = [
    /(?:beneficial\s+)?ownership\s+(?:of\s+)?(?:approximately\s+)?([\d.]+)\s*%/i,
    /([\d.]+)\s*(?:%|percent)\s+(?:stake|ownership|interest|position)/i,
    /(?:owns?|holding|representing|acquired)\s+(?:approximately\s+)?(?:a\s+)?([\d.]+)\s*(?:%|percent)/i,
    /([\d.]+)\s*(?:%|percent)\s+(?:of\s+)?(?:the\s+)?(?:outstanding|total|voting)\s+(?:shares|stock)/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizePercentage(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract shares owned from text
 *
 * Patterns:
 * - **Shares Owned**: 45,000,000
 * - 45 million shares
 * - owns 45,000,000 shares
 */
function extractSharesOwned(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Shares\s+Owned\*\*:\s*([\d,]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Million format
  const millionMatch = text.match(/(\d+)\s+million\s+shares/i);
  if (millionMatch) {
    return (parseInt(millionMatch[1], 10) * 1000000).toLocaleString();
  }

  // Pattern 3: Standard numeric format
  const prosePatterns = [
    /(?:owns?|holding|acquired|representing)\s+(?:approximately\s+)?([\d,]+)\s+(?:shares|units)/i,
    /([\d,]+)\s+shares?\s+(?:of\s+)?(?:common\s+)?stock/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Extract stated purpose from text
 *
 * Patterns:
 * - **Purpose**: Seek board representation
 * - purpose is to seek board seats
 * - intends to engage with management
 */
function extractPurpose(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Purpose\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Stated purpose
  const statedMatch = text.match(/(?:stated\s+)?purpose\s+(?:is\s+)?(?:to\s+)?([^.]+)/i);
  if (statedMatch) {
    return statedMatch[1].trim();
  }

  // Pattern 3: Investment-only language
  if (/(?:investment\s+purposes?\s+only|passive\s+investment)/i.test(text)) {
    return 'Investment purposes only';
  }

  // Pattern 4: Board-related
  if (/(?:seek(?:ing)?|request(?:ing)?)\s+board\s+(?:seats?|representation)/i.test(text)) {
    return 'Seek board representation';
  }

  // Pattern 5: Strategic alternatives
  if (/strategic\s+alternatives/i.test(text)) {
    return 'Explore strategic alternatives';
  }

  return undefined;
}

/**
 * Extract intentions from bullet points or prose
 */
function extractIntentions(text: string): string[] {
  // Look for Stated Intentions section
  const sectionMatch = text.match(/(?:##?\s*)?(?:Stated\s+)?Intentions?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    const points = extractBulletPoints(sectionMatch[1]);
    if (points.length > 0) {
      return points.slice(0, 5);
    }
  }

  // Look for inline intentions
  const intentions: string[] = [];
  const intentPatterns = [
    /intend(?:s)?\s+to\s+([^.]+)/gi,
    /may\s+(?:seek|engage|pursue)\s+([^.]+)/gi,
  ];

  for (const pattern of intentPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1].length > 10 && match[1].length < 200) {
        intentions.push(match[1].trim());
      }
    }
  }

  return intentions.slice(0, 5);
}

/**
 * Determine if this is an activist filing based on language
 */
function determineIfActivist(text: string, purpose?: string): boolean {
  // Strong activist indicators
  const activistPatterns = [
    /(?:seek(?:ing)?|request(?:ing)?)\s+(?:\w+\s+)?board\s+(?:seats?|representation)/i,
    /strategic\s+alternatives/i,
    /(?:replace|remove)\s+(?:CEO|management|board)/i,
    /restructuring/i,
    /operational\s+(?:improvements?|changes?)/i,
    /return\s+(?:capital|value)\s+to\s+shareholders/i,
    /oppose\s+(?:management|merger|acquisition)/i,
    /activist(?:\s+investor)?/i,
    /engage\s+with\s+(?:management|the\s+board)/i,
  ];

  for (const pattern of activistPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Check purpose
  if (purpose) {
    const purposeLower = purpose.toLowerCase();
    if (purposeLower.includes('board') ||
        purposeLower.includes('strategic') ||
        purposeLower.includes('restructur')) {
      return true;
    }
  }

  // Investment-only is NOT activist
  if (/(?:investment\s+purposes?\s+only|passive\s+investment)/i.test(text)) {
    return false;
  }

  return false;
}

/**
 * Check if this is a group filing
 */
function isGroupFiling(text: string): boolean {
  const groupPatterns = [
    /filed\s+by\s+a\s+group/i,
    /group\s+(?:consisting|comprised|composed)\s+of/i,
    /acting\s+(?:in\s+concert|as\s+a\s+group)/i,
    /\band\b.*\band\b.*filed/i, // Multiple filers
  ];

  for (const pattern of groupPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract source of funds
 */
function extractSourceOfFunds(text: string): string | undefined {
  const sectionMatch = text.match(/(?:##?\s*)?Source\s+of\s+Funds?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (sectionMatch) {
    const firstLine = sectionMatch[1].split('\n')[0].trim();
    if (firstLine) {
      return firstLine;
    }
  }

  const patterns = [
    /source\s+of\s+funds?:?\s*([^.]+)/i,
    /(?:acquired|purchased)\s+(?:using|through|with)\s+([^.]+)/i,
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
 * Normalize percentage to standard format (e.g., "12.3%")
 */
function normalizePercentage(value: string): string {
  let normalized = value.trim();
  if (!normalized.endsWith('%')) {
    normalized += '%';
  }
  return normalized;
}
