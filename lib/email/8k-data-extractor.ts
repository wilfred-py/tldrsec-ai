/**
 * Form 8-K Data Extractor
 *
 * Extracts structured data from Form 8-K summary text
 * for use in email templates when summaryData is sparse.
 *
 * Form 8-K = Current Report (material events, earnings, M&A, executive changes)
 */

export interface Form8KExtractedData {
  eventType: string;
  itemNumbers: string[];
  keyHighlights: string[];
  financialImpact: string;
  sentiment: string;
  isMaterial: boolean;
}

/**
 * Extract structured Form 8-K data from summary text
 */
export function extract8KData(summaryText: string): Form8KExtractedData {
  const result: Form8KExtractedData = {
    eventType: '',
    itemNumbers: [],
    keyHighlights: [],
    financialImpact: '',
    sentiment: '',
    isMaterial: false,
  };

  if (!summaryText) {
    return result;
  }

  // Extract item numbers
  result.itemNumbers = extractItemNumbers(summaryText);

  // Extract event type
  result.eventType = extractEventType(summaryText);

  // Extract key highlights (bullet points or numbered items)
  result.keyHighlights = extractKeyHighlights(summaryText);

  // Extract financial impact
  result.financialImpact = extractFinancialImpact(summaryText);

  // Determine sentiment
  result.sentiment = determineSentiment(summaryText);

  // Determine if material
  result.isMaterial = determineMateriality(result.itemNumbers, summaryText);

  return result;
}

/**
 * Extract 8-K item numbers from summary text
 * Items are formatted as "Item X.XX" in SEC filings
 */
function extractItemNumbers(text: string): string[] {
  const items: string[] = [];

  // Match patterns like "Item 2.02", "Item 5.02", etc.
  const patterns = [
    /Item\s*(\d+\.\d+)/gi,
    /Items?\s*(?:reported)?[:\s]*(\d+\.\d+(?:\s*,\s*\d+\.\d+)*)/gi,
    /(?:^|\s)(\d+\.\d+)(?:\s*[-–]\s*[A-Z])/gm,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const itemStr = match[1];
      // Handle comma-separated items
      const itemParts = itemStr.split(/\s*,\s*/);
      for (const item of itemParts) {
        const normalized = item.trim();
        if (/^\d+\.\d+$/.test(normalized) && !items.includes(normalized)) {
          items.push(normalized);
        }
      }
    }
  }

  return items.sort((a, b) => parseFloat(a) - parseFloat(b));
}

/**
 * Extract event type from summary text
 * Common 8-K event types include earnings releases, M&A, executive changes
 */
function extractEventType(text: string): string {
  const textLower = text.toLowerCase();

  // Earnings-related
  if (textLower.includes('earnings') || textLower.includes('results of operations') ||
      textLower.includes('quarterly results') || textLower.includes('revenue') && textLower.includes('quarter')) {
    return 'Earnings Release';
  }

  // M&A-related
  if (textLower.includes('acquisition') || textLower.includes('merger') ||
      textLower.includes('acquires') || textLower.includes('acquired')) {
    return 'Acquisition Announced';
  }

  if (textLower.includes('disposition') || textLower.includes('divestiture') ||
      textLower.includes('sells') || textLower.includes('sold')) {
    return 'Asset Disposition';
  }

  // Executive changes
  if (textLower.includes('ceo') && (textLower.includes('appoint') || textLower.includes('depart') || textLower.includes('resign'))) {
    return 'CEO Change';
  }

  if (textLower.includes('cfo') && (textLower.includes('appoint') || textLower.includes('depart') || textLower.includes('resign'))) {
    return 'CFO Change';
  }

  if (textLower.includes('director') && (textLower.includes('elected') || textLower.includes('resign') || textLower.includes('appoint'))) {
    return 'Board Change';
  }

  if (textLower.includes('officer') && (textLower.includes('appoint') || textLower.includes('depart') || textLower.includes('resign'))) {
    return 'Executive Change';
  }

  // Agreements
  if (textLower.includes('agreement') || textLower.includes('contract')) {
    return 'Material Agreement';
  }

  // Shareholder actions
  if (textLower.includes('dividend')) {
    return 'Dividend Announcement';
  }

  if (textLower.includes('buyback') || textLower.includes('repurchase')) {
    return 'Share Repurchase';
  }

  // Guidance
  if (textLower.includes('guidance') || textLower.includes('outlook') || textLower.includes('forecast')) {
    return 'Guidance Update';
  }

  // Restructuring
  if (textLower.includes('restructur') || textLower.includes('layoff') || textLower.includes('workforce reduction')) {
    return 'Restructuring';
  }

  // Reincorporation/Legal
  if (textLower.includes('reincorporat') || textLower.includes('jurisdiction')) {
    return 'Reincorporation';
  }

  // Reg FD / Investor presentation
  if (textLower.includes('reg fd') || textLower.includes('regulation fd') || textLower.includes('investor presentation')) {
    return 'Investor Update';
  }

  // Default based on item numbers
  return '';
}

