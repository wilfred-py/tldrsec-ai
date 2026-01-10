/**
 * Shared Utilities for SEC Filing Data Extractors
 *
 * Common patterns and helper functions used across 10-K, 10-Q, and other
 * filing type extractors. Centralizes regex patterns and text processing
 * to ensure consistent extraction behavior.
 *
 * @module extractor-utils
 */

/**
 * Common financial highlight structure
 */
export interface FinancialHighlight {
  label: string;
  value: string;
  change?: string;
}

/**
 * Business segment structure
 */
export interface BusinessSegment {
  name: string;
  revenue: string;
  growth?: string;
}

// =============================================================================
// Section Extraction Patterns
// =============================================================================

/**
 * Extract content from a named section (e.g., "## Risk Factors")
 *
 * @param text - Full text to search
 * @param sectionNames - Array of possible section names (case-insensitive)
 * @returns Extracted section content or empty string
 */
export function extractSection(text: string, sectionNames: string[]): string {
  for (const name of sectionNames) {
    // Build pattern: ## Optional Section Name: content until next ## or end
    const escapedName = name.replace(/\s+/g, '\\s+');
    const pattern = new RegExp(
      `(?:##?\\s*)?${escapedName}[:\\s]*([\\s\\S]*?)(?:##|$)`,
      'i'
    );
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return '';
}

/**
 * Extract bullet points from section text
 *
 * @param sectionText - Section text containing bullet points
 * @param options - Options for filtering
 * @returns Array of bullet point strings
 */
export function extractBulletPoints(
  sectionText: string,
  options: { minLength?: number; maxLength?: number; maxItems?: number } = {}
): string[] {
  const { minLength = 10, maxLength = 300, maxItems = 5 } = options;
  const points: string[] = [];

  const bulletPattern = /[-*•]\s*(.+)/g;
  let match;
  while ((match = bulletPattern.exec(sectionText)) !== null) {
    const point = match[1].trim();
    if (point.length >= minLength && point.length <= maxLength) {
      points.push(point);
    }
  }

  return points.slice(0, maxItems);
}

// =============================================================================
// Financial Highlights Extraction
// =============================================================================

/**
 * Extract financial highlights from markdown bold format
 *
 * Supports:
 * - **Revenue**: $50.5B (+15% YoY)
 * - **Net Income**: $12.3B (+8% YoY, -3% QoQ)
 *
 * @param text - Text containing financial highlights
 * @param options - Extraction options
 * @returns Array of financial highlights
 */
export function extractFinancialHighlightsFromText(
  text: string,
  options: { maxItems?: number; includeQoQ?: boolean } = {}
): FinancialHighlight[] {
  const { maxItems = 6 } = options;
  const highlights: FinancialHighlight[] = [];
  const seenLabels = new Set<string>();

  // Pattern 1: Markdown bold format - **Label**: $Value (+X% YoY, +Y% QoQ)
  const boldPattern = /\*\*([^*]+)\*\*:\s*([\$\d,.]+[KMBkmb]?%?)\s*(?:\(([^)]+)\))?/gi;
  let match;
  while ((match = boldPattern.exec(text)) !== null) {
    const label = match[1].trim();
    const labelKey = label.toLowerCase();

    if (!seenLabels.has(labelKey)) {
      seenLabels.add(labelKey);
      highlights.push({
        label,
        value: match[2].trim(),
        change: cleanChangeValue(match[3]),
      });
    }
  }

  // Pattern 2: Plain format - Label: $Value (+X%)
  const plainPattern = /^([A-Za-z][A-Za-z\s]+?):\s*([\$\d,.]+[KMBkmb]?%?)\s*(?:\(([^)]+)\))?/gim;
  while ((match = plainPattern.exec(text)) !== null) {
    const label = match[1].trim();
    const labelKey = label.toLowerCase();

    if (!seenLabels.has(labelKey) && !isSectionHeader(label)) {
      seenLabels.add(labelKey);
      highlights.push({
        label,
        value: match[2].trim(),
        change: cleanChangeValue(match[3]),
      });
    }
  }

  return highlights.slice(0, maxItems);
}

/**
 * Extract financial highlights from markdown table format
 *
 * @param text - Text containing table
 * @param options - Extraction options
 * @returns Array of financial highlights
 */
