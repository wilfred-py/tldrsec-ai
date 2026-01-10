/**
 * Form 10-K Data Extractor
 *
 * Extracts structured data from Form 10-K summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * Form 10-K = Annual Report with comprehensive financial information including:
 * - Financial highlights (revenue, net income, margins)
 * - Business segment breakdowns
 * - Risk factors
 * - Key business highlights
 *
 * The extractor handles multiple input formats:
 * - Markdown bold: **Revenue**: $50.5B (+15% YoY)
 * - Plain text: Revenue: $50.5B (+15%)
 * - Table format: | Metric | Value | Change |
 * - Bullet points: - Revenue: $50.5B (+15%)
 *
 * @module 10k-data-extractor
 */

/**
 * Financial highlight with metric label, value, and optional change
 */
export interface FinancialHighlight {
  label: string;
  value: string;
  change?: string;
}

/**
 * Business segment with name, revenue, and optional growth
 */
export interface BusinessSegment {
  name: string;
  revenue: string;
  growth?: string;
}

/**
 * Extracted data from Form 10-K summary
 */
export interface Form10KExtractedData {
  financialHighlights: FinancialHighlight[];
  segments: BusinessSegment[];
  riskFactors: string[];
  keyPoints: string[];
  fiscalYear?: string;
}

/**
 * Extract structured Form 10-K data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extract10KData(summaryText: string): Form10KExtractedData {
  const result: Form10KExtractedData = {
    financialHighlights: [],
    segments: [],
    riskFactors: [],
    keyPoints: [],
  };

  if (!summaryText) {
    return result;
  }

  // Extract financial highlights
  result.financialHighlights = extractFinancialHighlights(summaryText);

  // Extract business segments
  result.segments = extractSegments(summaryText);

  // Extract risk factors
  result.riskFactors = extractRiskFactors(summaryText);

  // Extract key points/highlights
  result.keyPoints = extractKeyPoints(summaryText);

  // Extract fiscal year
  result.fiscalYear = extractFiscalYear(summaryText);

  return result;
}

/**
 * Extract financial highlights from summary text
 *
 * Supports multiple formats:
 * - **Revenue**: $50.5B (+15% YoY)
 * - Revenue: $50.5B (+15%)
 * - | Revenue | $50.5B | +15% |
 * - Prose: "$6.3B net revenue (up 115% YoY)" or "revenue of $130.5 billion, up 114%"
 */
function extractFinancialHighlights(text: string): FinancialHighlight[] {
  const highlights: FinancialHighlight[] = [];
  const seenLabels = new Set<string>();

  // Pattern 1: Markdown bold format - **Label**: $Value (+X% YoY)
  const boldPattern = /\*\*([^*]+)\*\*:\s*([\$\d,.]+[KMBkmb]?%?)\s*(?:\(([+-]?[\d.]+%?[^)]*)\))?/gi;
  let match;
  while ((match = boldPattern.exec(text)) !== null) {
    const label = match[1].trim();
    const labelKey = label.toLowerCase();

    if (!seenLabels.has(labelKey)) {
      seenLabels.add(labelKey);
      highlights.push({
        label,
        value: match[2].trim(),
        change: cleanChange(match[3]),
      });
    }
  }

  // Pattern 2: Plain format - Label: $Value (+X%)
  // Only if not already in bold format
  const plainPattern = /^([A-Za-z][A-Za-z\s]+?):\s*([\$\d,.]+[KMBkmb]?%?)\s*(?:\(([+-]?[\d.]+%?[^)]*)\))?/gim;
  while ((match = plainPattern.exec(text)) !== null) {
    const label = match[1].trim();
    const labelKey = label.toLowerCase();

    // Skip if we already have this label or if it's a section header
    if (!seenLabels.has(labelKey) && !isSectionHeader(label)) {
      seenLabels.add(labelKey);
      highlights.push({
        label,
        value: match[2].trim(),
        change: cleanChange(match[3]),
      });
    }
  }

  // Pattern 3: Table format - | Label | Value | Change |
  const tableHighlights = extractHighlightsFromTable(text);
  for (const highlight of tableHighlights) {
    const labelKey = highlight.label.toLowerCase();
    if (!seenLabels.has(labelKey)) {
      seenLabels.add(labelKey);
      highlights.push(highlight);
    }
  }

  // Pattern 4: Prose format - "$6.3B net revenue (up 115% YoY)" or "revenue of $130.5 billion, up 114%"
  const proseHighlights = extractHighlightsFromProse(text);
  for (const highlight of proseHighlights) {
    const labelKey = highlight.label.toLowerCase();
    if (!seenLabels.has(labelKey)) {
      seenLabels.add(labelKey);
      highlights.push(highlight);
    }
  }

  // Limit to 6 highlights max
  return highlights.slice(0, 6);
}

