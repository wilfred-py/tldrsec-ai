/**
 * DEF 14A (Proxy Statement) Data Extractor
 *
 * Extracts structured data from DEF 14A summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * DEF 14A = Definitive Proxy Statement filed before shareholder meetings.
 * Key data includes:
 * - Meeting date and type
 * - Executive compensation
 * - Board and shareholder proposals
 * - Director nominees
 * - Say-on-pay information
 *
 * @module def14a-data-extractor
 */

// import { extractBulletPoints } from './extractor-utils'; // TODO: Use in future implementation

/**
 * Executive compensation entry
 */
export interface ExecutiveCompensation {
  name: string;
  title?: string;
  totalCompensation: string;
}

/**
 * Board or shareholder proposal
 */
export interface Proposal {
  number?: string;
  description: string;
  recommendation: string;
}

/**
 * Director nominee
 */
export interface DirectorNominee {
  name: string;
  independent?: string;
  tenure?: string;
}

/**
 * Say-on-pay details
 */
export interface SayOnPay {
  included?: string;
  recommendation?: string;
  frequency?: string;
}

/**
 * Extracted data from DEF 14A proxy statement
 */
export interface FormDEF14AExtractedData {
  meetingDate?: string;
  meetingType?: string;
  recordDate?: string;
  executiveCompensation: ExecutiveCompensation[];
  ceoPayRatio?: string;
  boardProposals: Proposal[];
  shareholderProposals: Proposal[];
  directorNominees: DirectorNominee[];
  sayOnPay?: SayOnPay;
  auditorRatification?: {
    firm?: string;
    fees?: string;
  };
}

/**
 * Extract structured DEF 14A data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extractDEF14AData(summaryText: string): FormDEF14AExtractedData {
  const result: FormDEF14AExtractedData = {
    executiveCompensation: [],
    boardProposals: [],
    shareholderProposals: [],
    directorNominees: [],
  };

  if (!summaryText) {
    return result;
  }

  // Extract meeting date
  result.meetingDate = extractMeetingDate(summaryText);

  // Extract meeting type
  result.meetingType = extractMeetingType(summaryText);

  // Extract record date
  result.recordDate = extractRecordDate(summaryText);

  // Extract executive compensation
  result.executiveCompensation = extractExecutiveCompensation(summaryText);

  // Extract CEO pay ratio
  result.ceoPayRatio = extractCeoPayRatio(summaryText);

  // Extract board proposals
  result.boardProposals = extractBoardProposals(summaryText);

  // Extract shareholder proposals
  result.shareholderProposals = extractShareholderProposals(summaryText);

  // Extract director nominees
  result.directorNominees = extractDirectorNominees(summaryText);

  // Extract say-on-pay
  result.sayOnPay = extractSayOnPay(summaryText);

  // Extract auditor ratification
  result.auditorRatification = extractAuditorRatification(summaryText);

  return result;
}

/**
 * Extract meeting date
 */
