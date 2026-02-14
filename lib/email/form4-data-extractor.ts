/**
 * Form 4 Data Extractor
 *
 * Extracts structured transaction data from Form 4 markdown summaries
 * for use in email templates.
 *
 * The AI generates comprehensive markdown summaries with all the data,
 * but the email template needs structured objects. This module bridges that gap.
 *
 * ## Transaction Types
 * The SEC uses specific transaction codes in Form 4 filings:
 * - **S**: Sale - Open market sale of securities
 * - **P**: Purchase - Open market purchase of securities
 * - **A**: Award - Grant of awards (RSUs, options)
 * - **G**: Gift - Bona fide gift transaction
 * - **M**: Exercise - Exercise of derivative securities
 * - **F**: Tax Withholding - Payment of exercise price or tax liability
 * - **C**: Conversion - Conversion of derivative security
 * - **D**: Disposition - Disposition to the issuer
 * - **J**: Trust Transfer - Other acquisition/disposition (commonly trust transfers)
 * - **K**: Family Transfer - Equity swap or similar (commonly family trust restructuring)
 *
 * ## Transfer vs Gift Detection
 * Trust transfers (J/K codes) are NOT gifts. They represent changes in beneficial
 * ownership form (e.g., direct to indirect via trust) rather than actual transfers
 * of economic value. This distinction is important for investment signal analysis.
 */

/**
 * SEC Form 4 transaction codes and their human-readable types
 * @see https://www.sec.gov/about/forms/form4data.pdf
 */
export const TRANSACTION_CODE_MAP: Record<string, string> = {
  'S': 'Sale',
  'P': 'Purchase',
  'A': 'Award',
  'G': 'Gift',
  'M': 'Exercise',
  'F': 'Tax Withholding',
  'C': 'Conversion',
  'D': 'Disposition',
  'J': 'Trust Transfer',   // Other acquisition/disposition - commonly trust transfers
  'K': 'Family Transfer',  // Equity swap or similar - commonly family trust restructuring
} as const;

/**
 * Transaction types that represent trust/family transfers
 * These are NOT market transactions and have neutral investment signal
 */
export const TRANSFER_TRANSACTION_TYPES = [
  'Trust Transfer',
  'Family Transfer',
  'Transfer',
] as const;

export interface Form4Transaction {
  type: string;
  shares: string;
  pricePerShare: string;
  totalValue: string;
  acquisitionDisposition: string;
  date?: string;
  code?: string;
}

export interface Form4ExtractedData {
  filerName: string;
  relationship: string;
  transactions: Form4Transaction[];
  totalValue: string;
  percentageChange: string;
  signalStrength: string;
  previousStake: string;
  newStake: string;
  transactionType: string;
}

/**
 * Extract structured Form 4 data from markdown summary text
 */
export function extractForm4Data(summaryText: string): Form4ExtractedData {
  const result: Form4ExtractedData = {
    filerName: '',
    relationship: '',
    transactions: [],
    totalValue: '',
    percentageChange: '',
    signalStrength: '',
    previousStake: '',
    newStake: '',
    transactionType: '',
  };

  if (!summaryText) {
    return result;
  }

  // Extract filer name
  result.filerName = extractFilerName(summaryText);

  // Extract role/relationship
  result.relationship = extractRelationship(summaryText);

  // Extract transactions from markdown table or text
  result.transactions = extractTransactions(summaryText);

  // Determine primary transaction type
  if (result.transactions.length > 0) {
    const primaryTx = result.transactions[0];
    result.transactionType = primaryTx.type;
    result.totalValue = calculateTotalValue(result.transactions);
  }

  // Extract stake information
  const stakeInfo = extractStakeInfo(summaryText);
  result.previousStake = stakeInfo.previous;
  result.newStake = stakeInfo.current;
  result.percentageChange = stakeInfo.percentChange;

  // Determine signal strength based on transaction characteristics
  result.signalStrength = determineSignalStrength(result, summaryText);

  return result;
}