/**
 * Extract financial highlights from markdown table format
 */
function extractHighlightsFromTable(text: string): FinancialHighlight[] {
  const highlights: FinancialHighlight[] = [];

  // Find table rows (lines starting with |)
  const tableLines = text.split('\n').filter(line => line.trim().startsWith('|'));

  // Need at least 3 lines: header, separator, data
  if (tableLines.length < 3) return highlights;

  // Parse header to find column indices
  const headerLine = tableLines[0];
  const headers = headerLine.split('|').map(h => h.trim().toLowerCase());

  // Try to identify relevant columns
  let labelIdx = headers.findIndex(h =>
    h.includes('metric') || h.includes('label') || h.includes('item')
  );
  const valueIdx = headers.findIndex(h =>
    h.includes('value') || h.includes('amount') || h.includes('revenue')
  );
  const changeIdx = headers.findIndex(h =>
    h.includes('change') || h.includes('yoy') || h.includes('growth')
  );

  // If no explicit label column, use first non-empty column
  if (labelIdx === -1) {
    labelIdx = headers.findIndex((h, i) => i > 0 && h.length > 0);
  }

  if (labelIdx === -1 || valueIdx === -1) return highlights;

  // Parse data rows (skip header and separator)
  for (let i = 2; i < tableLines.length; i++) {
    const cells = tableLines[i].split('|').map(c => c.trim());

    // Skip separator rows
    if (cells.every(c => c === '' || c.match(/^-+$/))) continue;

    const label = cells[labelIdx];
    const value = cells[valueIdx];

    if (label && value && !label.match(/^-+$/)) {
      highlights.push({
        label,
        value,
        change: changeIdx >= 0 ? cleanChange(cells[changeIdx]) : undefined,
      });
    }
  }

  return highlights;
}

/**
 * Extract financial highlights from prose/narrative text
 *
 * Handles formats like:
 * - "$6.3B net revenue (up 115% YoY)"
 * - "revenue of $130.5 billion, up 114% year-over-year"
 * - "$2.6B net income—first profitable year"
 */
