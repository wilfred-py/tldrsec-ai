/**
 * Form 11-K (Employee Stock Plan) Data Extractor
 *
 * Extracts structured data from Form 11-K summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * Form 11-K = Employee Benefit Plan Annual Report.
 * Key data includes:
 * - Plan name and assets
 * - Participant count
 * - Contributions and distributions
 * - Investment options
 * - Company stock holdings
 *
 * @module form11k-data-extractor
 */

import { extractBulletPoints as _extractBulletPoints } from './extractor-utils';

/**
 * Investment option in the plan
 */
export interface InvestmentOption {
  name: string;
  allocation?: string;
  return?: string;
}

/**
 * Extracted data from Form 11-K employee plan report
 */
export interface Form11KExtractedData {
  planName?: string;
  planFiscalYear?: string;
  planAssets?: string;
  netAssetsChange?: string;
  participantCount?: string;
  contributionsReceived?: string;
  employerContributions?: string;
  benefitsDistributed?: string;
  investmentOptions: InvestmentOption[];
  companyStockHoldings?: string;
  planType?: string;
}

/**
 * Extract structured Form 11-K data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extractForm11KData(summaryText: string): Form11KExtractedData {
  const result: Form11KExtractedData = {
    investmentOptions: [],
  };

  if (!summaryText) {
    return result;
  }

  // Extract plan name
  result.planName = extractPlanName(summaryText);

  // Extract plan fiscal year
  result.planFiscalYear = extractPlanFiscalYear(summaryText);

  // Extract plan assets
  result.planAssets = extractPlanAssets(summaryText);

  // Extract net assets change
  result.netAssetsChange = extractNetAssetsChange(summaryText);

  // Extract participant count
  result.participantCount = extractParticipantCount(summaryText);

  // Extract contributions received
  result.contributionsReceived = extractContributionsReceived(summaryText);

  // Extract employer contributions
  result.employerContributions = extractEmployerContributions(summaryText);

  // Extract benefits distributed
  result.benefitsDistributed = extractBenefitsDistributed(summaryText);

  // Extract investment options
  result.investmentOptions = extractInvestmentOptions(summaryText);

  // Extract company stock holdings
  result.companyStockHoldings = extractCompanyStockHoldings(summaryText);

  // Extract plan type
  result.planType = extractPlanType(summaryText);

  return result;
}

/**
 * Extract plan name
 */
function extractPlanName(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Plan\s+Name\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:the\s+)?([A-Za-z\s]+(?:401\(k\)|ESOP|Savings|Retirement|Benefit)\s*(?:Plan|Program)?)/i,
    /([A-Za-z\s]+Plan)\s+reported/i,
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
 * Extract plan fiscal year
 */
function extractPlanFiscalYear(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Plan\s+Fiscal\s+Year\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:fiscal\s+)?year\s+(?:ended?|ending)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:as\s+of|ended?)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /\b(\d{4})\s+(?:fiscal\s+)?(?:year|annual)/i,
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
 * Extract plan assets
 */