function extractMeetingDate(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Meeting\s+Date\*\*:\s*(\d{4}-\d{2}-\d{2})/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:annual|special)\s+meeting\s+(?:of\s+shareholders?\s+)?(?:on|scheduled\s+for)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /meeting\s+(?:on|date)\s+(\d{4}-\d{2}-\d{2})/i,
    /shareholders?\s+on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeDate(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract meeting type
 */
function extractMeetingType(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Meeting\s+Type\*\*:\s*([^\n]+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Identify by keywords
  const textLower = text.toLowerCase();
  if (textLower.includes('special meeting')) {
    return 'Special Meeting';
  }
  if (textLower.includes('annual meeting')) {
    return 'Annual Meeting';
  }

  return undefined;
}

/**
 * Extract record date
 */
function extractRecordDate(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*Record\s+Date\*\*:\s*(\d{4}-\d{2}-\d{2})/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /record\s+(?:date|as\s+of)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /shareholders?\s+of\s+record\s+(?:as\s+of\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeDate(match[1]);
    }
  }

  return undefined;
}

/**
 * Extract executive compensation
 */
function extractExecutiveCompensation(text: string): ExecutiveCompensation[] {
  const compensation: ExecutiveCompensation[] = [];

  // Look for executive compensation section - require markdown header format (## prefix or start of line)
  const sectionMatch = text.match(/(?:^|\n)##?\s*Executive\s+Compensation[:\s]*([\s\S]*?)(?:##|$)/i);
  const searchText = sectionMatch ? sectionMatch[1] : text;

  // Pattern 1: Table format
  if (searchText.includes('|')) {
    const tableComp = extractCompensationFromTable(searchText);
    if (tableComp.length > 0) {
      return tableComp;
    }
  }

  // Pattern 2: Prose patterns
  // CEO John Smith received total compensation of $15.2 million
  const prosePatterns = [
    /(?:CEO|CFO|COO|President)\s+([A-Za-z\s]+)\s+received\s+(?:total\s+)?compensation\s+of\s+([\$\d,.]+\s*(?:million|M)?)/gi,
    /([A-Za-z\s]+)\s+(?:\((?:CEO|CFO|COO|President)[^)]*\))?\s+received\s+([\$\d,.]+\s*(?:million|M)?)/gi,
  ];

  for (const pattern of prosePatterns) {
    let match;
    while ((match = pattern.exec(searchText)) !== null && compensation.length < 5) {
      const name = match[1].trim();
      const amount = normalizeCompensation(match[2]);
      if (name && amount && !compensation.some(c => c.name === name)) {
        compensation.push({
          name,
          totalCompensation: amount,
        });
      }
    }
  }

  return compensation;
}

/**
 * Extract compensation from table format
 */
function extractCompensationFromTable(text: string): ExecutiveCompensation[] {
  const compensation: ExecutiveCompensation[] = [];
  const tableLines = text.split('\n').filter(line => line.trim().startsWith('|'));

  if (tableLines.length < 3) return compensation;

  // Split and filter empty cells (tables often have empty first/last cells from leading/trailing |)
  const headers = tableLines[0].split('|').map(h => h.trim().toLowerCase()).filter(h => h.length > 0);

  // Find column indices
  let nameIdx = headers.findIndex(h => h.includes('name'));
  const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('position'));
  const compIdx = headers.findIndex(h =>
    h.includes('compensation') || h.includes('total')
  );

  // If no explicit name column, use first column
  if (nameIdx === -1 && headers.length > 0) {
    nameIdx = 0;
  }

  if (compIdx === -1) return compensation;

  // Parse data rows (skip header and separator)
  for (let i = 2; i < tableLines.length && compensation.length < 5; i++) {
    // Filter empty cells the same way
    const cells = tableLines[i].split('|').map(c => c.trim()).filter(c => c.length > 0);

    // Skip separator rows
    if (cells.every(c => c.match(/^-+$/))) continue;

    const name = cells[nameIdx];
    const title = titleIdx >= 0 && titleIdx < cells.length ? cells[titleIdx] : undefined;
    const comp = compIdx < cells.length ? cells[compIdx] : undefined;

    if (name && comp && !name.match(/^-+$/)) {
      compensation.push({
        name,
        title,
        totalCompensation: comp,
      });
    }
  }

  return compensation;
}

/**
 * Extract CEO pay ratio
 */
function extractCeoPayRatio(text: string): string | undefined {
  // Pattern 1: Markdown format
  const boldMatch = text.match(/\*\*CEO\s+Pay\s+Ratio\*\*:\s*(\d+:\d+)/i);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Pattern 2: Prose patterns
  const prosePatterns = [
    /(?:CEO|pay)\s+(?:to\s+)?(?:median\s+)?(?:employee\s+)?(?:pay\s+)?ratio\s+(?:is\s+|of\s+)?(\d+)\s*(?:to|:)\s*(\d+)/i,
    /(\d+)\s*(?:to|:)\s*(\d+)\s+(?:CEO|pay\s+ratio)/i,
  ];

  for (const pattern of prosePatterns) {
    const match = text.match(pattern);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }

  return undefined;
}

/**
 * Extract board proposals
 */