function extractHighlightsFromProse(text: string): FinancialHighlight[] {
  const highlights: FinancialHighlight[] = [];
  const seenLabels = new Set<string>();

  // Known financial metrics to look for (ordered by specificity)
  // NOTE: Patterns must be EXPLICIT to avoid misidentifying margin types
  const metrics = [
    // Revenue patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+(?:net\s+)?revenue/i, label: 'Revenue' },
    { pattern: /(?:net\s+)?revenue\s+(?:of\s+)?(\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Revenue' },
    // Net Income patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+(?:net\s+)?income/i, label: 'Net Income' },
    { pattern: /(?:net\s+)?income\s+(?:of\s+)?(\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Net Income' },
    { pattern: /(?:net\s+)?income\s+(?:reached|hit)\s+(\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Net Income' },
    // Gross Margin patterns - EXPLICIT "gross" required
    { pattern: /gross\s+margin\s+(?:of\s+|at\s+|:?\s*)?(\d+\.?\d*%)/i, label: 'Gross Margin' },
    { pattern: /(\d+\.?\d*%)\s+gross\s+margin/i, label: 'Gross Margin' },
    // Gross Profit patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+gross\s+profit/i, label: 'Gross Profit' },
    { pattern: /gross\s+profit\s+(?:of\s+)?(\$[\d,.]+[KMBkmb]?)/i, label: 'Gross Profit' },
    // Operating Margin patterns - EXPLICIT to avoid confusion with gross margin
    { pattern: /operating\s+margin\s+(?:of\s+|at\s+|:?\s*)?(\d+\.?\d*%)/i, label: 'Operating Margin' },
    { pattern: /(\d+\.?\d*%)\s+operating\s+margin/i, label: 'Operating Margin' },
    // Operating Income patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+operating\s+(?:income|profit)/i, label: 'Operating Income' },
    { pattern: /operating\s+(?:income|profit)\s+(?:of\s+)?(\$[\d,.]+[KMBkmb]?)/i, label: 'Operating Income' },
    // EPS patterns - REQUIRED metric per AI prompt
    { pattern: /EPS\s+(?:of\s+)?(\$[\d,.]+)/i, label: 'EPS' },
    { pattern: /(?:diluted\s+)?(?:earnings\s+per\s+share|EPS)\s+(?:of\s+|:?\s*)?(\$[\d,.]+)/i, label: 'EPS' },
    { pattern: /(\$[\d,.]+)\s+(?:diluted\s+)?(?:earnings\s+per\s+share|EPS)/i, label: 'EPS' },
    // Free Cash Flow patterns - EXPLICIT "free" required to avoid confusion with operating cash flow
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+free\s+cash\s+flow/i, label: 'Free Cash Flow' },
    { pattern: /free\s+cash\s+flow\s+(?:of\s+)?(\$[\d,.]+[KMBkmb]?)/i, label: 'Free Cash Flow' },
    // Operating Cash Flow patterns - separate from free cash flow
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+(?:operating\s+)?cash\s+flow(?!\s+from)/i, label: 'Operating Cash Flow' },
    { pattern: /cash\s+flow\s+from\s+operations?\s+(?:of\s+)?(\$[\d,.]+[KMBkmb]?)/i, label: 'Operating Cash Flow' },
  ];

  for (const { pattern, label } of metrics) {
    if (seenLabels.has(label.toLowerCase())) continue;

    const match = text.match(pattern);
    if (match) {
      // Normalize value
      let value = match[1].trim();
      value = value.replace(/\s*(billion|B)\s*/i, 'B').replace(/\s*(million|M)\s*/i, 'M');

      // Look for change percentage AFTER this match (within 80 chars)
      const contextAfter = text.substring(
        (match.index ?? 0) + match[0].length,
        (match.index ?? 0) + match[0].length + 80
      );

      // Match patterns like "(up 115% YoY)" or ", up 114% year-over-year" or "(+15%)"
      const changeMatch = contextAfter.match(
        /^[,\s]*\(?(?:(up|down)\s+)?([+-]?\d+\.?\d*)%?\s*(?:%|percent)?\s*(?:YoY|year-over-year|y\/y|increase)?\)?/i
      );

      let change: string | undefined;
      if (changeMatch && changeMatch[2]) {
        const direction = changeMatch[1]?.toLowerCase() === 'down' ? '-' : '+';
        let changeValue = changeMatch[2];
        if (!changeValue.startsWith('+') && !changeValue.startsWith('-')) {
          changeValue = direction + changeValue;
        }
        change = changeValue + '%';
      }

      seenLabels.add(label.toLowerCase());
      highlights.push({ label, value, change });
    }
  }

  return highlights;
}

/**
 * Extract business segments from summary text
 *
 * Looks for segment breakdowns in formats:
 * - Cloud Services: $25B (+28%)
 * - | Data Center | $47.5B | +217% |
 */
function extractSegments(text: string): BusinessSegment[] {
  const segments: BusinessSegment[] = [];
  const seenNames = new Set<string>();

  // Look for segment section
  const segmentSectionMatch = text.match(/(?:##?\s*)?(?:Business\s+)?Segments?[:\s]*([\s\S]*?)(?:##|$)/i);
  const segmentText = segmentSectionMatch ? segmentSectionMatch[1] : text;

  // Pattern 1: Bullet format - - Name: $Value (+X%)
  const bulletPattern = /[-*•]\s*([^:$\n]+):\s*([\$\d,.]+[KMBkmb]?)\s*(?:\(([+-]?[\d.]+%?)\))?/gi;
  let match;
  while ((match = bulletPattern.exec(segmentText)) !== null) {
    const name = match[1].trim();
    const nameKey = name.toLowerCase();

    if (!seenNames.has(nameKey) && isLikelySegment(name)) {
      seenNames.add(nameKey);
      segments.push({
        name,
        revenue: match[2].trim(),
        growth: cleanChange(match[3]),
      });
    }
  }

  // Pattern 2: Table format
  const tableSegments = extractSegmentsFromTable(text);
  for (const segment of tableSegments) {
    const nameKey = segment.name.toLowerCase();
    if (!seenNames.has(nameKey)) {
      seenNames.add(nameKey);
      segments.push(segment);
    }
  }

  // Limit to 5 segments max
  return segments.slice(0, 5);
}

/**
 * Extract segments from markdown table format
 */
function extractSegmentsFromTable(text: string): BusinessSegment[] {
  const segments: BusinessSegment[] = [];

  // Look for all tables in the text - don't filter by section to handle standalone tables
  const tableLines = text.split('\n').filter(line => line.trim().startsWith('|'));

  if (tableLines.length < 3) return segments;

  // Parse header
  const headers = tableLines[0].split('|').map(h => h.trim().toLowerCase());

  const nameIdx = headers.findIndex(h =>
    h.includes('segment') || h.includes('business') || h.includes('unit')
  );
  const revenueIdx = headers.findIndex(h =>
    h.includes('revenue') || h.includes('value') || h.includes('amount')
  );
  const growthIdx = headers.findIndex(h =>
    h.includes('growth') || h.includes('change') || h.includes('yoy')
  );

  if (nameIdx === -1) return segments;

  // Parse data rows
  for (let i = 2; i < tableLines.length; i++) {
    const cells = tableLines[i].split('|').map(c => c.trim());

    if (cells.every(c => c === '' || c.match(/^-+$/))) continue;

    const name = cells[nameIdx];
    const revenue = revenueIdx >= 0 ? cells[revenueIdx] : '';

    if (name && !name.match(/^-+$/)) {
      segments.push({
        name,
        revenue: revenue || '',
        growth: growthIdx >= 0 ? cleanChange(cells[growthIdx]) : undefined,
      });
    }
  }

  return segments;
}

/**
 * Extract risk factors from summary text
 */
function extractRiskFactors(text: string): string[] {
  const risks: string[] = [];

  // Look for risk section
  const riskSectionMatch = text.match(/(?:##?\s*)?Risk(?:\s+Factors?)?[:\s]*([\s\S]*?)(?:##|$)/i);
  const riskText = riskSectionMatch ? riskSectionMatch[1] : '';

  if (!riskText) return risks;

  // Extract bullet points
  const bulletPattern = /[-*•]\s*(.+)/g;
  let match;
  while ((match = bulletPattern.exec(riskText)) !== null) {
    const risk = match[1].trim();
    if (risk.length > 10 && risk.length < 300) {
      risks.push(risk);
    }
  }

  // Limit to 3 risk factors max
  return risks.slice(0, 3);
}

/**
 * Extract key points/highlights from summary text
 */
function extractKeyPoints(text: string): string[] {
  const points: string[] = [];

  // Look for highlights section
  const highlightSectionMatch = text.match(
    /(?:##?\s*)?(?:Key\s+)?Highlights?[:\s]*([\s\S]*?)(?:##|$)/i
  );
  const highlightText = highlightSectionMatch ? highlightSectionMatch[1] : '';

  if (!highlightText) return points;

  // Extract bullet points
  const bulletPattern = /[-*•]\s*(.+)/g;
  let match;
  while ((match = bulletPattern.exec(highlightText)) !== null) {
    const point = match[1].trim();
    if (point.length > 10 && point.length < 300) {
      points.push(point);
    }
  }

  // Limit to 5 key points max
  return points.slice(0, 5);
}

/**
 * Extract fiscal year from summary text
 *
 * Uses explicit patterns only - no fuzzy fallback.
 * AI prompt requires fiscalYear field, so this should reliably match.
 */
function extractFiscalYear(text: string): string | undefined {
  const patterns = [
    // "fiscal year 2024" or "FY2024" or "FY 2024"
    /(?:fiscal\s+year|FY)\s*(\d{4})/i,
    // "year ended December 31, 2024"
    /year\s+ended\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*(\d{4})/i,
    // "fiscal 2024"
    /fiscal\s+(\d{4})/i,
    // "2024 results" or "2024 annual report"
    /(\d{4})\s+(?:results|annual\s+report)/i,
    // "ended January 26, 2025" (NVIDIA style)
    /ended\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*(\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Clean and normalize change value
 */
function cleanChange(change: string | undefined): string | undefined {
  if (!change) return undefined;

  // Remove "YoY" and extra whitespace
  let cleaned = change.replace(/\s*YoY\s*/i, '').trim();

  // Ensure percentage sign
  if (cleaned && !cleaned.includes('%') && /^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) {
    cleaned += '%';
  }

  return cleaned || undefined;
}

/**
 * Check if a label looks like a section header
 */
function isSectionHeader(label: string): boolean {
  const headers = [
    'highlights', 'segments', 'risks', 'factors', 'business',
    'summary', 'overview', 'key points', 'risk factors'
  ];
  return headers.some(h => label.toLowerCase().includes(h));
}

/**
 * Check if a name is likely a business segment
 */
function isLikelySegment(name: string): boolean {
  // Exclude common non-segment items
  const nonSegments = [
    'total', 'revenue', 'net income', 'gross profit', 'margin',
    'earnings', 'cash flow', 'risk', 'highlight'
  ];

  const nameLower = name.toLowerCase();
  return !nonSegments.some(ns => nameLower.includes(ns));
}
