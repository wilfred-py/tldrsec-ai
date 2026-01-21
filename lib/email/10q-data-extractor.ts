/**
 * Form 10-Q Data Extractor
 *
 * Extracts structured data from Form 10-Q summary text for use in email
 * templates when summaryData is sparse or when AI returns strings instead
 * of structured objects.
 *
 * Form 10-Q = Quarterly Report with quarterly financial performance including:
 * - Financial highlights with YoY and QoQ changes
 * - Quarterly trend indicators (up/down/flat)
 * - Forward-looking guidance updates
 * - Risk factors
 * - Key business highlights
 *
 * Key differences from 10-K extractor:
 * - Parses QoQ (quarter-over-quarter) changes alongside YoY
 * - Extracts quarterly trend direction indicators
 * - Captures management guidance/outlook statements
 *
 * @module 10q-data-extractor
 */

/**
 * Quarterly financial highlight with YoY and QoQ changes
 */
export interface QuarterlyFinancialHighlight {
  label: string;
  value: string;
  change?: string;     // YoY change (e.g., "+15%")
  qoqChange?: string;  // QoQ change (e.g., "+5%")
}

/**
 * Quarterly trend indicator with metric, value, and direction
 */
export interface QuarterlyTrend {
  metric: string;
  current: string;
  trend: 'up' | 'down' | 'flat';
}

/**
 * Extracted data from Form 10-Q summary
 */
export interface Form10QExtractedData {
  financialHighlights: QuarterlyFinancialHighlight[];
  quarterlyTrends: QuarterlyTrend[];
  guidanceUpdates: string[];
  riskFactors: string[];
  keyPoints: string[];
  fiscalQuarter?: string;
}

/**
 * Extract structured Form 10-Q data from summary text
 *
 * @param summaryText - The AI-generated summary text or markdown content
 * @returns Structured data extracted from the summary
 */
export function extract10QData(summaryText: string): Form10QExtractedData {
  const result: Form10QExtractedData = {
    financialHighlights: [],
    quarterlyTrends: [],
    guidanceUpdates: [],
    riskFactors: [],
    keyPoints: [],
  };

  if (!summaryText) {
    return result;
  }

  // Extract financial highlights with QoQ support
  result.financialHighlights = extractQuarterlyFinancialHighlights(summaryText);

  // Extract quarterly trends
  result.quarterlyTrends = extractQuarterlyTrends(summaryText);

  // Extract guidance updates
  result.guidanceUpdates = extractGuidanceUpdates(summaryText);

  // Extract risk factors
  result.riskFactors = extractRiskFactors(summaryText);

  // Extract key points
  result.keyPoints = extractKeyPoints(summaryText);

  // Extract fiscal quarter
  result.fiscalQuarter = extractFiscalQuarter(summaryText);

  return result;
}

/**
 * Extract quarterly financial highlights with YoY and QoQ changes
 *
 * Supports formats:
 * - **Revenue**: $85.8B (+5% YoY, +2% QoQ)
 * - Revenue: $85.8B (+5% YoY)
 * - Prose: "$28.1B revenue in Q3 (up 12% YoY)"
 */
function extractQuarterlyFinancialHighlights(text: string): QuarterlyFinancialHighlight[] {
  const highlights: QuarterlyFinancialHighlight[] = [];
  const seenLabels = new Set<string>();

  // Pattern 1: Markdown bold with dual changes - **Label**: $Value (+X% YoY, +Y% QoQ)
  const boldDualPattern = /\*\*([^*]+)\*\*:\s*([\$\d,.]+[KMBkmb]?%?)\s*\(([+-]?[\d.]+%?)\s*YoY,?\s*([+-]?[\d.]+%?)\s*QoQ\)/gi;
  let match;
  while ((match = boldDualPattern.exec(text)) !== null) {
    const label = match[1].trim();
    const labelKey = label.toLowerCase();

    if (!seenLabels.has(labelKey)) {
      seenLabels.add(labelKey);
      highlights.push({
        label,
        value: match[2].trim(),
        change: cleanChange(match[3]),
        qoqChange: cleanChange(match[4]),
      });
    }
  }

  // Pattern 2: Markdown bold with single change - **Label**: $Value (+X% YoY)
  const boldSinglePattern = /\*\*([^*]+)\*\*:\s*([\$\d,.]+[KMBkmb]?%?)\s*\(([+-]?[\d.]+%?[^)]*)\)/gi;
  while ((match = boldSinglePattern.exec(text)) !== null) {
    const label = match[1].trim();
    const labelKey = label.toLowerCase();

    if (!seenLabels.has(labelKey)) {
      seenLabels.add(labelKey);
      const changeText = match[3];
      const { yoy, qoq } = parseChangeText(changeText);

      highlights.push({
        label,
        value: match[2].trim(),
        change: yoy,
        qoqChange: qoq,
      });
    }
  }

  // Pattern 3: Plain text format
  const plainPattern = /^([A-Za-z][A-Za-z\s]+?):\s*([\$\d,.]+[KMBkmb]?%?)\s*\(([^)]+)\)/gim;
  while ((match = plainPattern.exec(text)) !== null) {
    const label = match[1].trim();
    const labelKey = label.toLowerCase();

    if (!seenLabels.has(labelKey) && !isSectionHeader(label)) {
      seenLabels.add(labelKey);
      const changeText = match[3];
      const { yoy, qoq } = parseChangeText(changeText);

      highlights.push({
        label,
        value: match[2].trim(),
        change: yoy,
        qoqChange: qoq,
      });
    }
  }

  // Pattern 4: Prose format - "$28.1B revenue in Q3 (up 12% YoY)"
  const proseHighlights = extractHighlightsFromProse(text);
  for (const h of proseHighlights) {
    const labelKey = h.label.toLowerCase();
    if (!seenLabels.has(labelKey)) {
      seenLabels.add(labelKey);
      highlights.push(h);
    }
  }

  // Limit to 6 highlights max
  return highlights.slice(0, 6);
}