/**
 * Convert an ALL CAPS or mixed-case name to Title Case.
 * Preserves middle initials (e.g., "J.") and hyphenated names.
 */
function toTitleCase(name: string): string {
  return name
    .split(/\s+/)
    .map(part => {
      // Preserve middle initials like "J."
      if (/^[A-Z]\.?$/.test(part)) return part.length === 1 ? `${part}.` : part;
      // Handle hyphenated names
      if (part.includes('-')) {
        return part.split('-').map(p =>
          p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
        ).join('-');
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Check if a name string appears to be ALL CAPS (needs title-case conversion)
 */
function isAllCaps(name: string): boolean {
  const letters = name.replace(/[^A-Za-z]/g, '');
  return letters.length > 2 && letters === letters.toUpperCase();
}

/**
 * Extract filer name from summary.
 * Supports ALL CAPS names, hyphenated names, middle initials,
 * and various formatting patterns.
 */
function extractFilerName(text: string): string {
  // Name pattern component: matches "Firstname Lastname", "Firstname M. Lastname",
  // "FIRSTNAME LASTNAME", "Firstname Last-Name"
  // Note: patterns use explicit case checks (no /i flag) to avoid false positives
  const NAME_PATTERN = '([A-Z][A-Za-z-]+(?:\\s+[A-Z]\\.?\\s+)?\\s+[A-Z][A-Za-z-]+)';

  const patterns: Array<{ regex: RegExp; group: number }> = [
    // **Reporting Person**: Name or **Filer**: Name (markdown bold labels)
    { regex: /\*\*(?:Reporting Person|Filer)\*\*:\s*([^\n*]+)/i, group: 1 },
    // "Name, Role" pattern: "Vaibhav Taneja, Chief Financial Officer"
    { regex: new RegExp('([A-Z][A-Za-z-]+(?:\\s+[A-Z]\\.?)?\\s+[A-Z][A-Za-z-]+),\\s*(?:Chief|CEO|CFO|COO|CTO|Director|Officer|President|VP|Vice|Chairman|General|Senior|Executive|Managing)', 'i'), group: 1 },
    // "filed by NAME" with ALL CAPS and comma-terminated support
    { regex: new RegExp('filed by\\s+' + NAME_PATTERN, 'i'), group: 1 },
    // "NAME reported/disclosed/filed" pattern
    { regex: new RegExp(NAME_PATTERN + '(?:,\\s*[A-Za-z\\s]+,)?\\s+(?:reported|disclosed|filed)', 'i'), group: 1 },
    // Reporting Person: Name (without markdown bold)
    { regex: new RegExp('Reporting Person[:\\s]+' + NAME_PATTERN), group: 1 },
    // Insider: Name (without /i flag to avoid matching "insider sold")
    { regex: new RegExp('Insider[:\\s]+' + NAME_PATTERN), group: 1 },
  ];

  for (const { regex, group } of patterns) {
    const match = text.match(regex);
    if (match?.[group]) {
      let name = match[group].trim().replace(/\*+/g, '');
      // Convert ALL CAPS names to Title Case
      if (isAllCaps(name)) {
        name = toTitleCase(name);
      }
      return name;
    }
  }

  return '';
}

/**
 * Extract role/relationship from summary
 */
function extractRelationship(text: string): string {
  const patterns = [
    /\*\*Role\*\*:\s*([^\n*]+)/i,
    /Role[:\s]+([A-Za-z\s]+?)(?:\s*\(|,|\n|$)/i,
    /relationship[:\s]+([A-Za-z\s]+?)(?:\s*\(|,|\n|$)/i,
    /\(([A-Za-z]+)\s*(?:Director|Officer|Owner)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const role = match[1].trim().replace(/\*+/g, '');
      // Clean up common patterns
      if (role.toLowerCase().includes('director')) return 'Director';
      if (role.toLowerCase().includes('ceo')) return 'CEO';
      if (role.toLowerCase().includes('cfo')) return 'CFO';
      if (role.toLowerCase().includes('officer')) return 'Officer';
      if (role.toLowerCase().includes('10%')) return '10% Owner';
      return role;
    }
  }

  return '';
}

/**
 * Extract transactions from markdown table or structured text
 */
function extractTransactions(text: string): Form4Transaction[] {
  const transactions: Form4Transaction[] = [];

  // Try to parse markdown table first
  const tableTransactions = parseMarkdownTable(text);
  if (tableTransactions.length > 0) {
    return tableTransactions;
  }

  // Fallback: Extract from text patterns
  const textTransactions = extractTransactionsFromText(text);
  if (textTransactions.length > 0) {
    return textTransactions;
  }

  return transactions;
}

/**
 * Parse transactions from markdown table format
 */
function parseMarkdownTable(text: string): Form4Transaction[] {
  const transactions: Form4Transaction[] = [];

  // Find table rows (lines starting with |)
  const tableLines = text.split('\n').filter(line => line.trim().startsWith('|'));

  // Skip if no table or only header/separator
  if (tableLines.length < 3) return transactions;

  // Find header row to get column indices
  const headerLine = tableLines[0];
  const headers = headerLine.split('|').map(h => h.trim().toLowerCase());

  // Find column indices
  const dateIdx = headers.findIndex(h => h.includes('date'));
  const codeIdx = headers.findIndex(h => h.includes('code'));
  const amountIdx = headers.findIndex(h =>
    h.includes('amount') ||
    h.includes('shares') ||
    h.includes('quantity') ||
    h.includes('units') ||
    h.includes('number')
  );
  const adIdx = headers.findIndex(h => h.includes('(a)') || h.includes('(d)') || h.includes('a/d'));
  const priceIdx = headers.findIndex(h => h.includes('price'));
  const _ownershipIdx = headers.findIndex(h => h.includes('ownership') || h.includes('post'));

  // Parse data rows (skip header and separator)
  for (let i = 2; i < tableLines.length; i++) {
    const row = tableLines[i];
    const cells = row.split('|').map(c => c.trim());

    // Skip balance rows or empty rows
    if (row.toLowerCase().includes('balance') || row.toLowerCase().includes('n/a')) {
      continue;
    }

    const transaction: Form4Transaction = {
      type: '',
      shares: '',
      pricePerShare: '',
      totalValue: '',
      acquisitionDisposition: '',
    };

    // Extract date
    if (dateIdx >= 0 && cells[dateIdx]) {
      transaction.date = cells[dateIdx];
    }

    // Extract transaction code and type
    if (codeIdx >= 0 && cells[codeIdx]) {
      const codeCell = cells[codeIdx];
      transaction.code = codeCell.charAt(0);
      transaction.type = parseTransactionCode(codeCell);
    }

    // Extract shares
    if (amountIdx >= 0 && cells[amountIdx]) {
      transaction.shares = cleanNumber(cells[amountIdx]);
    }

    // Extract A/D indicator
    if (adIdx >= 0 && cells[adIdx]) {
      const ad = cells[adIdx].toUpperCase();
      transaction.acquisitionDisposition = ad.includes('D') ? 'D' : ad.includes('A') ? 'A' : '';
    }

    // Extract price
    if (priceIdx >= 0 && cells[priceIdx]) {
      transaction.pricePerShare = cleanPrice(cells[priceIdx]);
    }

    // Calculate total value if we have shares and price
    if (transaction.shares && transaction.pricePerShare) {
      const shares = parseFloat(transaction.shares.replace(/,/g, ''));
      const price = parseFloat(transaction.pricePerShare.replace(/[$,]/g, ''));
      if (!isNaN(shares) && !isNaN(price)) {
        const total = shares * price;
        transaction.totalValue = formatCurrency(total);
      }
    }

    // Only add if we have meaningful data
    if (transaction.shares || transaction.type) {
      transactions.push(transaction);
    }
  }

  return transactions;
}

/**
 * Extract transactions from unstructured text
 */
function extractTransactionsFromText(text: string): Form4Transaction[] {
  const transactions: Form4Transaction[] = [];

  // Pattern for sale transactions with total value (e.g., "sold 56,820 shares at $450.66 weighted average, fetching $25.6 million")
  const saleWithTotalPatterns = [
    /(?:sold|sale of)\s+([\d,]+)\s*shares?\s*(?:at|@|for)\s*\$?([\d,.]+)(?:\s*weighted\s+average)?,?\s*(?:fetching|for|totaling|worth)\s*\$?([\d,.]+)\s*(?:M|million|B|billion)/gi,
  ];

  // Extract sales with total value first (more specific pattern)
  for (const pattern of saleWithTotalPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const shares = cleanNumber(match[1]);
      const price = cleanPrice(match[2]);
      const totalValueRaw = match[3];
      const totalValueNum = parseFloat(totalValueRaw.replace(/,/g, ''));
      // Determine multiplier from the suffix
      const suffixMatch = text.substring(match.index, match.index + match[0].length + 10).match(/(M|million|B|billion)/i);
      const multiplier = suffixMatch && (suffixMatch[1].toLowerCase() === 'b' || suffixMatch[1].toLowerCase() === 'billion') ? 1000000000 : 1000000;

      transactions.push({
        type: 'Sale',
        shares,
        pricePerShare: `$${price}`,
        totalValue: formatCurrency(totalValueNum * multiplier),
        acquisitionDisposition: 'D',
      });
    }
  }

  // Pattern for sale transactions (without total value)
  const salePatterns = [
    /(?:sold|sale of)\s+([\d,]+)\s*shares?\s*(?:at|@|for)\s*\$?([\d,.]+)(?!\s*(?:weighted|,\s*fetching))/gi,
    /([\d,]+)\s*shares?\s*(?:were\s+)?sold\s*(?:at|@|for)\s*\$?([\d,.]+)/gi,
  ];

  // Pattern for purchase transactions
  const buyPatterns = [
    /(?:bought|purchased|acquired)\s+([\d,]+)\s*shares?\s*(?:at|@|for)\s*\$?([\d,.]+)/gi,
    /([\d,]+)\s*shares?\s*(?:were\s+)?(?:bought|purchased|acquired)\s*(?:at|@|for)\s*\$?([\d,.]+)/gi,
  ];

  // Pattern for gift transactions - expanded to catch more variations
  // VRT example: "four gift transactions totaling 73,252 shares of Class A Common Stock at $0 per share"
  const giftPatterns = [
    /(?:gifted|gift of|donated)\s+([\d,]+)\s*shares?/gi,
    /([\d,]+)\s*shares?\s*(?:were\s+)?(?:gifted|donated|given)/gi,
    /gift\s+(?:transactions?\s+)?(?:totaling\s+)?([\d,]+)\s*shares?/gi,
    /([\d,]+)\s*shares?\s*(?:as\s+)?(?:a\s+)?gift/gi,
    /(?:reported|filed)\s+(?:\w+\s+)?gift\s+(?:transactions?\s+)?(?:totaling\s+)?([\d,]+)\s*shares?/gi,
  ];

  // Pattern for trust/family transfer transactions
  // Trust transfers are NOT gifts - they represent changes in beneficial ownership form
  const transferPatterns = [
    /transfer(?:red)?\s+(?:to|from)\s+(?:.*?\s+)?trust\s*[,.]?\s*([\d,]+)\s*shares?/gi,
    /transfer(?:red)?\s+([\d,]+)\s*shares?\s+(?:to|from)\s+(?:.*?\s+)?trust/gi,
    /([\d,]+)\s*shares?\s*transfer(?:red)?\s+(?:to|from)\s+(?:.*?\s+)?trust/gi,
    /trust\s+transfer\s*[:]?\s*([\d,]+)\s*shares?/gi,
    /(?:direct|indirect)\s+(?:to|from)\s+(?:indirect|direct)\s*[,.]?\s*([\d,]+)\s*shares?/gi,
    /(?:moved?|shift(?:ed)?)\s+([\d,]+)\s*shares?\s+(?:to|from|into)\s+(?:.*?\s+)?trust/gi,
    /(?:revocable|irrevocable|family)\s+trust\s*[,.]?\s*([\d,]+)\s*shares?/gi,
    /change\s+in\s+(?:beneficial\s+)?ownership\s+(?:form\s+)?.*?([\d,]+)\s*shares?/gi,
  ];

  // Extract sales
  for (const pattern of salePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const shares = cleanNumber(match[1]);
      const price = cleanPrice(match[2]);
      const sharesNum = parseFloat(shares.replace(/,/g, ''));
      const priceNum = parseFloat(price.replace(/[$,]/g, ''));

      transactions.push({
        type: 'Sale',
        shares,
        pricePerShare: `$${price}`,
        totalValue: formatCurrency(sharesNum * priceNum),
        acquisitionDisposition: 'D',
      });
    }
  }

  // Extract purchases
  for (const pattern of buyPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const shares = cleanNumber(match[1]);
      const price = cleanPrice(match[2]);
      const sharesNum = parseFloat(shares.replace(/,/g, ''));
      const priceNum = parseFloat(price.replace(/[$,]/g, ''));

      transactions.push({
        type: 'Purchase',
        shares,
        pricePerShare: `$${price}`,
        totalValue: formatCurrency(sharesNum * priceNum),
        acquisitionDisposition: 'A',
      });
    }
  }

  // Extract trust/family transfers FIRST - before gifts
  // This ensures $0 transfers to trusts aren't miscategorized as gifts
  for (const pattern of transferPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      transactions.push({
        type: 'Trust Transfer',
        shares: cleanNumber(match[1]),
        pricePerShare: '$0',
        totalValue: '$0',
        acquisitionDisposition: 'D', // Typically dispositions to trust
      });
    }
  }

  // Extract gifts (only if not already categorized as transfers)
  for (const pattern of giftPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const shares = cleanNumber(match[1]);
      // Don't add gift if we already have a transfer with same share count
      const alreadyTransfer = transactions.some(
        t => t.type.includes('Transfer') && t.shares === shares
      );
      if (!alreadyTransfer) {
        transactions.push({
          type: 'Gift',
          shares,
          pricePerShare: '$0',
          totalValue: '$0',
          acquisitionDisposition: 'D',
        });
      }
    }
  }

  // Fallback: Look for gross proceeds or total value mentions
  if (transactions.length === 0) {
    const valueMatch = text.match(/\~?\$?([\d,.]+)\s*(?:M|million|gross proceeds)/i);
    const sharesMatch = text.match(/([\d,]+)\s*shares?\s*(?:sold|disposed)/i);

    if (valueMatch || sharesMatch) {
      transactions.push({
        type: text.toLowerCase().includes('sale') ? 'Sale' : 'Transaction',
        shares: sharesMatch ? cleanNumber(sharesMatch[1]) : '',
        pricePerShare: '',
        totalValue: valueMatch ? `$${valueMatch[1]}M` : '',
        acquisitionDisposition: 'D',
      });
    }
  }

  return transactions;
}

/**
 * Extract stake information from summary
 */
function extractStakeInfo(text: string): { previous: string; current: string; percentChange: string } {
  const result = { previous: '', current: '', percentChange: '' };

  // Post-transaction ownership patterns
  const postPatterns = [
    /Post-Transaction Ownership[:\s]+([\d,]+)\s*shares?/i,
    /after.*?([\d,]+)\s*shares?/i,
    /now\s+(?:owns?|holds?)\s+([\d,]+)\s*shares?/i,
    /remaining\s+(?:stake|holdings?)[:\s]+([\d,]+)/i,
  ];

  for (const pattern of postPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      result.current = formatShareCount(match[1]);
      break;
    }
  }

  // Percentage change patterns
  const percentPatterns = [
    /(?:reduced|decreased|increased)\s+(?:by\s+)?([\d.]+)%/i,
    /([\d.]+)%\s+(?:reduction|decrease|increase)/i,
    /stake\s+(?:down|up)\s+([\d.]+)%/i,
  ];

  for (const pattern of percentPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const isDecrease = text.toLowerCase().includes('reduc') ||
                         text.toLowerCase().includes('decreas') ||
                         text.toLowerCase().includes('down') ||
                         text.toLowerCase().includes('sold');
      result.percentChange = `${isDecrease ? '-' : '+'}${match[1]}%`;
      break;
    }
  }

  return result;
}

