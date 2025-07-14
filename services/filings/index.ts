/**
 * Filings Module Index
 * 
 * Re-exports all filing-related modules for easier imports
 */

// Re-export existing modules with explicit naming to avoid conflicts
import * as form144 from './form144';
import * as details from './details';
import * as extractors from './extractors';
import * as parsers from './parsers';
import * as summaries from './summaries';
import * as filingDetails from './filingDetails';

// Re-export refactored modules
import * as emailGenerator from './email/emailGenerator';
import * as sendEmailSummary from './email/sendEmailSummary';
import * as filingDatabase from './database/filingDatabase';
import * as formTypeUtils from './utils/formTypeUtils';
import * as fallbackSummaryGenerator from './summaries/fallbackSummaryGenerator';
import * as filingSummaryService from './summaries/filingSummaryService';

// Export all modules
export {
  form144,
  details,
  extractors,
  parsers,
  summaries,
  filingDetails,
  emailGenerator,
  sendEmailSummary,
  filingDatabase,
  formTypeUtils,
  fallbackSummaryGenerator,
  filingSummaryService
};

// Export specific functions that don't conflict
export { parseForm144 } from './form144';
export { getFilingDetails, getLatestFilingByFormType } from './details';

// Export types that don't conflict
export * from './extractors/types';
export * from './parsers/types';
export * from './summaries/types';
