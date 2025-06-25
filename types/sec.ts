import { DOMParser } from '@xmldom/xmldom';

export interface SecCompanyInfo {
  cik: string;
  name: string;
  ticker: string;
  exchange: string;
  filingSearchResponse?: FilingSearchResponse;
  filings?: SecFiling[];
}

export interface FilingSearchResponse {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  insiderTransactionForOwnerExists: number;
  insiderTransactionForIssuerExists: number;
  name: string;
  tickers: string[];
  exchanges: string[];
  ein: string;
  description: string;
  website: string;
  investorWebsite: string;
  category: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  stateOfIncorporationDescription: string;
  addresses: {
    mailing: {
      street1: string;
      street2: string;
      city: string;
      stateOrCountry: string;
      zipCode: string;
      stateOrCountryDescription: string;
    };
    business: {
      street1: string;
      street2: string;
      city: string;
      stateOrCountry: string;
      zipCode: string;
      stateOrCountryDescription: string;
    };
  };
  phone: string;
  flags: string;
  formerNames: any[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime: string[];
      act: string[];
      form: string[];
      fileNumber: string[];
      filmNumber: string[];
      items: string[];
      size: number[];
      isXBRL: number[];
      isInlineXBRL: number[];
      primaryDocument: string[];
      primaryDocDescription: string[];
      primaryDocUrl: string[];
      filingUrl: string[];
    };
  };
}

export interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  form: string;
  reportDate?: string;
  primaryDocument: string;
  primaryDocUrl: string;
  filingUrl: string;
  description?: string;
  keyPoints?: string[];
  parsedContent?: ParsedFilingContent;
}

export interface ParsedFilingContent {
  error?: string;
  details?: string;
  issuerName: string;
  issuerTicker?: string;
  securityTitle?: string;
  reportingPerson?: string;
  reportingPersonTitle?: string;
  relationshipToIssuer?: string;
  dateOfSale: string;
  amountOfSecurities?: string;
  proposedSaleDate?: string;
  broker?: string;
  note?: string;
}

export interface SecDocument {
  type: string;
  filename: string;
  description: string;
  content: string;
}

export interface SecFilingDetails {
  accessionNumber: string;
  cik: string;
  companyName: string;
  form: string;
  filingDate: string;
  reportDate?: string;
  primaryDocument: string;
  documents: SecDocument[];
  parsedContent?: ParsedFilingContent;
  filingUrl?: string;
  keyPoints?: string[];
  description?: string;
  error?: string;
}
