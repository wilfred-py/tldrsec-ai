/**
 * Enhanced SEC Filing Retrieval Module
 * 
 * Provides improved functions for retrieving complete filing content from SEC EDGAR database
 * with multiple fallback strategies and content validation
 */

import { logger } from '../../lib/logging';
import { SEC_CONFIG } from '../../config/sec';
import axios from 'axios';
import { SECEdgarClient } from '../../lib/sec-edgar/client';
import { getSecApiHeaders } from './companyInfo';
import { JSDOM } from 'jsdom';

// Base URL for SEC EDGAR
const SEC_EDGAR_BASE_URL = 'https://www.sec.gov';

/**
 * Ensures a URL is absolute by prepending the SEC base URL if necessary
 * @param url URL to convert
 * @returns Absolute URL
 */
function ensureAbsoluteUrl(url: string): string {
  if (url.startsWith('http')) {
    return url;
  }
  
  // Handle relative URLs by prepending the SEC base URL
  return `${SEC_EDGAR_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Checks if content appears to be a directory listing rather than actual filing content
 * @param content Content to check
 * @returns True if content appears to be a directory listing
 */
function isDirectoryListing(content: string): boolean {
  // Common patterns in directory listings
  const directoryPatterns = [
    '<table summary="Directory Listing">',
    '<title>Index of /',
    'Directory Listing for',
    'Name</a></th><th><a href="?C=M;O=A">Last modified</a>',
    '<html><head><title>Index of /'
  ];
  
  return directoryPatterns.some(pattern => content.includes(pattern));
}

/**
 * Checks if content appears to be valid filing content
 * @param content Content to check
 * @returns True if content appears to be valid
 */
function isValidContent(content: string): boolean {
  if (!content || content.length < 100) {
    return false;
  }
  
  // Check for directory listings
  if (isDirectoryListing(content)) {
    return false;
  }
  
  // Check for common SEC filing content markers
  const validContentMarkers = [
    '<DOCUMENT>',
    '<FILING-DATE>',
    '<TYPE>',
    'SECURITIES AND EXCHANGE COMMISSION',
    'FORM',
    'CONFORMED SUBMISSION TYPE:',
    '<?xml version='
  ];
  
  return validContentMarkers.some(marker => content.includes(marker));
}

/**
 * Extracts document links from a directory listing HTML
 * @param html HTML content of the directory listing
 * @returns Array of document links
 */
function extractDocumentLinksFromDirectoryListing(html: string): string[] {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const links: string[] = [];
    
    // Get all links in the document
    const anchors = document.querySelectorAll('a');
    
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const href = anchor.getAttribute('href');
      
      if (href && !href.includes('?') && !href.includes('..')) {
        // Filter for common filing document extensions
        if (href.endsWith('.txt') || 
            href.endsWith('.xml') || 
            href.endsWith('.html') || 
            href.endsWith('.htm')) {
          links.push(href);
        }
      }
    }
    
    return links;
  } catch (error) {
    logger.error(`Error extracting links from directory listing: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Generates all possible URLs to try for a filing based on accession number and CIK
 * @param accessionNumber SEC accession number
 * @param cik Company CIK
 * @returns Array of URLs to try
 */
function generateFilingUrls(accessionNumber: string, cik: string): string[] {
  // Format CIK by removing leading zeros
  const formattedCik = cik.replace(/^0+/, '');
  
  // Format the accession number without dashes for the URL
  const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
  
  // Generate different URL patterns to try
  const urls: string[] = [];
  
  // Main filing document (primary)
  urls.push(`https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/${accessionNumber}.txt`);
  
  // Common variations for Form 4 filings
  urls.push(`https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/xslF345X03/${accessionNumber}.xml`);
  urls.push(`https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/xslF345X04/${accessionNumber}.xml`);
  urls.push(`https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/xslF345X05/${accessionNumber}.xml`);
  
  // Common variations for Form 144 filings
  urls.push(`https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/xslF144/${accessionNumber}.xml`);
  
  // Directory listing (to extract document links if needed)
  urls.push(`https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/`);
  
  // Last resort (generic placeholder)
  urls.push(`https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/0000000000-00-000000.txt`);
  
  return urls;
}

/**
 * Get complete filing content by accession number and CIK with multiple fallback strategies
 * @param accessionNumber SEC accession number
 * @param cik Company CIK
 * @returns Filing content as string
 */
export async function getCompleteFilingContent(accessionNumber: string, cik: string): Promise<string> {
  try {
    logger.debug(`Getting complete filing content for accession number ${accessionNumber} and CIK ${cik}`);
    
    // Create SEC client for fallback with proper config that matches SECEdgarConfig type
    const secEdgarConfig = {
      userAgent: SEC_CONFIG.HEADERS['User-Agent'],
      maxRequestsPerSecond: 10, // SEC fair access policy limit
      baseUrl: 'https://www.sec.gov',
      maxRetries: 3,
      retryDelay: 1000
    };
    const secClient = new SECEdgarClient(secEdgarConfig);
    
    // Get all possible URLs to try
    const urlsToTry = generateFilingUrls(accessionNumber, cik);
    
    // Try each URL in sequence
    for (const url of urlsToTry) {
      try {
        logger.debug(`Trying to fetch filing content from ${url}`);
        
        // Get the document content
        const response = await axios.get(url, { 
          headers: getSecApiHeaders(),
          timeout: 10000 // 10 second timeout
        });
        
        const content = response.data as string;
        
        // If this is a directory listing, try to extract document links
        if (isDirectoryListing(content)) {
          logger.debug(`Found directory listing at ${url}, extracting document links`);
          const documentLinks = extractDocumentLinksFromDirectoryListing(content);
          
          // Try each document link
          for (const link of documentLinks) {
            try {
              const documentUrl = ensureAbsoluteUrl(
                url.endsWith('/') ? `${url}${link}` : `${url}/${link}`
              );
              logger.debug(`Trying document link: ${documentUrl}`);
              
              const docResponse = await axios.get(documentUrl, { 
                headers: getSecApiHeaders(),
                timeout: 10000
              });
              
              const docContent = docResponse.data as string;
              
              // Validate the content
              if (isValidContent(docContent)) {
                logger.debug(`Successfully retrieved valid content from document link: ${documentUrl}`);
                return docContent;
              }
            } catch (docError) {
              logger.debug(`Error fetching document link: ${docError instanceof Error ? docError.message : String(docError)}`);
              // Continue to next document link
            }
          }
          
          // If we've tried all document links and none worked, continue to next URL
          continue;
        }
        
        // Validate the content
        if (isValidContent(content)) {
          logger.debug(`Successfully retrieved valid content from ${url}`);
          return content;
        } else {
          logger.debug(`Content from ${url} appears invalid, trying next URL`);
        }
      } catch (urlError) {
        logger.debug(`Error fetching ${url}: ${urlError instanceof Error ? urlError.message : String(urlError)}`);
        // Continue to next URL
      }
    }
    
    // If all direct URL attempts fail, try using the SEC client as a last resort
    logger.debug('All direct URL attempts failed, trying SEC client as last resort');
    
    try {
      // Format the accession number without dashes for the URL
      const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
      const formattedCik = cik.replace(/^0+/, '');
      
      // Construct a URL for the SEC client to try
      const secClientUrl = `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/${accessionNumber}.txt`;
      
      const secClientContent = await secClient.getFilingDocument(secClientUrl, { handleNotFound: true });
      
      if (secClientContent && isValidContent(secClientContent)) {
        logger.debug('Successfully retrieved valid content using SEC client');
        return secClientContent;
      }
    } catch (secClientError) {
      logger.debug(`SEC client attempt failed: ${secClientError instanceof Error ? secClientError.message : String(secClientError)}`);
    }
    
    // If we've exhausted all options, throw an error
    throw new Error(`Failed to retrieve valid filing content for ${accessionNumber} after trying all strategies`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting complete filing content for ${accessionNumber}:`, { error: errorMessage });
    throw new Error(`Failed to get complete filing content for ${accessionNumber}: ${errorMessage}`);
  }
}