/**
 * Extract key highlights from summary text
 * Looks for bullet points, numbered items, or key sentences
 */
function extractKeyHighlights(text: string): string[] {
  const highlights: string[] = [];

  // Extract bullet points (- or * at start of line)
  const bulletPattern = /^[\-\*•]\s*(.+)$/gm;
  let match;
  while ((match = bulletPattern.exec(text)) !== null) {
    const highlight = match[1].trim();
    if (highlight.length > 10 && highlight.length < 300) {
      highlights.push(highlight);
    }
  }

  // If no bullets found, extract sentences with key financial data
  if (highlights.length === 0) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      // Prioritize sentences with dollar amounts, percentages, or key terms
      if (
        /\$[\d,]+/.test(sentence) ||
        /\d+(?:\.\d+)?%/.test(sentence) ||
        /revenue|earnings|profit|loss|income|shares|acquisition|agreement/i.test(sentence)
      ) {
        const clean = sentence.trim();
        if (clean.length > 20 && clean.length < 300 && !highlights.includes(clean)) {
          highlights.push(clean);
        }
      }
    }
  }

  return highlights.slice(0, 5); // Limit to 5 highlights
}

/**
 * Extract financial impact information from summary
 */
function extractFinancialImpact(text: string): string {
  const patterns = [
    // Dollar amounts with context
    /(?:worth|valued at|totaling|approximately)\s*\$?([\d,.]+)\s*(million|billion|M|B)/i,
    // Revenue/earnings figures
    /(?:revenue|earnings|profit|income|loss)\s+(?:of\s+)?\$?([\d,.]+)\s*(million|billion|M|B)/i,
    // Deal values
    /\$?([\d,.]+)\s*(million|billion|M|B)\s+(?:deal|acquisition|transaction)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].replace(/,/g, '');
      const suffix = match[2]?.toUpperCase().charAt(0) || '';
      const num = parseFloat(value);

      if (!isNaN(num)) {
        if (suffix === 'B' || suffix === 'b') {
          return `$${num.toFixed(1)}B`;
        } else if (suffix === 'M' || suffix === 'm' || match[2]?.toLowerCase() === 'million') {
          return `$${num.toFixed(1)}M`;
        }
      }
    }
  }

  return '';
}

/**
 * Determine sentiment from summary text
 */
function determineSentiment(text: string): string {
  const textLower = text.toLowerCase();

  // Positive indicators
  const positiveTerms = ['growth', 'increase', 'profit', 'beat', 'exceed', 'strong', 'positive', 'gain', 'improvement'];
  // Negative indicators
  const negativeTerms = ['loss', 'decline', 'miss', 'below', 'weak', 'negative', 'layoff', 'restructur', 'impairment'];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const term of positiveTerms) {
    if (textLower.includes(term)) positiveCount++;
  }

  for (const term of negativeTerms) {
    if (textLower.includes(term)) negativeCount++;
  }

  if (positiveCount > negativeCount + 1) return 'positive';
  if (negativeCount > positiveCount + 1) return 'negative';
  if (positiveCount > 0 && negativeCount > 0) return 'mixed';
  return 'neutral';
}

/**
 * Determine if the 8-K filing is material based on items and content
 */
function determineMateriality(itemNumbers: string[], text: string): boolean {
  // Material items
  const materialItems = new Set([
    '1.01', '1.02', '1.03',
    '2.01', '2.02', '2.03', '2.04', '2.05', '2.06',
    '3.01', '3.02', '3.03',
    '4.01', '4.02',
    '5.01', '5.02', '5.03', '5.04', '5.05', '5.06', '5.07', '5.08',
    '6.01', '6.02', '6.03', '6.04', '6.05',
    '8.01', // Often material
  ]);

  // Check items
  for (const item of itemNumbers) {
    if (materialItems.has(item)) {
      return true;
    }
  }

  // Check for material keywords
  const textLower = text.toLowerCase();
  const materialKeywords = [
    'acquisition', 'merger', 'earnings', 'revenue', 'profit', 'loss',
    'ceo', 'cfo', 'officer', 'director', 'departure', 'appointed',
    'dividend', 'buyback', 'repurchase', 'material', 'significant'
  ];

  for (const keyword of materialKeywords) {
    if (textLower.includes(keyword)) {
      return true;
    }
  }

  return false;
}
