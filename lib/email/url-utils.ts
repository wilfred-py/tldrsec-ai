/**
 * Email URL utilities for SEC filing links
 *
 * Design principle: Always link directly to the actual document when available.
 * The SEC renders Form 4/3/144 XML files with stylesheets (xslF345X05), providing
 * a clean, readable view. Users get a better experience seeing the actual filing
 * rather than an index page.
 *
 * For XML files without stylesheets in the URL path, we construct the proper
 * XSLT stylesheet viewer URL to ensure users see formatted content.
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
 * Check if XML file already has an XSLT stylesheet path in the URL
 * Examples:
 * - /xslF345X05/form4.xml (Form 4 with stylesheet)
 * - /xsl144X01/primary_doc.xml (Form 144 with stylesheet)
 */
function hasXsltStylesheet(url: string): boolean {
  return /\/xsl[A-Z0-9]+\//i.test(url);
}

/**
 * Get the appropriate XSLT stylesheet directory for a form type
 * - Form 3/4/5 (ownership forms): xslF345X05
 * - Form 144: xsl144X01
 *
 * @returns The stylesheet directory name, or null if unknown form type
 */
function getXsltStylesheetDir(formType?: string): string | null {
  if (!formType) return null;

  const normalizedType = formType.toLowerCase().replace(/\s+/g, '').replace('form', '');

  // Form 3, 4, 5 (ownership forms)
  if (['3', '4', '5'].includes(normalizedType)) {
    return 'xslF345X05';
  }

  // Form 144
  if (normalizedType === '144') {
    return 'xsl144X01';
  }

  return null; // Unknown form type - will fallback to index
}

/**
 * Validates and normalizes an SEC filing URL for use in email links.
 *
 * Design: Link directly to the actual document whenever possible.
 * - XML files with xslF345X05 stylesheet (Form 4, 3, 144) render beautifully on SEC.gov
 * - XML files WITHOUT stylesheet get the stylesheet path injected based on form type
 * - HTML/HTM files are human-readable
 * - Directory URLs get converted to index page as fallback
 *
 * @param filingUrl - The SEC filing URL (directory URL, document URL, or -index.htm URL)
 * @param formType - Optional form type (e.g., "Form 4", "Form 144") for smart XML handling
 * @returns A valid SEC filing URL for email display, or the EDGAR search page for empty URLs
 *
 * @example
 * // XML document (Form 4) with stylesheet - passes through for direct viewing
 * getSecFilingViewerUrl('https://www.sec.gov/Archives/edgar/data/0001045810/000119903925000015/xslF345X05/wk-form4_1766450107.xml')
 * // Returns: 'https://www.sec.gov/Archives/edgar/data/0001045810/000119903925000015/xslF345X05/wk-form4_1766450107.xml'
 *
 * // XML document (Form 4) WITHOUT stylesheet - constructs stylesheet URL
 * getSecFilingViewerUrl('https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/form4.xml', 'Form 4')
 * // Returns: 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/xslF345X05/form4.xml'
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
export function getSecFilingViewerUrl(filingUrl: string, formType?: string): string {
  // Handle empty or invalid URLs - redirect to EDGAR company search
  if (!filingUrl || filingUrl.trim() === '') {
    return 'https://www.sec.gov/edgar/searchedgar/companysearch.html';
  }

  // If already an index URL, return as-is
  if (filingUrl.includes('-index.htm')) {
    return filingUrl;
  }

  // XML files with XSLT stylesheet already - pass through
  if (filingUrl.match(/\.xml$/i) && hasXsltStylesheet(filingUrl)) {
    return filingUrl;
  }

  // XML files WITHOUT stylesheet - construct proper viewer URL based on form type
  if (filingUrl.match(/\.xml$/i)) {
    const stylesheetDir = getXsltStylesheetDir(formType);

    if (stylesheetDir) {
      // Pattern: .../data/{CIK}/{ACCESSION}/{filename}.xml
      const xmlPattern = /^(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/)([^/]+\.xml)$/i;
      const xmlMatch = filingUrl.match(xmlPattern);

      if (xmlMatch) {
        const [, basePath, filename] = xmlMatch;
        // Construct: .../data/{CIK}/{ACCESSION}/{stylesheetDir}/{filename}.xml
        return `${basePath}${stylesheetDir}/${filename}`;
      }
    }

    // Fallback: convert to index page for unknown form types or non-matching patterns
    const xmlIndexPattern = /\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/[^/]+\.xml$/i;
    const indexMatch = filingUrl.match(xmlIndexPattern);
    if (indexMatch) {
      const [, cik, accessionNoDashes] = indexMatch;
      const accessionWithDashes = formatAccessionNumber(accessionNoDashes);
      return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionWithDashes}-index.html`;
    }
  }

  // HTML/HTM files - pass through for direct viewing
  if (filingUrl.match(/\.(html?|htm)$/i)) {
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
