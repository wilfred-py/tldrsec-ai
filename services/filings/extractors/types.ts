/**
 * Types for document extractors
 */

export interface DocumentLink {
  url: string;
  text: string;
  isPrimary?: boolean;
}

export interface ScrapingResult {
  documentUrl: string | null;
  documentLinks: DocumentLink[];
  error?: string;
}
