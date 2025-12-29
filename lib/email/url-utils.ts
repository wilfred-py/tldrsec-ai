/**
 * Email URL utilities for SEC filing links
 *
 * Design principle: Always link directly to the actual document when available.
 * The SEC renders Form 4/3/144 XML files with stylesheets (xslF345X05), providing
 * a clean, readable view. Users get a better experience seeing the actual filing
 * rather than an index page.
 */

/**
 * Converts an 18-digit accession number (without dashes) to the standard format with dashes.
 *
 * Format: XXXXXXXXXX-YY-ZZZZZZ
 * - First 10 digits: Filer ID
 * - Next 2 digits: Year
 * - Last 6 digits: Sequence number
 *
 * @example
 * formatAccessionNumber('000167978825000249') // Returns '0001679788-25-000249'
 */
function formatAccessionNumber(accessionNoDashes: string): string {
  // Accession numbers are 18 digits: 10 + 2 + 6
  if (accessionNoDashes.length !== 18) {
    return accessionNoDashes;
  }

  const filerId = accessionNoDashes.slice(0, 10);
  const year = accessionNoDashes.slice(10, 12);
  const sequence = accessionNoDashes.slice(12, 18);

  return `${filerId}-${year}-${sequence}`;
}

/**
 * Validates and normalizes an SEC filing URL for use in email links.
 *
 * Design: Link directly to the actual document whenever possible.
 * - XML files with xslF345X05 stylesheet (Form 4, 3, 144) render beautifully on SEC.gov
 * - HTML/HTM files are human-readable
 * - Directory URLs get converted to index page as fallback
 *
 * @param filingUrl - The SEC filing URL (directory URL, document URL, or -index.htm URL)
 * @returns A valid SEC filing URL for email display, or the EDGAR search page for empty URLs
 *
 * @example
 * // XML document (Form 4) - passes through for direct viewing (SEC renders with stylesheet)
 * getSecFilingViewerUrl('https://www.sec.gov/Archives/edgar/data/0001045810/000119903925000015/xslF345X05/wk-form4_1766450107.xml')
 * // Returns: 'https://www.sec.gov/Archives/edgar/data/0001045810/000119903925000015/xslF345X05/wk-form4_1766450107.xml'
 *
 * // HTML document (8-K, 10-K) - passes through for direct viewing
 * getSecFilingViewerUrl('https://www.sec.gov/Archives/edgar/data/0000021344/000155278125000454/e25454_ko-8k.htm')
 * // Returns: 'https://www.sec.gov/Archives/edgar/data/0000021344/000155278125000454/e25454_ko-8k.htm'
 *
 * // Directory URL - converts to index URL (fallback)
 * getSecFilingViewerUrl('https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249')
 * // Returns: 'https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249/0001679788-25-000249-index.html'
 *
 * // Empty URL - returns search fallback
 * getSecFilingViewerUrl('')
 * // Returns: 'https://www.sec.gov/edgar/searchedgar/companysearch.html'
 */
export function getSecFilingViewerUrl(filingUrl: string): string {
  // Handle empty or invalid URLs - redirect to EDGAR company search
  if (!filingUrl || filingUrl.trim() === '') {
    return 'https://www.sec.gov/edgar/searchedgar/companysearch.html';
  }

  // If already an index URL, return as-is
  if (filingUrl.includes('-index.htm')) {
    return filingUrl;
  }

  // Direct document URLs (XML, HTML, HTM) - pass through for direct viewing
  // SEC renders XML files with stylesheets, providing good UX
  if (filingUrl.match(/\.(xml|html?|htm)$/i)) {
    return filingUrl;
  }

  // Check if this is a directory URL pattern (no file extension):
  // https://www.sec.gov/Archives/edgar/data/{CIK}/{ACCESSION_NO_DASHES}
  const directoryPattern = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/?$/;
  const match = filingUrl.match(directoryPattern);

  if (match) {
    // Convert directory URL to index page as fallback
    const [, cik, accessionNoDashes] = match;
    const accessionWithDashes = formatAccessionNumber(accessionNoDashes);
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionWithDashes}-index.html`;
  }

  // Return as-is for any other URL format
  return filingUrl;
}
