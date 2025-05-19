/**
 * Normalizers for SEC Filing data
 * 
 * Utilities for standardizing dates, numbers, currency values, and other
 * data extracted from Claude responses.
 */

/**
 * Normalize a date string to a consistent format (YYYY-MM-DD)
 * 
 * @param dateStr - Date string to normalize
 * @returns Normalized date string
 */
export function normalizeDate(dateStr: string): string {
  try {
    // Handle common date formats
    
    // Check if it's already ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Handle "Month DD, YYYY" format (e.g., "January 15, 2023")
    const longMonthMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (longMonthMatch) {
      const [_, month, day, year] = longMonthMatch;
      const monthIndex = getMonthIndex(month);
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
    }
    
    // Handle "MM/DD/YYYY" format
    const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const [_, month, day, year] = slashMatch;
      return `${year}-${String(parseInt(month, 10)).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
    }
    
    // Handle "MM-DD-YYYY" format
    const dashMatch = dateStr.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dashMatch) {
      const [_, month, day, year] = dashMatch;
      return `${year}-${String(parseInt(month, 10)).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
    }
    
    // Handle "DD MMM YYYY" format (e.g., "15 Jan 2023")
    const shortMonthMatch = dateStr.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
    if (shortMonthMatch) {
      const [_, day, month, year] = shortMonthMatch;
      const monthIndex = getMonthIndex(month);
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
    }
    
    // If we can't recognize the format, parse it with Date
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    
    // If all else fails, return the original
    return dateStr;
  } catch (error) {
    // If parsing fails, return the original
    return dateStr;
  }
}

/**
 * Normalize a monetary value to a standard format
 * 
 * @param valueStr - Monetary value string to normalize
 * @returns Normalized monetary value string
 */
export function normalizeCurrency(valueStr: string | number): string {
  try {
    // Handle number input
    if (typeof valueStr === 'number') {
      return `$${valueStr.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    }
    
    // Handle string input
    const str = valueStr.trim();
    
    // Check if it's already in the format we want
    if (/^\$[\d,]+\.\d{2}$/.test(str)) {
      return str;
    }
    
    // Remove all non-numeric characters except decimal point and minus sign
    let numericStr = str.replace(/[^\d.-]/g, '');
    
    // Handle cases with multiple decimal points
    const decimalPoints = numericStr.match(/\./g);
    if (decimalPoints && decimalPoints.length > 1) {
      numericStr = numericStr.replace(/\./g, (match, index) => {
        return index === numericStr.lastIndexOf('.') ? '.' : '';
      });
    }
    
    // Parse the number
    const value = parseFloat(numericStr);
    
    // Format it consistently
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  } catch (error) {
    // If parsing fails, return the original with $ prefix if needed
    return typeof valueStr === 'string' 
      ? (valueStr.includes('$') ? valueStr : `$${valueStr}`) 
      : `$${valueStr}`;
  }
}

/**
 * Normalize a percentage value to a standard format
 * 
 * @param valueStr - Percentage string to normalize
 * @returns Normalized percentage string
 */
export function normalizePercentage(valueStr: string | number): string {
  try {
    // Handle number input (assumes decimal percentage, e.g., 0.25 for 25%)
    if (typeof valueStr === 'number') {
      const isDecimal = valueStr > -1 && valueStr < 1;
      const percentage = isDecimal ? valueStr * 100 : valueStr;
      return `${percentage.toFixed(2)}%`;
    }
    
    // Handle string input
    const str = valueStr.trim();
    
    // Check if it's already in the format we want
    if (/^-?\d+(\.\d+)?%$/.test(str)) {
      // Ensure it has 2 decimal places
      const match = str.match(/^(-?\d+(\.\d+)?)%$/);
      if (match) {
        return `${parseFloat(match[1]).toFixed(2)}%`;
      }
      return str;
    }
    
    // Remove all non-numeric characters except decimal point and minus sign
    let numericStr = str.replace(/[^\d.-]/g, '');
    
    // Parse the number
    const value = parseFloat(numericStr);
    
    // If the string already included a % symbol, assume the number is a percentage
    // Otherwise, if it's very large, assume it's basis points (1% = 100bp)
    const isPercentage = str.includes('%');
    const isBasisPoints = !isPercentage && value > 100;
    
    if (isBasisPoints) {
      return `${(value / 100).toFixed(2)}%`;
    }
    
    return `${value.toFixed(2)}%`;
  } catch (error) {
    // If parsing fails, return the original with % suffix if needed
    return typeof valueStr === 'string' 
      ? (valueStr.includes('%') ? valueStr : `${valueStr}%`) 
      : `${valueStr}%`;
  }
}

/**
 * Helper function to get month index from name
 * 
 * @param month - Month name or abbreviation
 * @returns Zero-based month index (0-11)
 */
function getMonthIndex(month: string): number {
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  const shortMonths = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
  ];
  
  const normalizedMonth = month.toLowerCase();
  
  // Check full month names
  const fullIndex = months.findIndex(m => m.startsWith(normalizedMonth));
  if (fullIndex !== -1) {
    return fullIndex;
  }
  
  // Check abbreviated month names
  const shortIndex = shortMonths.findIndex(m => m === normalizedMonth);
  if (shortIndex !== -1) {
    return shortIndex;
  }
  
  // Default to January (0) if not found
  return 0;
} 