function extractBoardProposals(text: string): Proposal[] {
  const proposals: Proposal[] = [];

  // Look for board proposals section
  const sectionMatch = text.match(/(?:##?\s*)?Board\s+Proposals?[:\s]*([\s\S]*?)(?:##|$)/i);
  const searchText = sectionMatch ? sectionMatch[1] : text;

  // Pattern: 1. Description - Board recommends FOR
  const proposalPattern = /(\d+\.?)\s*(.+?)\s*[-–]\s*Board\s+recommends?\s+(FOR|AGAINST)/gi;
  let match;
  while ((match = proposalPattern.exec(searchText)) !== null && proposals.length < 6) {
    proposals.push({
      number: match[1].replace('.', ''),
      description: match[2].trim(),
      recommendation: match[3].toUpperCase(),
    });
  }

  // Also look for "vote FOR" patterns
  if (proposals.length === 0) {
    const votePatterns = [
      /(?:recommends?|vote)\s+(FOR|AGAINST)\s+(?:the\s+)?(.+?)(?:\.|$)/gi,
    ];

    for (const pattern of votePatterns) {
      while ((match = pattern.exec(text)) !== null && proposals.length < 6) {
        proposals.push({
          description: match[2].trim(),
          recommendation: match[1].toUpperCase(),
        });
      }
    }
  }

  return proposals;
}

/**
 * Extract shareholder proposals
 */
function extractShareholderProposals(text: string): Proposal[] {
  const proposals: Proposal[] = [];

  // Look for shareholder proposals section
  const sectionMatch = text.match(/(?:##?\s*)?Shareholder\s+Proposals?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (!sectionMatch) return proposals;

  const searchText = sectionMatch[1];

  // Pattern: 5. Description - Board recommends AGAINST
  const proposalPattern = /(\d+\.?)\s*(.+?)\s*[-–]\s*Board\s+recommends?\s+(FOR|AGAINST)/gi;
  let match;
  while ((match = proposalPattern.exec(searchText)) !== null && proposals.length < 4) {
    proposals.push({
      number: match[1].replace('.', ''),
      description: match[2].trim(),
      recommendation: match[3].toUpperCase(),
    });
  }

  // Prose pattern for shareholder proposals
  if (proposals.length === 0) {
    const proseMatch = text.match(/shareholder\s+proposal[s]?\s+(?:have\s+been\s+)?submitted[:\s]+(.+?)(?:\.|$)/i);
    if (proseMatch) {
      // Parse items separated by "and"
      const items = proseMatch[1].split(/,?\s+and\s+/i);
      for (const item of items) {
        if (item.trim().length > 5) {
          proposals.push({
            description: item.trim(),
            recommendation: 'AGAINST',
          });
        }
      }
    }
  }

  return proposals;
}

/**
 * Extract director nominees
 */
function extractDirectorNominees(text: string): DirectorNominee[] {
  const nominees: DirectorNominee[] = [];

  // Look for director nominees section
  const sectionMatch = text.match(/(?:##?\s*)?Director\s+Nominees?[:\s]*([\s\S]*?)(?:##|$)/i);
  if (!sectionMatch) return nominees;

  const searchText = sectionMatch[1];

  // Pattern: - Name (Independent, X years)
  const bulletPattern = /[-*•]\s*([A-Za-z\s]+)\s*\(([^)]+)\)/gi;
  let match;
  while ((match = bulletPattern.exec(searchText)) !== null && nominees.length < 15) {
    const name = match[1].trim();
    const details = match[2].trim();

    const nominee: DirectorNominee = { name };

    // Parse independence
    if (details.toLowerCase().includes('independent')) {
      nominee.independent = 'Independent';
    } else if (details.toLowerCase().includes('non-independent')) {
      nominee.independent = 'Non-Independent';
    }

    // Parse tenure
    const tenureMatch = details.match(/(\d+)\s*years?/i);
    if (tenureMatch) {
      nominee.tenure = tenureMatch[1] + ' years';
    }

    nominees.push(nominee);
  }

  return nominees;
}

/**
 * Extract say-on-pay details
 */
function extractSayOnPay(text: string): SayOnPay | undefined {
  const sayOnPay: SayOnPay = {};

  // Look for say-on-pay mentions
  if (text.toLowerCase().includes('say-on-pay') || text.toLowerCase().includes('say on pay')) {
    sayOnPay.included = 'Yes';

    // Extract recommendation
    const recMatch = text.match(/say[- ]on[- ]pay[^.]*recommends?\s+(FOR|AGAINST)/i);
    if (recMatch) {
      sayOnPay.recommendation = recMatch[1].toUpperCase();
    }

    // Extract frequency
    const freqMatch = text.match(/(annual|biennial|triennial)\s+(?:say[- ]on[- ]pay|frequency)/i);
    if (freqMatch) {
      sayOnPay.frequency = freqMatch[1].charAt(0).toUpperCase() + freqMatch[1].slice(1);
    }

    return sayOnPay;
  }

  return undefined;
}

/**
 * Extract auditor ratification
 */
function extractAuditorRatification(text: string): { firm?: string; fees?: string } | undefined {
  // Look for auditor/PwC/Deloitte/EY/KPMG mentions
  const auditorMatch = text.match(/(PricewaterhouseCoopers|PwC|Deloitte|Ernst\s*&?\s*Young|EY|KPMG)\s+(?:as\s+)?(?:independent\s+)?(?:auditor|audit)/i);
  if (!auditorMatch) return undefined;

  const firm = normalizeAuditorName(auditorMatch[1]);

  // Extract fees
  const feesMatch = text.match(/(?:audit\s+)?fees?\s+(?:paid\s+)?(?:to\s+[A-Za-z&\s]+)?(?:of\s+|totaled?\s+)?(\$[\d,.]+\s*(?:million|M)?)/i);
  const fees = feesMatch ? normalizeCompensation(feesMatch[1]) : undefined;

  return { firm, fees };
}

/**
 * Normalize date to YYYY-MM-DD format
 */
function normalizeDate(dateStr: string): string {
  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Parse "Month DD, YYYY" format
  const months: Record<string, string> = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
  };

  const match = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (match) {
    const month = months[match[1].toLowerCase()];
    const day = match[2].padStart(2, '0');
    const year = match[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  return dateStr;
}

/**
 * Normalize compensation to standard format
 */
function normalizeCompensation(value: string): string {
  let normalized = value.trim();
  normalized = normalized.replace(/\s*million\s*/i, 'M');
  return normalized;
}

/**
 * Normalize auditor name
 */
function normalizeAuditorName(name: string): string {
  const normalized = name.trim();
  if (normalized.toLowerCase().includes('pricewaterhouse') || normalized.toLowerCase() === 'pwc') {
    return 'PwC';
  }
  if (normalized.toLowerCase().includes('ernst') || normalized.toLowerCase() === 'ey') {
    return 'Ernst & Young';
  }
  return normalized;
}
