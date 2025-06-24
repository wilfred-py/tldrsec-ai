export const SEC_CONFIG = {
  BASE_URL: 'https://data.sec.gov',
  COMPANY_SEARCH_URL: 'https://www.sec.gov/include/ticker.txt',
  SUBMISSIONS_URL: (cik: string) => `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`,
  FILING_URL: (accessionNumber: string, cik: string) => 
    `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/index.json`,
  RAW_FILING_URL: (accessionNumber: string, cik: string) => 
    `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${accessionNumber}.txt`,
  PRIMARY_DOC_URL: (accessionNumber: string, cik: string, primaryDocument: string) => 
    `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${primaryDocument}`,
  HEADERS: {
    'User-Agent': 'tldrsec.app contact@tldrsec.app'
  }
};
