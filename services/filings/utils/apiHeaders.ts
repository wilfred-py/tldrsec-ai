import { getSecApiHeaders as getSecApiHeadersInternal } from '../../filings/companyInfo';

/**
 * Gets the SEC API headers for making requests
 * @returns SEC API headers
 */
export function getSecApiHeaders() {
  return getSecApiHeadersInternal();
}