export function extractFinancialHighlightsFromTable(
  text: string,
  options: { maxItems?: number } = {}
): FinancialHighlight[] {
  const { maxItems = 6 } = options;
  const highlights: FinancialHighlight[] = [];

  const tableLines = text.split('\n').filter(line => line.trim().startsWith('|'));
  if (tableLines.length < 3) return highlights;

  // Parse header to find column indices
  const headers = tableLines[0].split('|').map(h => h.trim().toLowerCase());

  let labelIdx = headers.findIndex(h =>
    h.includes('metric') || h.includes('label') || h.includes('item')
  );
  const valueIdx = headers.findIndex(h =>
    h.includes('value') || h.includes('amount') || h.includes('revenue')
  );
  const changeIdx = headers.findIndex(h =>
    h.includes('change') || h.includes('yoy') || h.includes('growth')
  );

  // Use first non-empty column if no label column found
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
        change: changeIdx >= 0 ? cleanChangeValue(cells[changeIdx]) : undefined,
      });
    }

    if (highlights.length >= maxItems) break;
  }

  return highlights;
}

// =============================================================================
// Segment Extraction
// =============================================================================

/**
 * Extract business segments from text
 *
 * @param text - Text containing segment information
 * @param options - Extraction options
 * @returns Array of business segments
 */
export function extractSegmentsFromText(
  text: string,
  options: { maxItems?: number } = {}
): BusinessSegment[] {
  const { maxItems = 5 } = options;
  const segments: BusinessSegment[] = [];
  const seenNames = new Set<string>();

  // Bullet format: - Name: $Value (+X%)
  const bulletPattern = /[-*•]\s*([^:$\n]+):\s*([\$\d,.]+[KMBkmb]?)\s*(?:\(([+-]?[\d.]+%?)\))?/gi;
  let match;
  while ((match = bulletPattern.exec(text)) !== null) {
    const name = match[1].trim();
    const nameKey = name.toLowerCase();

    if (!seenNames.has(nameKey) && isLikelySegment(name)) {
      seenNames.add(nameKey);
      segments.push({
        name,
        revenue: match[2].trim(),
        growth: cleanChangeValue(match[3]),
      });
    }

    if (segments.length >= maxItems) break;
  }

  return segments;
}

/**
 * Extract business segments from markdown table
 *
 * @param text - Text containing table
 * @param options - Extraction options
 * @returns Array of business segments
 */
export function extractSegmentsFromTable(
  text: string,
  options: { maxItems?: number } = {}
): BusinessSegment[] {
  const { maxItems = 5 } = options;
  const segments: BusinessSegment[] = [];

  const tableLines = text.split('\n').filter(line => line.trim().startsWith('|'));
  if (tableLines.length < 3) return segments;

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
        growth: growthIdx >= 0 ? cleanChangeValue(cells[growthIdx]) : undefined,
      });
    }

    if (segments.length >= maxItems) break;
  }

  return segments;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Clean and normalize a change value (e.g., "+15% YoY" -> "+15%")
 *
 * @param change - Raw change string
 * @returns Cleaned change value or undefined
 */
export function cleanChangeValue(change: string | undefined): string | undefined {
  if (!change) return undefined;

  // Remove "YoY", "QoQ", and extra whitespace
  let cleaned = change
    .replace(/\s*YoY\s*/gi, '')
    .replace(/\s*QoQ\s*/gi, '')
    .trim();

  // Ensure percentage sign if it's a number
  if (cleaned && !cleaned.includes('%') && !cleaned.includes('point')) {
    if (/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) {
      cleaned += '%';
    }
  }

  return cleaned || undefined;
}

/**
 * Check if a label looks like a section header
 *
 * @param label - Label to check
 * @returns True if it's likely a header, not a metric name
 */
export function isSectionHeader(label: string): boolean {
  const headers = [
    'highlights', 'segments', 'risks', 'factors', 'business',
    'summary', 'overview', 'key points', 'risk factors', 'guidance',
    'outlook', 'trends', 'quarterly', 'annual'
  ];
  const labelLower = label.toLowerCase();
  return headers.some(h => labelLower.includes(h));
}

/**
 * Check if a name is likely a business segment (not a financial metric)
 *
 * @param name - Name to check
 * @returns True if it's likely a segment name
 */
export function isLikelySegment(name: string): boolean {
  const nonSegments = [
    'total', 'revenue', 'net income', 'gross profit', 'margin',
    'earnings', 'cash flow', 'risk', 'highlight', 'ebitda',
    'operating income', 'free cash flow', 'eps'
  ];

  const nameLower = name.toLowerCase();
  return !nonSegments.some(ns => nameLower.includes(ns));
}

