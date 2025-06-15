export interface CompanyInfo {
  cik: string;
  name: string;
  ticker?: string;
}

export interface SecCompanyInfo {
  cik: string;
  name: string;
  ticker?: string;
  exchange?: string;
  filingSearchResponse?: FilingSearchResponse;
}
