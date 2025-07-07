/**
 * Types for document parsers
 */

export interface ParsedContent {
  text: string;
  metadata: {
    ticker?: string;
    formType?: string;
    filingDate?: string;
    companyName?: string;
    cik?: string;
    documentType?: string;
  };
  sections?: {
    title: string;
    content: string;
  }[];
}

export interface ParsingResult {
  parsed: ParsedContent | null;
  error?: string;
}
