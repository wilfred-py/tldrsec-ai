/**
 * SC 13G (Passive Beneficial Ownership) Data Extractor
 *
 * Extracts structured data from SC 13G summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * SC 13G = Schedule 13G filed by passive investors who own more than 5%
 * of a company's voting securities. Key data includes:
 * - Filer name (institutional investor)
 * - Ownership percentage
 * - Shares owned
 * - Filing purpose (Initial/Amendment)
 *
 * @module sc13g-data-extractor
 */

/**
 * Extracted data from SC 13G beneficial ownership filing
 */
export interface SC13GExtractedData {
  filerName?: string;
  ownershipPercentage?: string;
  sharesOwned?: string;
  filingPurpose?: string;
  soleVotingPower?: string;
  sharedVotingPower?: string;
  soleDispositivePower?: string;
  sharedDispositivePower?: string;
}

/**
 * Extract structured SC 13G data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extractSC13GData(summaryText: string): SC13GExtractedData {
  const result: SC13GExtractedData = {};

  if (!summaryText) {
    return result;
  }

  // Extract filer name
  result.filerName = extractFilerName(summaryText);

  // Extract ownership percentage
  result.ownershipPercentage = extractOwnershipPercentage(summaryText);

  // Extract shares owned
  result.sharesOwned = extractSharesOwned(summaryText);

  // Extract filing purpose
  result.filingPurpose = extractFilingPurpose(summaryText);

  // Extract voting power details
  result.soleVotingPower = extractPowerValue(summaryText, 'sole voting');
  result.sharedVotingPower = extractPowerValue(summaryText, 'shared voting');
  result.soleDispositivePower = extractPowerValue(summaryText, 'sole dispositive');
  result.sharedDispositivePower = extractPowerValue(summaryText, 'shared dispositive');

  return result;
}

/**
 * Extract filer name from text
 *
 * Patterns:
 * - **Filer Name**: Vanguard Group Inc.
 * - "The Vanguard Group, Inc. has filed"
 * - "filed by Vanguard Group"
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

  // Pattern 3: Prose format - "XYZ has filed" or "filed by XYZ"
  const prosePatterns = [
    /(?:The\s+)?([A-Z][A-Za-z,.\s&]+(?:Inc\.?|LLC|LP|Corp\.?|Corporation|Partners|Group|Management|Capital|Fund|Advisors?))\s+(?:has\s+)?filed/i,
    /filed\s+by\s+(?:The\s+)?([A-Z][A-Za-z,.\s&]+(?:Inc\.?|LLC|LP|Corp\.?|Corporation|Partners|Group|Management|Capital|Fund|Advisors?))/i,
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
 * - **Ownership Percentage**: 8.5%
 * - beneficial ownership of 8.5%
 * - approximately 8.5 percent
 * - 8.5% of the outstanding shares
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
    /([\d.]+)\s*(?:%|percent)\s+(?:of\s+)?(?:the\s+)?(?:outstanding|total|voting)\s+(?:shares|stock|class)/i,
    /(?:owns?|holding|representing)\s+(?:approximately\s+)?([\d.]+)\s*(?:%|percent)/i,
    /(?:percentage|stake)\s+(?:of\s+)?([\d.]+)\s*%/i,
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
 * - **Shares Owned**: 125,000,000
 * - owns 125 million shares
 * - 125,000,000 shares of common stock
 */
function extractSharesOwned(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Shares\s+Owned\*\*:\s*([\d,]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Total shares label
  const labelMatch = text.match(/Total\s+shares:\s*([\d,]+)/i);
  if (labelMatch) {
    return labelMatch[1].trim();
  }

  // Pattern 3: Prose patterns with number words
  const prosePatterns = [
    /(?:owns?|holding|acquired|has)\s+([\d,]+)\s+(?:shares|units)/i,
    /([\d,]+)\s+shares?\s+(?:of\s+)?(?:common\s+)?stock/i,
    /([\d]+)\s+million\s+shares/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = match[1];
      // Handle "125 million shares" format
      if (text.toLowerCase().includes(match[0].toLowerCase()) &&
          text.toLowerCase().includes('million')) {
        const millionMatch = match[0].match(/(\d+)\s+million/i);
        if (millionMatch) {
          value = (parseInt(millionMatch[1], 10) * 1000000).toLocaleString();
        }
      }
      return value;
    }
  }

  return undefined;
}

/**
 * Extract filing purpose (Initial or Amendment)
 *
 * Patterns:
 * - **Filing Purpose**: Amendment
 * - Schedule 13G/A (amendment indicator)
 * - initial filing
 */
function extractFilingPurpose(text: string): string | undefined {
  // Pattern 1: Markdown bold format
  const boldMatch = text.match(/\*\*Filing\s+Purpose\*\*:\s*(Initial|Amendment)/i);
  if (boldMatch) {
    return capitalizeFirst(boldMatch[1]);
  }

  // Pattern 2: Check for amendment indicators
  const amendmentPatterns = [
    /13G\/A/i,
    /amendment/i,
    /amended/i,
  ];

  for (const pattern of amendmentPatterns) {
    if (pattern.test(text)) {
      return 'Amendment';
    }
  }

  // Pattern 3: Check for initial filing
  if (/initial\s+(?:filing|report)/i.test(text)) {
    return 'Initial';
  }

  return undefined;
}

/**
 * Extract voting or dispositive power values
 */
function extractPowerValue(text: string, powerType: string): string | undefined {
  const pattern = new RegExp(
    `${powerType}\\s+power[:\\s]*([\d,]+)`,
    'i'
  );
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Normalize percentage to standard format (e.g., "8.5%")
 */
function normalizePercentage(value: string): string {
  let normalized = value.trim();
  if (!normalized.endsWith('%')) {
    normalized += '%';
  }
  return normalized;
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