/**
 * Check if a transaction type represents a trust/family transfer
 *
 * Trust transfers are changes in beneficial ownership form (e.g., direct to
 * indirect via trust) rather than market transactions. They should NOT be
 * treated as purchases, sales, or gifts for investment signal analysis.
 *
 * @param type - The transaction type string
 * @returns true if the transaction is a trust/family transfer
 *
 * @example
 * isTransferTransaction('Trust Transfer') // true
 * isTransferTransaction('Family Transfer') // true
 * isTransferTransaction('Sale') // false
 */
function isTransferTransaction(type: string): boolean {
  const typeLower = type.toLowerCase();
  return typeLower.includes('transfer') || typeLower.includes('trust');
}

/**
 * Determine signal strength based on transaction characteristics
 */
function determineSignalStrength(data: Form4ExtractedData, text: string): string {
  const textLower = text.toLowerCase();

  // Check for trust/family transfers
  // Transfers represent changes in ownership form, not buying/selling conviction
  const hasTransfer = data.transactions.some(t => isTransferTransaction(t.type));
  const hasTransferText = textLower.includes('trust transfer') ||
                          textLower.includes('family trust') ||
                          textLower.includes('revocable trust') ||
                          textLower.includes('irrevocable trust') ||
                          textLower.includes('change in beneficial ownership') ||
                          textLower.includes('change in form of') ||
                          (textLower.includes('transfer') && textLower.includes('trust'));

  // Check for non-transfer transactions (sales, purchases) - from structured data
  // Exclude generic "Transaction" type and empty types which are fallbacks
  const hasNonTransferTx = data.transactions.some(t => {
    const typeLower = t.type.toLowerCase().trim();
    // Empty or generic "Transaction" types mean we couldn't determine type - rely on text
    if (typeLower === '' || typeLower === 'transaction') return false;
    return !isTransferTransaction(t.type);
  });

  // Check for sale/purchase language in text (when no structured transactions)
  const hasSalePurchaseText = textLower.includes('sold') ||
                              textLower.includes('sale') ||
                              textLower.includes('purchased') ||
                              textLower.includes('bought');

  // A filing has non-transfer content if:
  // 1. There are explicit non-transfer transactions (Sale, Purchase, Gift) OR
  // 2. Text mentions sales/purchases AND doesn't mention transfers
  // If text mentions transfers/trust, prioritize that even with generic Transaction type
  const hasNonTransfer = hasNonTransferTx || (hasSalePurchaseText && !hasTransferText);

  // Check for 10b5-1 plan (routine, pre-planned)
  // But NOT if it says "no 10b5-1" or "unchecked"
  const has10b51Mention = textLower.includes('10b5-1') ||
                          textLower.includes('10b-5') ||
                          textLower.includes('rule 10b') ||
                          textLower.includes('pre-arranged trading plan') ||
                          textLower.includes('prearranged trading') ||
                          textLower.includes('pre-planned trading') ||
                          (textLower.includes('trading plan') && textLower.includes('adopted'));
  const negated10b51 = textLower.includes('no 10b5-1') ||
                       textLower.includes('no rule 10b') ||
                       textLower.includes('unchecked') ||
                       textLower.includes('not pursuant') ||
                       textLower.includes('no trading plan');

  // For mixed transaction filings (sale + transfer with 10b5-1), prioritize 10b5-1 detection
  // The 10b5-1 status applies to the sale, not the transfer
  if (has10b51Mention && !negated10b51 && hasNonTransfer) {
    return 'Weak - 10b5-1 Plan';
  }

  // If transfer-related text or transactions, and NO explicit sales/purchases, return neutral
  if ((hasTransfer || hasTransferText) && !hasNonTransfer) {
    return 'Neutral - Trust/Family Transfer';
  }

  // If has 10b5-1 without non-transfer (pure 10b5-1 mention in transfer context is still weak)
  if (has10b51Mention && !negated10b51) {
    return 'Weak - 10b5-1 Plan';
  }

  // Check for gift (usually not significant for investment thesis)
  if (data.transactions.some(t => t.type.toLowerCase() === 'gift')) {
    return 'Weak - Gift Transaction';
  }

  // Check for large percentage change (but not for transfers)
  const percentNum = parseFloat(data.percentageChange.replace(/[^0-9.-]/g, ''));
  if (!isNaN(percentNum) && Math.abs(percentNum) > 25) {
    return 'Strong - Large Position Change';
  }

  // Check for large dollar value (but not for $0 transfers)
  const totalValue = data.transactions.reduce((sum, t) => {
    // Skip transfer transactions when calculating value-based signal strength
    if (isTransferTransaction(t.type)) return sum;
    const val = parseFloat(t.totalValue.replace(/[$,KMB]/gi, ''));
    const multiplier = t.totalValue.includes('M') ? 1000000 :
                       t.totalValue.includes('K') ? 1000 : 1;
    return sum + (val * multiplier);
  }, 0);

  if (totalValue > 10000000) { // > $10M
    return 'Strong - Large Transaction';
  } else if (totalValue > 1000000) { // > $1M
    return 'Moderate';
  }

  // Check for C-suite executives
  const role = data.relationship.toLowerCase();
  if (role.includes('ceo') || role.includes('cfo') || role.includes('coo')) {
    return 'Moderate - Executive Transaction';
  }

  return 'Moderate';
}

