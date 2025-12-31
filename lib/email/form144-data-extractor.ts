/**
 * Form 144 Data Extractor
 *
 * Extracts structured data from Form 144 summary text
 * for use in email templates when summaryData is sparse.
 *
 * Form 144 = Notice of Proposed Sale of Securities under Rule 144
 */

export interface Form144ExtractedData {
  filerName: string;
  filerRole: string;
  shares: string;
  estimatedValue: string;
  pricePerShare: string;
  percentOfHoldings: string;
  broker: string;
  tradingPlan: string;
  recentActivity: string;
  remainingHoldings: string;
  signalStrength: string;
}

/**
 * Extract structured Form 144 data from summary text
 */
export function extractForm144Data(summaryText: string): Form144ExtractedData {
  const result: Form144ExtractedData = {
    filerName: '',
    filerRole: '',
    shares: '',
    estimatedValue: '',
    pricePerShare: '',
    percentOfHoldings: '',
    broker: '',
    tradingPlan: '',
    recentActivity: '',
    remainingHoldings: '',
    signalStrength: '',
  };

  if (!summaryText) {
    return result;
  }

  // Extract filer name
  result.filerName = extractFilerName(summaryText);

  // Extract role/title
  result.filerRole = extractFilerRole(summaryText);

  // Extract share count
  result.shares = extractShares(summaryText);

  // Extract estimated value
  result.estimatedValue = extractValue(summaryText);

  // Extract price per share
  result.pricePerShare = extractPricePerShare(summaryText);

  // Extract percentage of holdings
  result.percentOfHoldings = extractPercentOfHoldings(summaryText);

  // Extract broker
  result.broker = extractBroker(summaryText);

  // Extract 10b5-1 trading plan info
  result.tradingPlan = extractTradingPlan(summaryText);

  // Extract recent activity context
  result.recentActivity = extractRecentActivity(summaryText);

  // Extract remaining holdings (securities beneficially owned after transaction)
  result.remainingHoldings = extractRemainingHoldings(summaryText);

  // Determine signal strength (2-level)
  result.signalStrength = determineSignalStrength(result, summaryText);

  return result;
}

/**
 * Extract filer name from summary
 */