function extractPlanAssets(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Plan\s+Assets\*\*:\s*([\$\d,.]+[KMBkmb]?)/i);
  if (boldMatch) {
    return normalizeMoneyValue(boldMatch[1]);
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:net\s+)?assets?\s+(?:available\s+for\s+benefits?\s+)?(?:of|totaled?|reported)\s+([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
    /(?:total\s+)?(?:plan\s+)?assets?\s+(?:of\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
    /([\$\d,.]+\s*(?:billion|million|B|M)?)\s+(?:in\s+)?(?:total\s+)?(?:plan\s+)?assets?/i,
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
 * Extract net assets change
 */
function extractNetAssetsChange(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Net\s+Assets?\s+Change\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:increase|decrease)\s+(?:of\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
    /([\$\d,.]+\s*(?:billion|million|B|M)?)\s+(?:increase|decrease)/i,
    /(?:represent|reflects?)\s+(?:a\s+)?([+-]?[\$\d,.]+\s*(?:billion|million|B|M)?)/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = normalizeMoneyValue(match[1]);
      // Add + if it's an increase
      if (text.toLowerCase().includes('increase') && !value.startsWith('+') && !value.startsWith('-')) {
        value = '+' + value;
      }
      return value;
    }
  }

  return undefined;
}

/**
 * Extract participant count
 */
function extractParticipantCount(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Participant\s+Count\*\*:\s*([\d,]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /([\d,]+)\s+(?:active\s+)?participants?/i,
    /participants?\s+(?:count|number)\s+(?:of\s+)?([\d,]+)/i,
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
 * Extract contributions received
 */
function extractContributionsReceived(text: string): string | undefined {
  // Look for contributions section first
  const sectionMatch = text.match(/(?:##?\s*)?Contributions?[:\s]*([\s\S]*?)(?:##|$)/i);
  const searchText = sectionMatch ? sectionMatch[1] : text;

  // Pattern 1: Employee contributions specifically
  const employeeMatch = searchText.match(/(?:employee|participant)\s+contributions?\s+(?:of\s+|totaled?\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i);
  if (employeeMatch) {
    return normalizeMoneyValue(employeeMatch[1]);
  }

  // Pattern 2: Total contributions
  const totalMatch = searchText.match(/(?:total\s+)?contributions?\s+(?:received\s+)?(?:of\s+|totaled?\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i);
  if (totalMatch) {
    return normalizeMoneyValue(totalMatch[1]);
  }

  // Pattern 3: Bullet point format
  const bulletMatch = text.match(/[-*•]\s*(?:Employee\s+)?Contributions?:\s*([\$\d,.]+[KMBkmb]?)/i);
  if (bulletMatch) {
    return normalizeMoneyValue(bulletMatch[1]);
  }

  return undefined;
}

/**
 * Extract employer contributions
 */
function extractEmployerContributions(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Employer\s+(?:Match(?:ing)?|Contributions?)\*\*:\s*([\$\d,.]+[KMBkmb]?)/i);
  if (boldMatch) {
    return normalizeMoneyValue(boldMatch[1]);
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:employer|company)\s+(?:matching\s+)?contributions?\s+(?:of\s+|totaled?\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
    /(?:matching\s+)?contributions?\s+(?:from\s+)?(?:employer|company)\s+(?:of\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeMoneyValue(match[1]);
    }
  }

  // Pattern 3: Bullet point format
  const bulletMatch = text.match(/[-*•]\s*Employer\s+Match:\s*([\$\d,.]+[KMBkmb]?)/i);
  if (bulletMatch) {
    return normalizeMoneyValue(bulletMatch[1]);
  }

  return undefined;
}

/**
 * Extract benefits distributed
 */
function extractBenefitsDistributed(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Benefits?\s+(?:Paid|Distributed)\*\*:\s*([\$\d,.]+[KMBkmb]?)/i);
  if (boldMatch) {
    return normalizeMoneyValue(boldMatch[1]);
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:benefits?|distributions?)\s+(?:paid|distributed)\s+(?:to\s+participants?\s+)?(?:of\s+|totaled?\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?)/i,
    /([\$\d,.]+\s*(?:billion|million|B|M)?)\s+(?:in\s+)?(?:benefits?|distributions?)/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeMoneyValue(match[1]);
    }
  }

  // Pattern 3: Bullet point format
  const bulletMatch = text.match(/[-*•]\s*Benefits?\s+Paid:\s*([\$\d,.]+[KMBkmb]?)/i);
  if (bulletMatch) {
    return normalizeMoneyValue(bulletMatch[1]);
  }

  return undefined;
}

/**
 * Extract investment options
 */
function extractInvestmentOptions(text: string): InvestmentOption[] {
  const options: InvestmentOption[] = [];

  // Look for investment options section
  const sectionMatch = text.match(/(?:##?\s*)?Investment\s+Options?[:\s]*([\s\S]*?)(?:##|$)/i);
  const searchText = sectionMatch ? sectionMatch[1] : text;

  // Pattern 1: Table format
  if (searchText.includes('|')) {
    const tableOptions = extractOptionsFromTable(searchText);
    if (tableOptions.length > 0) {
      return tableOptions;
    }
  }

  // Pattern 2: Bullet format
  // - S&P 500 Index: 35% allocation, +22% return
  const bulletPattern = /[-*•]\s*([^:]+):\s*(\d+%)\s*(?:allocation)?(?:,\s*([+-]?\d+%)\s*(?:return)?)?/gi;
  let match;
  while ((match = bulletPattern.exec(searchText)) !== null && options.length < 10) {
    options.push({
      name: match[1].trim(),
      allocation: match[2].trim(),
      return: match[3]?.trim(),
    });
  }

  return options;
}

/**
 * Extract investment options from table format
 */
function extractOptionsFromTable(text: string): InvestmentOption[] {
  const options: InvestmentOption[] = [];
  const tableLines = text.split('\n').filter(line => line.trim().startsWith('|'));

  if (tableLines.length < 3) return options;

  const headers = tableLines[0].split('|').map(h => h.trim().toLowerCase());
  const nameIdx = headers.findIndex(h =>
    h.includes('fund') || h.includes('option') || h.includes('name')
  );
  const allocationIdx = headers.findIndex(h => h.includes('allocation') || h.includes('%'));
  const returnIdx = headers.findIndex(h => h.includes('return') || h.includes('performance'));

  if (nameIdx === -1) return options;

  // Parse data rows
  for (let i = 2; i < tableLines.length && options.length < 10; i++) {
    const cells = tableLines[i].split('|').map(c => c.trim());

    if (cells.every(c => c === '' || c.match(/^-+$/))) continue;

    const name = cells[nameIdx];

    if (name && !name.match(/^-+$/)) {
      options.push({
        name,
        allocation: allocationIdx >= 0 ? cells[allocationIdx] : undefined,
        return: returnIdx >= 0 ? cells[returnIdx] : undefined,
      });
    }
  }

  return options;
}

/**
 * Extract company stock holdings
 */
function extractCompanyStockHoldings(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Company\s+Stock(?:\s+Holdings?)?\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:company|employer)\s+stock(?:\s+holdings?)?\s+(?:represent|comprise|account\s+for)\s+([^\n.]+)/i,
    /(?:company|employer)\s+stock(?:\s+holdings?)?\s+(?:of\s+)?([\$\d,.]+\s*(?:billion|million|B|M)?(?:\s*\([^)]+\))?)/i,
    /([\$\d,.]+\s*(?:billion|million|B|M)?|\d+%\s+of\s+(?:total\s+)?assets?)\s+(?:in\s+)?(?:company|employer)\s+stock/i,
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
 * Extract plan type
 */
function extractPlanType(text: string): string | undefined {
  const textLower = text.toLowerCase();

  if (textLower.includes('401(k)')) {
    return '401(k)';
  }
  if (textLower.includes('esop') || textLower.includes('employee stock ownership')) {
    return 'ESOP';
  }
  if (textLower.includes('profit sharing')) {
    return 'Profit Sharing';
  }
  if (textLower.includes('pension')) {
    return 'Pension';
  }
  if (textLower.includes('savings plan')) {
    return 'Savings Plan';
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
  if (normalized.match(/^\d/) && !normalized.startsWith('$')) {
    normalized = '$' + normalized;
  }
  return normalized;
}