/**
 * Calculate total value from all transactions
 */
function calculateTotalValue(transactions: Form4Transaction[]): string {
  let total = 0;

  for (const tx of transactions) {
    if (tx.totalValue) {
      const value = parseFloat(tx.totalValue.replace(/[$,]/g, ''));
      const multiplier = tx.totalValue.includes('M') ? 1000000 :
                         tx.totalValue.includes('K') ? 1000 :
                         tx.totalValue.includes('B') ? 1000000000 : 1;
      if (!isNaN(value)) {
        total += value * multiplier;
      }
    }
  }

  return formatCurrency(total);
}

/**
 * Parse SEC transaction code to human-readable type
 *
 * @param codeStr - The transaction code string from SEC filing
 * @returns Human-readable transaction type
 *
 * @example
 * parseTransactionCode('S') // 'Sale'
 * parseTransactionCode('J') // 'Trust Transfer'
 * parseTransactionCode('K') // 'Family Transfer'
 */
function parseTransactionCode(codeStr: string): string {
  const code = codeStr.charAt(0).toUpperCase();
  return TRANSACTION_CODE_MAP[code] || codeStr;
}

/**
 * Clean and format a number string
 */
function cleanNumber(str: string): string {
  return str.replace(/[^\d,]/g, '');
}

/**
 * Clean and format a price string
 */
function cleanPrice(str: string): string {
  const match = str.match(/[\d,.]+/);
  return match ? match[0] : str;
}

/**
 * Format a number as currency
 */
function formatCurrency(value: number): string {
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(1)}B`;
  } else if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  } else if (value > 0) {
    return `$${value.toFixed(0)}`;
  }
  return '';
}

/**
 * Format share count with commas
 */
function formatShareCount(str: string): string {
  const num = parseInt(str.replace(/,/g, ''), 10);
  if (isNaN(num)) return str;
  return num.toLocaleString() + ' shares';
}
