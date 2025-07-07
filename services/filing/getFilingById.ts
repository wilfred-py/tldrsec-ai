import axios from 'axios';
import { logger } from '../../lib/logging';
import * as secService from '../secService';
import { HttpError } from './types';
import { SecFilingDetails } from '../../types/sec/filing';

/**
 * Get filing data by accession number
 * @param accessionNumber SEC filing accession number
 * @param cik Optional CIK number
 * @returns Filing data or error
 */
export async function getFilingById(accessionNumber: string, cik?: string) {
  try {
    logger.debug(`Getting filing data for ${accessionNumber}`);
    
    // Use the secService to get the filing details
    // If cik is undefined, pass an empty string to meet the API requirements
    const filingData = await secService.getFilingDetails(accessionNumber, cik || '');
    
    // Create metadata object to be used by other services
    const metadata = {
      companyName: filingData.companyName,
      filingDate: filingData.filingDate,
      formType: filingData.formType,
      cik: filingData.cik,
      tickers: [] as string[]
    };
    
    // Create URLs object to be used by other services
    const urls = {
      html: `https://www.sec.gov/Archives/edgar/data/${filingData.cik}/${accessionNumber.replace(/-/g, '')}/${accessionNumber}.txt`,
      content: `https://www.sec.gov/Archives/edgar/data/${filingData.cik}/${accessionNumber.replace(/-/g, '')}/0000000000-00-000000.txt`
    };
    
    // Add metadata and urls to the filing data
    const enhancedFilingData = {
      ...filingData,
      metadata,
      urls
    };
    
    return {
      data: enhancedFilingData,
      error: null
    };
  } catch (error) {
    const httpError = error as HttpError;
    logger.error(
      `Error getting filing data: ${httpError.message}, Status: ${httpError.response?.status || 'unknown'}`
    );
    
    return {
      data: null,
      error: httpError.message || 'Unknown error'
    };
  }
}