function extractFilerName(text: string): string {
  const patterns = [
    // Common patterns: "Brian Armstrong plans to sell..."
    /^([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)\s+(?:plans?\s+to|intends?\s+to|filed|will\s+sell)/i,
    // CEO Brian Armstrong...
    /(?:CEO|CFO|Director|Officer|Insider)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)/i,
    // Reporting Person: Name
    /(?:Reporting\s+Person|Filer|Insider)[:\s]+([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)/i,
    // "Name" followed by role in parens
    /^([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)\s*\([A-Za-z\s]+\)/i,
    // filed by Name
    /filed\s+by\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
}

/**
 * Extract filer role/title from summary
 */
function extractFilerRole(text: string): string {
  const patterns = [
    // (CEO) or (CFO) or (Director)
    /\(([A-Za-z\s]+(?:CEO|CFO|COO|CTO|Director|Officer|President|Chairman))\)/i,
    // CEO Brian Armstrong
    /(CEO|CFO|COO|CTO|Director|Officer|President|Chairman|10%\s*Owner)\s+[A-Z][a-z]+/i,
    // Brian Armstrong, CEO
    /[A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+,?\s*(CEO|CFO|COO|CTO|Director|Officer|President|Chairman)/i,
    // role/relationship patterns
    /(?:Role|Title|Position)[:\s]+([A-Za-z\s]+?)(?:\s*\(|,|\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const role = match[1].trim();
      // Normalize common roles
      if (role.toLowerCase().includes('chief exec') || role.toLowerCase() === 'ceo') return 'CEO';
      if (role.toLowerCase().includes('chief fin') || role.toLowerCase() === 'cfo') return 'CFO';
      if (role.toLowerCase().includes('director')) return 'Director';
      if (role.toLowerCase().includes('10%')) return '10% Owner';
      return role;
    }
  }

  return '';
}

/**
 * Extract number of shares from summary
 */
function extractShares(text: string): string {
  const patterns = [
    // "proposes to sell 56,820 shares"
    /(?:proposes?\s+to\s+sell|intends?\s+to\s+(?:sell|dispose))\s*([\d,]+)\s*(?:\w+\s+)?shares?/i,
    // "filing covers 56,820 shares"
    /(?:filing|notice)\s+(?:covers?|for)\s*([\d,]+)\s*(?:\w+\s+)?shares?/i,
    // "sale of 56,820 shares"
    /(?:sale|disposition)\s+of\s*([\d,]+)\s*(?:\w+\s+)?shares?/i,
    // "40,000 COIN shares" or "40,000 shares"
    /([\d,]+)\s*(?:\w+\s+)?shares?\s*(?:worth|valued)/i,
    // "sell 40,000 shares"
    /(?:sell|selling)\s*([\d,]+)\s*(?:\w+\s+)?shares?/i,
    // "40,000 shares of"
    /([\d,]+)\s*shares?\s*(?:of|for)/i,
    // "Shares: 56,820" or "Number of Shares: 56,820" (table format)
    /(?:shares?|amount)[:\s]+([\d,]+)/i,
    // "56,820 common shares" or "56,820 ordinary shares"
    /([\d,]+)\s*(?:common|ordinary|class\s+\w+)\s*shares?/i,
    // Generic share count as last resort
    /([\d,]+)\s*shares?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseInt(numStr, 10);
      // Only accept if it's a reasonable share count (> 0 and not absurdly large like a phone number)
      if (num > 0 && num < 100000000) {
        return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
    }
  }

  return '';
}

/**
 * Extract estimated value from summary
 */
function extractValue(text: string): string {
  const patterns = [
    // "$9.916M" or "$9.9M" or "$10M"
    /\$?([\d,.]+)\s*(M|million|B|billion)/i,
    // "worth $9,916,000"
    /worth\s*\$?([\d,]+)/i,
    // "valued at $X"
    /valued\s+at\s*\$?([\d,]+)/i,
    // ~$X (~$248/share)
    /~?\$?([\d,.]+)\s*(?:M|million)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].replace(/,/g, '');
      const suffix = match[2]?.toLowerCase() || '';

      // Format with suffix
      if (suffix.includes('b')) {
        return `$${value}B`;
      } else if (suffix.includes('m') || !suffix) {
        const num = parseFloat(value);
        if (num >= 1) {
          return `$${num.toFixed(1)}M`.replace(/\.0M$/, 'M');
        } else if (num < 1 && num > 0) {
          return `$${(num * 1000).toFixed(0)}K`;
        }
        return `$${value}M`;
      }
    }
  }

  return '';
}

/**
 * Extract price per share from summary
 */
function extractPricePerShare(text: string): string {
  const patterns = [
    // "~$248/share" or "$248 per share"
    /~?\$?([\d,.]+)\s*(?:\/share|per\s*share)/i,
    // "at $248"
    /at\s*\$?([\d,.]+)(?:\s*per)?/i,
    // "@ $248"
    /@\s*\$?([\d,.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (price > 0 && price < 100000) { // Sanity check for price
        return `$${price.toFixed(2).replace(/\.00$/, '')}`;
      }
    }
  }

  return '';
}

/**
 * Extract percentage of holdings from summary
 */
function extractPercentOfHoldings(text: string): string {
  const patterns = [
    // "15% of holdings"
    /([\d.]+)%\s*(?:of\s+)?(?:his|her|their|total)?\s*(?:holdings?|position|stake)/i,
    // "representing 15%"
    /representing\s*([\d.]+)%/i,
    // "X.X% of outstanding"
    /([\d.]+)%\s*(?:of\s+)?(?:the\s+)?outstanding/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return `${match[1]}%`;
    }
  }

  return '';
}

/**
 * Extract broker name from summary
 */
function extractBroker(text: string): string {
  const patterns = [
    // "through Goldman Sachs"
    /(?:through|via|broker[:\s]+)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:&|and)\s+Co\.?)?(?:\s+LLC)?)/i,
    // Known brokers
    /(Goldman Sachs|Morgan Stanley|JP Morgan|Merrill Lynch|Charles Schwab|Fidelity|UBS|Credit Suisse|Bank of America|Citigroup)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
}

/**
 * Extract 10b5-1 trading plan info from summary
 */
function extractTradingPlan(text: string): string {
  const textLower = text.toLowerCase();

  // Check for 10b5-1 mentions
  if (textLower.includes('10b5-1') || textLower.includes('10b-5') || textLower.includes('rule 10b')) {
    // Try to extract plan date
    const datePattern = /10b5-1\s*(?:plan)?(?:\s+(?:adopted|established|entered))?(?:\s+(?:on|in))?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s*\d{4})/i;
    const dateMatch = text.match(datePattern);

    if (dateMatch?.[1]) {
      return `10b5-1 plan (${dateMatch[1]})`;
    }

    return '10b5-1 trading plan';
  }

  return '';
}

/**
 * Extract recent activity context from summary
 */
