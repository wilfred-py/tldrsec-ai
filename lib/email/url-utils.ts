/**
 * Email URL utilities for SEC filing links
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
 * The SEC filing index page (-index.html) provides a clean Filing Detail view
 * that shows the filing metadata and links to all associated documents.
 * This is a good user experience as it lets users navigate to the specific
 * document they want.
 *
 * @param filingUrl - The SEC filing URL (directory URL or -index.htm URL)
 * @returns A valid SEC filing index URL, or the EDGAR search page for empty URLs
 *
 * @example
 * // Directory URL - converts to index URL
 * getSecFilingViewerUrl('https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249')
 * // Returns: 'https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249/0001679788-25-000249-index.html'
 *
 * // Already an index URL - passes through
 * getSecFilingViewerUrl('https://www.sec.gov/Archives/edgar/data/1652044/000119312525323453/0001193125-25-323453-index.htm')
 * // Returns: 'https://www.sec.gov/Archives/edgar/data/1652044/000119312525323453/0001193125-25-323453-index.htm'
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

  // Check if this is a directory URL pattern:
  // https://www.sec.gov/Archives/edgar/data/{CIK}/{ACCESSION_NO_DASHES}
  const directoryPattern = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/?$/;
  const match = filingUrl.match(directoryPattern);

  if (match) {
    const [, cik, accessionNoDashes] = match;
    const accessionWithDashes = formatAccessionNumber(accessionNoDashes);
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionWithDashes}-index.html`;
  }

  // Return original URL if pattern doesn't match
  return filingUrl;
}