/**
 * Extract financial highlights from prose/narrative text
 * Handles quarterly report formats like "$28.1B revenue in Q3 (up 12% YoY)"
 */
function extractHighlightsFromProse(text: string): QuarterlyFinancialHighlight[] {
  const highlights: QuarterlyFinancialHighlight[] = [];
  const seenLabels = new Set<string>();

  // Known financial metrics to look for (ordered by specificity)
  // NOTE: Patterns must be EXPLICIT to avoid misidentifying margin types
  // REMOVED: Generic "margins? slipped" pattern - too ambiguous (could match net/operating margin)
  const metrics = [
    // Revenue patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+(?:net\s+)?revenue/i, label: 'Revenue' },
    { pattern: /(?:net\s+)?revenue\s+(?:of\s+)?(\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Revenue' },
    // Net Income patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+(?:net\s+)?income/i, label: 'Net Income' },
    { pattern: /(?:net\s+)?income\s+(?:of\s+)?(\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Net Income' },
    { pattern: /(?:net\s+)?income\s+(?:reached|hit)\s+(\$[\d,.]+\s*(?:billion|million|B|M)?)/i, label: 'Net Income' },
    // Gross Margin patterns - EXPLICIT "gross" required to avoid confusion with other margin types
    { pattern: /gross\s+margin\s+(?:of\s+|at\s+|:?\s*)?(\d+\.?\d*%)/i, label: 'Gross Margin' },
    { pattern: /(\d+\.?\d*%)\s+gross\s+margin/i, label: 'Gross Margin' },
    { pattern: /gross\s+margins?\s+(?:slipped|dropped|fell|rose|increased|grew|improved|expanded|contracted|hit|at|of|to)\s+(?:to\s+)?(\d+\.?\d*%)/i, label: 'Gross Margin' },
    // Gross Profit patterns
    { pattern: /(\$[\d,.]+[KMBkmb]?)\s+gross\s+profit/i, label: 'Gross Profit' },
    { pattern: /gross\s+profit\s+(?:of\s+)?(\$[\d,.]+[KMBkmb]?)/i, label: 'Gross Profit' },
    // Operating Margin patterns - EXPLICIT to avoid confusion with gross margin
    { pattern: /operating\s+margin\s+(?:of\s+|at\s+|:?\s*)?(\d+\.?\d*%)/i, label: 'Operating Margin' },
    { pattern: /(\d+\.?\d*%)\s+operating\s+margin/i, label: 'Operating Margin' },
    { pattern: /operating\s+margins?\s+(?:slipped|dropped|fell|rose|increased|grew|improved|expanded|contracted|hit|at|of|to)\s+(?:to\s+)?(\d+\.?\d*%)/i, label: 'Operating Margin' },
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
    { pattern: /cash\s+(?:from\s+ops)\s+(?:hit\s+)?(\$[\d,.]+[KMBkmb]?)/i, label: 'Operating Cash Flow' },
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

      // Match patterns like "(up 12% YoY)" or ", up 114% year-over-year" or "(+15%)"
      // Allow "in Q3" or similar between value and change
      const changeMatch = contextAfter.match(
        /^(?:[,\s]*(?:in\s+)?(?:Q[1-4]\s+)?)?[,\s]*\(?(?:(up|down)\s+)?([+-]?\d+\.?\d*)%?\s*(?:%|percent)?\s*(?:YoY|year-over-year|y\/y|increase)?\)?/i
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
 * Parse change text to extract YoY and QoQ values
 * e.g., "+5% YoY, +2% QoQ" or "+5% YoY" or "+1.2 points YoY"
 */
function parseChangeText(changeText: string): { yoy?: string; qoq?: string } {
  const result: { yoy?: string; qoq?: string } = {};

  // Look for YoY value
  const yoyMatch = changeText.match(/([+-]?[\d.]+%?)\s*(?:points?\s*)?YoY/i);
  if (yoyMatch) {
    result.yoy = cleanChange(yoyMatch[1]);
  }

  // Look for QoQ value
  const qoqMatch = changeText.match(/([+-]?[\d.]+%?)\s*(?:points?\s*)?QoQ/i);
  if (qoqMatch) {
    result.qoq = cleanChange(qoqMatch[1]);
  }

  // If no explicit labels, use the first number as YoY
  if (!result.yoy && !result.qoq) {
    const numMatch = changeText.match(/([+-]?[\d.]+%?)/);
    if (numMatch) {
      result.yoy = cleanChange(numMatch[1]);
    }
  }

  return result;
}

/**
 * Extract quarterly trends from summary text
 *
 * Looks for patterns like:
 * - Services revenue: $22.3B - trending up
 * - iPhone revenue: $39.3B - trending flat
 */
function extractQuarterlyTrends(text: string): QuarterlyTrend[] {
  const trends: QuarterlyTrend[] = [];

  // Look for trend section
  const trendSectionMatch = text.match(/(?:##?\s*)?(?:Quarterly\s+)?Trends?[:\s]*([\s\S]*?)(?:##|$)/i);
  const trendText = trendSectionMatch ? trendSectionMatch[1] : text;

  // Pattern: - Metric: $Value - trending up/down/flat
  const bulletPattern = /[-*•]\s*([^:$\n]+):\s*([\$\d,.]+[KMBkmb]?)\s*[-–]\s*(?:trending\s*)?(up|down|flat)/gi;
  let match;
  while ((match = bulletPattern.exec(trendText)) !== null) {
    const metric = match[1].trim();
    const current = match[2].trim();
    const direction = match[3].toLowerCase() as 'up' | 'down' | 'flat';

    trends.push({
      metric,
      current,
      trend: direction,
    });
  }

  // Limit to 4 trends max
  return trends.slice(0, 4);
}

/**
 * Extract guidance updates (forward-looking statements)
 */
function extractGuidanceUpdates(text: string): string[] {
  const updates: string[] = [];

  // Look for guidance section
  const guidanceSectionMatch = text.match(
    /(?:##?\s*)?(?:Guidance|Outlook|Forward)[^:\n]*[:\s]*([\s\S]*?)(?:##|$)/i
  );
  const guidanceText = guidanceSectionMatch ? guidanceSectionMatch[1] : '';

  if (!guidanceText) return updates;

  // Extract bullet points
  const bulletPattern = /[-*•]\s*(.+)/g;
  let match;
  while ((match = bulletPattern.exec(guidanceText)) !== null) {
    const update = match[1].trim();
    if (update.length > 10 && update.length < 250) {
      updates.push(update);
    }
  }

  // Limit to 3 guidance updates max
  return updates.slice(0, 3);
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

  // Try "Key Points" first (more specific), then fall back to "Highlights"
  let pointsSectionMatch = text.match(
    /(?:##?\s*)?Key\s+Points?[:\s]*([\s\S]*?)(?:##|$)/i
  );

  if (!pointsSectionMatch) {
    // Fall back to Key Highlights
    pointsSectionMatch = text.match(
      /(?:##?\s*)?(?:Key\s+)?Highlights?[:\s]*([\s\S]*?)(?:##|$)/i
    );
  }

  const pointsText = pointsSectionMatch ? pointsSectionMatch[1] : '';

  if (!pointsText) return points;

  // Extract bullet points
  const bulletPattern = /[-*•]\s*(.+)/g;
  let match;
  while ((match = bulletPattern.exec(pointsText)) !== null) {
    const point = match[1].trim();
    if (point.length > 10 && point.length < 300) {
      points.push(point);
    }
  }

  // Limit to 5 key points max
  return points.slice(0, 5);
}

/**
 * Extract fiscal quarter from summary text
 */
function extractFiscalQuarter(text: string): string | undefined {
  const patterns = [
    // "Q3 2024" or "Q3 FY2024"
    /\b(Q[1-4])\s*(?:FY)?(\d{4})\b/i,
    // "third quarter 2024"
    /\b(first|second|third|fourth)\s+quarter\s+(\d{4})\b/i,
    // "fiscal Q2 2024"
    /\bfiscal\s+(Q[1-4])\s+(\d{4})\b/i,
    // "quarter ended September 30, 2024"
    /quarter\s+ended\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*(\d{4})/i,
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
      if (match[1].toLowerCase() in quarterMap) {
        // Word format: "third quarter 2024"
        return `${quarterMap[match[1].toLowerCase()]} ${match[2]}`;
      } else if (match[1].startsWith('Q') || match[1].startsWith('q')) {
        // Q format
        return `${match[1].toUpperCase()} ${match[2]}`;
      } else {
        // Quarter ended format - need to determine quarter from month
        // For now, just return the year
        return `FY ${match[1]}`;
      }
    }
  }

  return undefined;
}

/**
 * Clean and normalize change value
 */
function cleanChange(change: string | undefined): string | undefined {
  if (!change) return undefined;

  // Remove whitespace
  let cleaned = change.trim();

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
 */
function isSectionHeader(label: string): boolean {
  const headers = [
    'highlights', 'segments', 'risks', 'factors', 'business',
    'summary', 'overview', 'key points', 'risk factors', 'guidance',
    'outlook', 'trends', 'quarterly'
  ];
  return headers.some(h => label.toLowerCase().includes(h));
}