/**
 * Extract fiscal year from text
 *
 * @param text - Text containing fiscal year reference
 * @returns Fiscal year string (e.g., "2024") or undefined
 */
export function extractFiscalYear(text: string): string | undefined {
  const patterns = [
    /(?:fiscal\s+year|FY)\s*(\d{4})/i,
    /year\s+ended\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*(\d{4})/i,
    /fiscal\s+(\d{4})/i,
    /(\d{4})\s+(?:results|annual\s+report)/i,
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
 * Extract fiscal quarter from text
 *
 * @param text - Text containing fiscal quarter reference
 * @returns Fiscal quarter string (e.g., "Q3 2024") or undefined
 */
export function extractFiscalQuarter(text: string): string | undefined {
  const patterns = [
    /\b(Q[1-4])\s*(?:FY)?(\d{4})\b/i,
    /\b(first|second|third|fourth)\s+quarter\s+(\d{4})\b/i,
    /\bfiscal\s+(Q[1-4])\s+(\d{4})\b/i,
  ];

  const quarterMap: Record<string, string> = {
    'first': 'Q1',
    'second': 'Q2',
    'third': 'Q3',
    'fourth': 'Q4',
  };

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const q = match[1].toLowerCase() in quarterMap
        ? quarterMap[match[1].toLowerCase()]
        : match[1].toUpperCase();
      return `${q} ${match[2]}`;
    }
  }

  return undefined;
}

// =============================================================================
// Prose Format Extraction (for S-1, S-3, DEF 14A, 11-K)
// =============================================================================

/**
 * Extract financial highlights from prose/narrative text
 *
 * Handles formats like:
 * - "$6.3B net revenue (up 115% YoY)"
 * - "revenue of $130.5 billion, up 114% year-over-year"
 * - "$2.6B net income—first profitable year"
 *
 * @param text - Text containing financial metrics in prose form
 * @param maxItems - Maximum number of highlights to return
 * @returns Array of financial highlights
 */
export function extractFinancialHighlightsFromProse(
  text: string,
  maxItems: number = 6
): FinancialHighlight[] {
  const highlights: FinancialHighlight[] = [];
  const seenLabels = new Set<string>();

  // Known financial metrics to look for (ordered by specificity)
  const metrics = [
    // Revenue patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+(?:net\s+)?revenue/i, label: 'Revenue' },
    { pattern: /(?:net\s+)?revenue\s+(?:of\s+)?(\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Revenue' },
    // Net Income patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+(?:net\s+)?income/i, label: 'Net Income' },
    { pattern: /(?:net\s+)?income\s+(?:of\s+)?(\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Net Income' },
    // Net Loss patterns
    { pattern: /(?:net\s+)?loss\s+(?:of\s+)?(-?\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Net Loss' },
    { pattern: /(-?\$[\d,.]+[KMBkmb]?)\s+(?:net\s+)?loss/i, label: 'Net Loss' },
    // Gross Margin patterns
    { pattern: /gross\s+margin\s+(?:of\s+|at\s+|:?\s*)?(\d+\.?\d*%)/i, label: 'Gross Margin' },
    { pattern: /(\d+\.?\d*%)\s+gross\s+margin/i, label: 'Gross Margin' },
    // Operating Income patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+operating\s+(?:income|profit)/i, label: 'Operating Income' },
    { pattern: /operating\s+(?:income|profit)\s+(?:of\s+)?(\$[\d,.]+[KMBkmb]?)/i, label: 'Operating Income' },
    // EPS patterns
    { pattern: /EPS\s+(?:of\s+)?(\$[\d,.]+)/i, label: 'EPS' },
    { pattern: /(?:diluted\s+)?(?:earnings\s+per\s+share|EPS)\s+(?:of\s+|:?\s*)?(\$[\d,.]+)/i, label: 'EPS' },
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

    if (highlights.length >= maxItems) break;
  }

  return highlights;
}

/**
 * Extract a money value from text
 *
 * @param text - Text containing money value
 * @returns Normalized money value (e.g., "$500M") or undefined
 */
export function extractMoneyValue(text: string): string | undefined {
  const match = text.match(/\$[\d,.]+\s*(?:billion|million|B|M)?/i);
  if (match) {
    let value = match[0].trim();
    value = value.replace(/\s*billion\s*/i, 'B');
    value = value.replace(/\s*million\s*/i, 'M');
    return value.replace(/\s+/g, '');
  }
  return undefined;
}

/**
 * Alias for cleanChangeValue for backward compatibility
 */
export const cleanChange = cleanChangeValue;