function extractRecentActivity(text: string): string {
  const patterns = [
    // "piling onto 220,000 shares"
    /piling\s+onto\s+([\d,]+)\s*shares?(?:\s*\(\$?([\d,.]+[KMB]?)\))?/i,
    // "in addition to X shares sold previously"
    /in\s+addition\s+to\s+([\d,]+)\s*shares?/i,
    // "past 3 months" pattern
    /(?:in\s+)?(?:the\s+)?past\s+(\d+)\s*(?:months?|weeks?|days?)/i,
    // "recent sales of X"
    /recent\s+(?:sales?|transactions?)\s+(?:of\s+)?([\d,]+)/i,
    // Pattern like "dumped in past X months"
    /dumped\s+(?:in\s+)?(?:the\s+)?(?:past|previous|last)\s+(\d+)\s+months?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Return the surrounding context
      const startIdx = Math.max(0, text.indexOf(match[0]) - 20);
      const endIdx = Math.min(text.length, text.indexOf(match[0]) + match[0].length + 30);
      let context = text.substring(startIdx, endIdx).trim();

      // Clean up the context
      if (startIdx > 0) context = '...' + context;
      if (endIdx < text.length) context = context + '...';

      // Limit length
      if (context.length > 100) {
        context = context.substring(0, 97) + '...';
      }

      return context;
    }
  }

  return '';
}

/**
 * Extract remaining holdings (Amount of Securities Beneficially Owned Following Transaction)
 */
function extractRemainingHoldings(text: string): string {
  const patterns = [
    // "Securities Beneficially Owned: X" or "Amount of Securities Beneficially Owned: X"
    /(?:amount\s+of\s+)?securities\s+beneficially\s+owned[:\s]*([\d,]+)/i,
    // "beneficial ownership of X shares"
    /beneficial\s+ownership\s+(?:of\s+)?([\d,]+)\s*shares?/i,
    // "holdings after sale: X" or "post-transaction ownership: X"
    /(?:holdings?\s+after|post-transaction\s+ownership)[:\s]*([\d,]+)/i,
    // "will still hold X shares"
    /(?:will\s+)?(?:still\s+)?(?:hold|retain|own)\s*([\d,]+)\s*shares?/i,
    // "X shares remaining"
    /([\d,]+)\s*shares?\s*(?:remaining|left|after)/i,
    // "beneficially own X shares after"
    /beneficially\s+own[s]?\s*([\d,]+)\s*shares?\s*(?:after|following)/i,
    // "following the transaction, X shares"
    /following\s+(?:the\s+)?(?:transaction|sale),?\s*([\d,]+)\s*shares?/i,
    // "after the sale, X shares"
    /after\s+(?:the\s+)?(?:sale|transaction),?\s*([\d,]+)\s*shares?/i,
    // "leaving X shares"
    /leaving\s*([\d,]+)\s*shares?/i,
    // "retaining X shares"
    /retain(?:ing|s)?\s*([\d,]+)\s*shares?/i,
    // "continues to hold X shares" or "will continue to own X shares"
    /continue[s]?\s+to\s+(?:hold|own)\s*([\d,]+)\s*shares?/i,
    // "remaining position of X shares"
    /remaining\s+(?:position|stake)\s+(?:of\s+)?([\d,]+)\s*shares?/i,
    // "Ownership Following Transaction: X" (SEC form field name)
    /(?:ownership|holdings?)\s+(?:following|after)\s+(?:the\s+)?(?:transaction|reported|sale)[:\s]*([\d,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const numStr = match[1].replace(/,/g, '');
      const num = parseInt(numStr, 10);
      // Sanity check - remaining holdings should be a reasonable number
      if (num > 0 && num < 1000000000) {
        return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
    }
  }

  return '';
}

/**
 * Determine signal strength (2-level: Notable vs Routine)
 */
function determineSignalStrength(data: Form144ExtractedData, text: string): string {
  const textLower = text.toLowerCase();

  // Check for 10b5-1 plan - typically makes it routine
  const has10b51 = textLower.includes('10b5-1') || textLower.includes('10b-5');

  // Check for notable indicators
  const hasNotableIndicators =
    textLower.includes('significant') ||
    textLower.includes('large') ||
    textLower.includes('substantial') ||
    textLower.includes('notable') ||
    textLower.includes('pattern') ||
    textLower.includes('divestiture');

  // Check for routine indicators
  const hasRoutineIndicators =
    textLower.includes('routine') ||
    textLower.includes('scheduled') ||
    textLower.includes('regular');

  // Calculate estimated value for threshold check
  let valueNum = 0;
  if (data.estimatedValue) {
    const match = data.estimatedValue.match(/([\d.]+)\s*([KMB])?/i);
    if (match) {
      valueNum = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      if (suffix === 'B') valueNum *= 1000000000;
      else if (suffix === 'M') valueNum *= 1000000;
      else if (suffix === 'K') valueNum *= 1000;
    }
  }

  // Decision logic
  if (hasRoutineIndicators || (has10b51 && !hasNotableIndicators && valueNum < 10000000)) {
    return 'Routine 10b5-1';
  }

  if (hasNotableIndicators || valueNum >= 10000000) {
    return 'Notable Sale';
  }

  // Default based on value
  if (valueNum >= 5000000) {
    return 'Notable Sale';
  }

  if (has10b51) {
    return 'Routine 10b5-1';
  }

  return 'Notable Sale';
}
