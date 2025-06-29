import { FilingLog } from '../types/filing';
import { FilingType } from '../lib/sec-edgar/types';
import { FormTypeMetadata, getFormMetadata, getFormsByCategory, getHighImportanceForms } from '../lib/sec-edgar/form-registry';
import { parseFormContent, extractImportantContent, ParsedContent } from '../lib/parsers/form-parser';
import { generateSystemPrompt, generateUserPrompt } from '../lib/ai/sec-prompts';
import axios, { AxiosError } from 'axios';
import { summarizeFiling } from '../lib/ai/summarize';
import * as secService from './secService';
import { prisma } from '../lib/db';
import { JsonObject } from '@prisma/client/runtime/library';

// Import the email client and types
import { emailClient, EmailMessage } from '../lib/email';

// Filing processing status types
export type FilingProcessStatus = 'queued' | 'processing' | 'completed' | 'failed';

// Filing summary result interface
export interface FilingSummaryResult {
  ticker: string;
  companyName: string;
  filingType: FilingType;
  filingDate: string;
  accessionNumber: string;
  summaryText: string;
  keyPoints: string[];
  url: string; // SEC HTML viewer URL
  filingUrl?: string; // Kept for backward compatibility
  parsedContent?: ParsedContent;
  rawData?: any;
  // AI metrics fields
  tokensUsed?: number; // total tokens (legacy)
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  cost?: number;
  processingStatus?: string;
  processingTimeMs?: number;
  /**
   * If summarization failed or fallback was used, provides the error reason.
   */
  failureReason?: string;
}

/**
 * Scrapes document links from a filing page HTML
 * This function fetches the filing page HTML and extracts document links
 * to find the primary document URL when other methods fail
 * 
 * @param filing The filing object containing filingUrl
 * @param headers The SEC API headers to use for the request
 * @returns The URL of the primary document if found, otherwise null
 */
const scrapeDocumentLinksFromFilingPage = async (filing: any, headers: any): Promise<string | null> => {
  if (!filing || !filing.filingUrl) {
    console.error(`[DEBUG][FilingService] ❌ Cannot scrape document links: missing filing or filingUrl`);
    return null;
  }
  
  try {
    // Ensure the filing URL is absolute
    const SEC_BASE_URL = 'https://www.sec.gov';
    const filingPageUrl = filing.filingUrl.startsWith('http') 
      ? filing.filingUrl 
      : filing.filingUrl.startsWith('/') 
        ? `${SEC_BASE_URL}${filing.filingUrl}` 
        : `${SEC_BASE_URL}/${filing.filingUrl}`;
    
    console.log(`[DEBUG][FilingService] 🔍 Scraping document links from: ${filingPageUrl}`);
    
    // Fetch the filing page HTML
    const response = await fetch(filingPageUrl, { headers });
    
    if (!response.ok) {
      console.error(`[DEBUG][FilingService] ❌ Failed to fetch filing page: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    console.log(`[DEBUG][FilingService] ✅ Successfully fetched filing page HTML, length: ${html.length}`);
    
    // Extract document links from the HTML
    // First look for the table with document links
    const documentTable = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
    
    if (!documentTable || documentTable.length === 0) {
      console.error(`[DEBUG][FilingService] ❌ No document table found in filing page HTML`);
      
      // Try a more general approach to find any links
      const allLinks = html.match(/href="([^"]+\.(htm|html|txt|xml))"/gi);
      
      if (allLinks && allLinks.length > 0) {
        // Extract the first link that looks like a document
        for (const link of allLinks) {
          const href = link.match(/href="([^"]+)"/i)?.[1];
          
          if (href && (href.endsWith('.htm') || href.endsWith('.html') || href.endsWith('.txt') || href.endsWith('.xml'))) {
            // Check if it's a relative or absolute URL
            const documentUrl = href.startsWith('http') 
              ? href 
              : href.startsWith('/') 
                ? `${SEC_BASE_URL}${href}` 
                : `${filingPageUrl}/${href}`;
            
            console.log(`[DEBUG][FilingService] 🔗 Found document link: ${documentUrl}`);
            return documentUrl;
          }
        }
      }
      
      return null;
    }
    
    // Find the primary document link
    // First try to find a link with 'primary document' in the description
    const tableRows = documentTable[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    
    if (tableRows && tableRows.length > 0) {
      for (const row of tableRows) {
        const isPrimaryDocument = row.toLowerCase().includes('primary document') || 
                              row.toLowerCase().includes('complete submission');
        
        if (isPrimaryDocument) {
          const link = row.match(/href="([^"]+)"/i)?.[1];
          
          if (link) {
            // Check if it's a relative or absolute URL
            const documentUrl = link.startsWith('http') 
              ? link 
              : link.startsWith('/') 
                ? `${SEC_BASE_URL}${link}` 
                : `${filingPageUrl}/${link}`;
            
            console.log(`[DEBUG][FilingService] 🔗 Found primary document link: ${documentUrl}`);
            return documentUrl;
          }
        }
      }
    }
    
    // If no primary document found, try to extract links from the table
    const documentLinks = documentTable[0].match(/href="([^"]+\.(htm|html|txt|xml))"/gi);
    
    if (documentLinks && documentLinks.length > 0) {
      // Use the first document link
      const firstLink = documentLinks[0].match(/href="([^"]+)"/i)?.[1];
      
      if (firstLink) {
        // Check if it's a relative or absolute URL
        const documentUrl = firstLink.startsWith('http') 
          ? firstLink 
          : firstLink.startsWith('/') 
            ? `${SEC_BASE_URL}${firstLink}` 
            : `${filingPageUrl}/${firstLink}`;
        
        console.log(`[DEBUG][FilingService] 🔗 Using first document link: ${documentUrl}`);
        return documentUrl;
      }
    } else {
      console.error(`[DEBUG][FilingService] ❌ No document links found in table`);
    }
    
    return null;
  } catch (error) {
    console.error(`[DEBUG][FilingService] ❌ Error scraping document links: ${error}`);
    return null;
  }
};


const filingService = {
  // Get all filing logs
  getFilingLogs: async () => {
    try {
      console.log(`[DEBUG][FilingService] Getting all filing logs`);
      
      // Get filing logs from the database
      const filingLogs = await prisma.filingLog.findMany({
        orderBy: {
          filingDate: 'desc'
        },
        take: 100 // Limit to most recent 100 filings
      });
      
      console.log(`[DEBUG][FilingService] Retrieved ${filingLogs.length} filing logs`);
      return { data: filingLogs };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ERROR][FilingService] Error getting filing logs:`, errorMessage);
      throw new Error(`Failed to get filing logs: ${errorMessage}`);
    }
  },
  
  // Get filing by ID
  getFilingById: async (accessionNumber: string) => {
    try {
      console.log(`[DEBUG][FilingService] Getting filing details for accession number: ${accessionNumber}`);
      
      // Extract CIK from accession number if possible
      const cikMatch = accessionNumber.match(/^(\d+)-/); // Extract CIK from accession number format
      const cik = cikMatch ? cikMatch[1].padStart(10, '0') : null;
      
      // Construct the filing URL
      const filingUrl = cik 
        ? `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/` 
        : null;
      
      console.log(`[DEBUG][FilingService] Filing URL: ${filingUrl || 'Not available (no CIK)'}`); 
      
      // Initialize the result object
      const result: any = {
        data: {
          accessionNumber,
          documents: [],
          filingUrl
        }
      };
      
      // Only attempt to fetch metadata if we have a CIK
      if (cik) {
        try {
          // Get the SEC API config headers that include User-Agent
          const secHeaders = await secService.getSecApiHeaders();
          
          // Fetch the filing page HTML to extract document links
          const SEC_BASE_URL = 'https://www.sec.gov';
          const absoluteFilingUrl = filingUrl?.startsWith('/') 
            ? `${SEC_BASE_URL}${filingUrl}` 
            : filingUrl;
            
          if (absoluteFilingUrl) {
            console.log(`[DEBUG][FilingService] 🌐 Fetching filing page from: ${absoluteFilingUrl}`);
            
            const response = await fetch(absoluteFilingUrl, { headers: secHeaders });
            
            if (response.ok) {
              const html = await response.text();
              console.log(`[DEBUG][FilingService] ✅ Successfully fetched filing page HTML, length: ${html.length}`);
              
              // Parse the HTML to extract filing metadata and document links
              // Extract document links from tables
              const documentTables = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
              
              if (documentTables && documentTables.length > 0) {
                // Look for document links in the tables
                for (const table of documentTables) {
                  const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
                  
                  if (rows) {
                    for (const row of rows) {
                      // Skip header rows
                      if (row.includes('<th') || !row.includes('href=')) continue;
                      
                      const columns = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                      
                      if (columns && columns.length >= 2) {
                        // Extract document info
                        const linkMatch = columns[2]?.match(/href="([^"]+)"/i);
                        const descriptionText = columns[1]?.replace(/<[^>]*>/g, '').trim();
                        const typeText = columns[0]?.replace(/<[^>]*>/g, '').trim();
                        
                        if (linkMatch && linkMatch[1]) {
                          const fileName = linkMatch[1].split('/').pop() || '';
                          const documentUrl = linkMatch[1].startsWith('/') 
                            ? `${SEC_BASE_URL}${linkMatch[1]}` 
                            : `${absoluteFilingUrl}${linkMatch[1]}`;
                          
                          // Add to documents array
                          result.data.documents.push({
                            fileName,
                            description: descriptionText,
                            documentUrl,
                            type: typeText
                          });
                          
                          // If this is the primary document, set it in the result
                          if (descriptionText.toLowerCase().includes('primary document')) {
                            result.data.primaryDocument = fileName;
                            result.data.primaryDocUrl = documentUrl;
                          }
                        }
                      }
                    }
                  }
                }
              }
              
              // If no primary document was found but we have documents, use the first one
              if (!result.data.primaryDocument && result.data.documents.length > 0) {
                result.data.primaryDocument = result.data.documents[0].fileName;
                result.data.primaryDocUrl = result.data.documents[0].documentUrl;
              }
              
              console.log(`[DEBUG][FilingService] ✅ Extracted ${result.data.documents.length} documents from filing page`);
              if (result.data.primaryDocument) {
                console.log(`[DEBUG][FilingService] ✅ Primary document: ${result.data.primaryDocument}`);
              }
            } else {
              console.error(`[DEBUG][FilingService] ❌ Failed to fetch filing page: ${response.status}`);
            }
          }
        } catch (metadataError) {
          console.error(`[DEBUG][FilingService] ❌ Error fetching filing metadata: ${metadataError}`);
          // Continue with the basic filing data we have
        }
      } else {
        console.log(`[DEBUG][FilingService] ℹ️ No CIK available, skipping metadata fetch`);
      }
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ERROR][FilingService] Error getting filing details for ${accessionNumber}:`, errorMessage);
      if (error instanceof Error && error.stack) {
        console.error(`[ERROR][FilingService] Stack trace:`, error.stack);
      }
      
      // Check if this is a 404 error
      if (error instanceof AxiosError && error.response?.status === 404) {
        console.warn(`[WARN][FilingService] Filing not found (404) for ${accessionNumber}`);
        return { data: null, error: `Filing not found: ${accessionNumber}` };
      }
      
      throw new Error(`Failed to get filing details for ${accessionNumber}: ${errorMessage}`);
    }
  },
  
  // Send an email summary of the latest filings
  sendEmailSummary: async (email: string, tickers: string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'], debug: boolean = false) => {
    try {
      const summaries: FilingSummaryResult[] = [];
      const errors: {ticker: string, error: string}[] = [];
      
      // Log the start of the process with ticker count
      console.log(`[INFO][FilingService] 🚀 Starting email summary generation for ${tickers.length} tickers: ${tickers.join(', ')}`);
      
      // Process each ticker
      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        const progressPercent = Math.round(((i + 1) / tickers.length) * 100);
        console.log(`[INFO][FilingService] 🔍 Processing ticker ${i+1}/${tickers.length} (${progressPercent}%): ${ticker}`);
        
        try {
          // Get the latest filing for this ticker regardless of form type
          console.log(`[INFO][FilingService] 🔗 Fetching latest filings for ${ticker}...`);
          const latestFilings = await secService.getLatestFilings(ticker, 3); // Get latest 3 filings
          
          if (latestFilings && latestFilings.length > 0) {
            // Log the latest filings found
            const filingInfo = latestFilings.slice(0, 3).map(f => 
              `${f.form} (${new Date(f.filingDate).toLocaleDateString()})`
            ).join(', ');
            console.log(`[INFO][FilingService] ✅ Found ${latestFilings.length} filings for ${ticker}. Latest: ${latestFilings.map(f => `${f.form} (${f.filingDate})`).join(', ')}`);
            
            const latestFiling = latestFilings[0];
            // Use the actual form type from the latest filing
            console.log(`[INFO][FilingService] 📝 Generating summary for ${ticker} - ${latestFiling.form}...`);
            const result = await filingService.getFilingSummary(ticker, latestFiling.form as FilingType);
            
            if (result.data) {
              console.log(`[INFO][FilingService] ✅ Successfully generated summary for ${ticker} - ${latestFiling.form}`);
              summaries.push(result.data);
            } else {
              console.error(`[ERROR][FilingService] ❌ Failed to generate summary for ${ticker}: ${result.error}`);
              errors.push({ ticker, error: result.error || 'Unknown error' });
            }
          } else {
            console.warn(`[WARN][FilingService] No recent filings found for ${ticker}`);
            errors.push({ ticker, error: 'No recent filings found' });
          }
        } catch (error) {
          // Handle errors for individual tickers
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[ERROR][FilingService] Error processing ${ticker}: ${errorMessage}`);
          errors.push({ ticker, error: errorMessage });
        }
      }
      
      if (summaries.length === 0) {
        // Instead of throwing an error, return a graceful failure response
        console.warn(`[WARN][FilingService] No filing summaries could be generated for any of the ${tickers.length} tickers`);
        return {
          success: false,
          message: 'No filing summaries could be generated',
          errors
        };
      }
      
      console.log(`[INFO][FilingService] Successfully generated ${summaries.length} summaries. Preparing email...`);
      
      // Generate email content
      const emailHtml = generateEmailHtml(summaries, errors);
      
      // Send email using the pre-initialized emailClient
      const emailParams: EmailMessage = {
        to: email,
        subject: `SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
        html: emailHtml,
        text: generatePlainTextEmail(summaries, errors),
        tags: ['type_summaries', 'content_filings'], // Using underscores instead of colons
        replyTo: 'no-reply@tldrsec.app'
      };
      
      // Declare result variable outside the if/else blocks for proper scoping
      
      // Mark summaries as sent to users
      try {
        console.log(`[INFO][FilingService] Marking ${summaries.length} summaries as sent in the database...`);
        let updatedCount = 0;
        
        for (const summary of summaries) {
          // Find the summary in the database by ticker and filing type
          const tickerRecord = await prisma.ticker.findFirst({
            where: { symbol: summary.ticker }
          });
          
          if (tickerRecord) {
            // Update the summary to mark it as sent
            const updateResult = await prisma.summary.updateMany({
              where: {
                tickerId: tickerRecord.id,
                filingType: summary.filingType,
                summaryJSON: {
                  path: ['accessionNumber'],
                  equals: summary.accessionNumber
                }
              },
              data: {
                sentToUser: true
                // No need to set updatedAt as Prisma handles this automatically
              }
            });
            
            updatedCount += updateResult.count;
          }
        }
        
        console.log(`[INFO][FilingService] Successfully marked ${updatedCount}/${summaries.length} summaries as sent`);
      } catch (dbError) {
        // Log the error but don't fail the operation
        console.error(`[ERROR][FilingService] Failed to mark summaries as sent: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      }
      
      // Generate a summary table for the logs
      console.log(`\n[INFO][FilingService] ========== FILING SUMMARY REPORT ==========`);
      console.log(`[INFO][FilingService] Time: ${new Date().toISOString()}`);
      console.log(`[INFO][FilingService] Recipient: ${email}`);
      console.log(`[INFO][FilingService] ----------------------------------------`);
      console.log(`[INFO][FilingService] | Ticker | Filing Type | Status      | In  | Out | Cost ($) | Failure Reason`);
      console.log(`[INFO][FilingService] |--------|------------|-------------|-----|-----|---------|----------------`);
      
      // Add each summary to the table
      for (const summary of summaries) {
        const ticker = summary.ticker.padEnd(6);
        const filingType = summary.filingType.padEnd(10);
        // Determine status: Success, Partial, or Failed
        let status = 'Success';
        if (summary.processingStatus === 'COMPLETED_WITH_WARNINGS' || summary.processingStatus === 'PARTIAL') {
          status = 'Partial';
        } else if (summary.processingStatus === 'FAILED') {
          status = 'Failed';
        }
        status = status.padEnd(11);
        const inTokens = (typeof summary.inputTokens === 'number' ? summary.inputTokens : 'N/A').toString().padEnd(4);
        const outTokens = (typeof summary.outputTokens === 'number' ? summary.outputTokens : 'N/A').toString().padEnd(4);
        const cost = (summary.cost?.toFixed(4) || 'N/A').padEnd(7);
        const failureReason = summary.failureReason ? summary.failureReason.substring(0, 40) : '';
        console.log(`[INFO][FilingService] | ${ticker} | ${filingType} | ${status} | ${inTokens} | ${outTokens} | ${cost} | ${failureReason}`);
      }
      
      // Add each error to the table
      for (const error of errors) {
        const ticker = error.ticker.padEnd(6);
        const filingType = 'N/A'.padEnd(10);
        const status = 'Failed'.padEnd(11);
        const inTokens = 'N/A'.padEnd(4);
        const outTokens = 'N/A'.padEnd(4);
        const cost = 'N/A'.padEnd(7);
        const failureReason = error.error ? error.error.substring(0, 40) : '';
        console.log(`[INFO][FilingService] | ${ticker} | ${filingType} | ${status} | ${inTokens} | ${outTokens} | ${cost} | ${failureReason}`);
      }
      
      // Add summary statistics
      console.log(`[INFO][FilingService] ----------------------------------------`);
      const totalInputTokens = summaries.reduce((sum, s) => sum + (s.inputTokens || 0), 0);
      const totalOutputTokens = summaries.reduce((sum, s) => sum + (s.outputTokens || 0), 0);
      const totalCost = summaries.reduce((sum, s) => sum + (s.cost || 0), 0).toFixed(4);
      console.log(`[INFO][FilingService] | Total  | ${summaries.length} success | ${errors.length} failed | ${totalInputTokens} | ${totalOutputTokens} | ${totalCost} |`);
      console.log(`[INFO][FilingService] ========================================\n`);
      
      console.log(`[INFO][FilingService] Email summary process completed successfully`);
      
      // Log email sending details, with debug flag indication if applicable
      console.log(`[INFO][FilingService] Sending email summary to: ${email} with ${summaries.length} summaries and ${errors.length} errors${debug ? ' (debug mode)' : ''}`);
      
      // Always use the real email client
      const result = await emailClient.sendEmail(emailParams);
      
      // Final return
      return {
        success: result.success,
        message: 'Email summary sent successfully!',
        summaries,
        errors
      };
    } catch (error) {
      console.error(`[ERROR][FilingService] Failed to send email summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`[ERROR][FilingService] Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email summary'
      };
    }
  },
  
  // Get a summary of a specific filing type for a company
  getFilingSummary: async (ticker: string, formType: FilingType): Promise<{ data: FilingSummaryResult | null, error?: string }> => {
    try {
      console.log(`[DEBUG][FilingService] Getting summary for ${ticker} - ${formType}`);
      
      // Variables to store summary data
      let summaryText = '';
      let keyPoints: string[] = [];
      let riskFactors: string[] = [];
      let insightPoints: string[] = [];
      
      // Define summaryJSON at the top level so it's available throughout the function
      let summaryJSON: Record<string, any> = {};
      
      // Check if we already have this summary in the database
      try {
        // First, find the ticker record
        const tickerRecord = await prisma.ticker.findFirst({
          where: {
            symbol: ticker.toUpperCase()
          }
        });
        
        if (tickerRecord) {
          // Look for an existing summary for this ticker and filing type
          const existingSummary = await prisma.summary.findFirst({
            where: {
              tickerId: tickerRecord.id,
              filingType: formType
            },
            orderBy: {
              createdAt: 'desc'
            }
          });
          
          if (existingSummary) { // Use database cache when available
            console.log(`[INFO][FilingService] Found existing summary in database for ${ticker} - ${formType}`);
            // Parse the JSON data from the database
            const summaryData = existingSummary?.summaryJSON as Record<string, any> || {};
            
            // Return the existing summary from the database with token usage and cost information
            // Add null checks for existingSummary and tickerRecord
            return {
              data: {
                ticker: ticker,
                companyName: tickerRecord?.companyName || ticker,
                filingType: formType as FilingType,
                filingDate: existingSummary?.filingDate?.toISOString() || new Date().toISOString(),
                accessionNumber: summaryData.accessionNumber || 'unknown',
                url: existingSummary?.url || existingSummary?.filingUrl || '',
                summaryText: existingSummary?.summaryText || '',
                keyPoints: Array.isArray(summaryData.keyPoints) ? summaryData.keyPoints : [],
                tokensUsed: existingSummary?.tokensUsed || 0,
                model: existingSummary?.model || 'unknown',
                cost: existingSummary?.cost || 0,
                processingStatus: existingSummary?.processingStatus || 'N/A',
                processingTimeMs: existingSummary?.processingTimeMs || 0
              }
            };
          }
        }
      } catch (dbError) {
        console.error(`[ERROR][FilingService] Error checking database for existing summary: ${dbError}`);
        // Continue with generating a new summary
      }
      
      // Normalize form type - sometimes it comes with prefixes or different formats
      let normalizedFormType = formType;
      if (formType.includes('144') || formType === 'Form 144') {
        normalizedFormType = '144' as FilingType;
      } else if (formType.includes('8-K')) {
        normalizedFormType = '8-K' as FilingType;
      } else if (formType.includes('10-K')) {
        normalizedFormType = '10-K' as FilingType;
      } else if (formType.includes('10-Q')) {
        normalizedFormType = '10-Q' as FilingType;
      } else if (formType.includes('4') || formType === 'Form4') {
        normalizedFormType = '4' as FilingType;
      } else if (formType.includes('SD')) {
        normalizedFormType = 'SD' as FilingType;
      }
      
      console.log(`[DEBUG][FilingService] Normalized form type: ${normalizedFormType}`);
      
      // For Form 144, use the existing specialized function
      if (normalizedFormType === '144') {
        console.log(`[DEBUG][FilingService] Using specialized Form 144 summary function for ${ticker}`);
        try {
          console.log(`[DEBUG][FilingService] Calling secService.getForm144Summary for ${ticker}`);
          const summary = await secService.getForm144Summary(ticker);
          console.log(`[DEBUG][FilingService] Successfully generated Form 144 summary for ${ticker}`);
          console.log(`[DEBUG][FilingService] Form 144 summary data:`, JSON.stringify({
            ticker: summary.ticker,
            companyName: summary.companyName,
            filingDate: summary.filingDate,
            hasRawData: !!summary.rawData,
            accessionNumber: summary.rawData?.accessionNumber || 'unknown'
          }));
          
          // Add the missing accessionNumber field required by FilingSummaryResult
          // Ensure filingType is properly typed as FilingType
          // Make sure we have a URL for the filing
          const cik = summary.rawData?.cik || summary.rawData?.company?.cik || 'unknown';
          const accessionNumber = summary.rawData?.accessionNumber || 'unknown';
          const secHtmlUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/index.htm`;
          
          return { data: {
            ...summary,
            filingType: '144' as FilingType,
            accessionNumber: accessionNumber,
            filingUrl: summary.filingUrl || secHtmlUrl, // Keep for backward compatibility
            url: summary.url || summary.filingUrl || secHtmlUrl
          }};
        } catch (error) {
          const form144Error = error as Error;
          console.error(`[DEBUG][FilingService] Error generating Form 144 summary for ${ticker}:`, form144Error);
          return { data: null, error: `Failed to generate Form 144 summary: ${form144Error.message || 'Unknown error'}` };
        }
      }
      
      // For other form types, use the general approach
      console.log(`[DEBUG][FilingService] Using general approach for ${ticker} - ${normalizedFormType}`);
      
      let company;
      let filing;
      
      try {
        console.log(`[DEBUG][FilingService] Finding company by ticker: ${ticker}`);
        company = await secService.findCompanyByTicker(ticker);
        if (!company) {
          console.warn(`[DEBUG][FilingService] Company with ticker ${ticker} not found`);
          return { data: null, error: `Company with ticker ${ticker} not found` };
        }
        console.log(`[DEBUG][FilingService] Found company: ${company.name}, CIK: ${company.cik}`);
        
        console.log(`[DEBUG][FilingService] Getting latest ${normalizedFormType} filing for ${ticker}`);
        // First, ensure we have the company object with CIK before calling getLatestFilingByFormType
        if (!company || !company.cik) {
          console.error(`[ERROR][FilingService] Missing CIK for company ${ticker}`);
          return { data: null, error: `Missing CIK for company ${ticker}` };
        }
        
        // Pass the company object to getLatestFilingByFormType, not just the ticker
        filing = await secService.getLatestFilingByFormType(company, normalizedFormType);
        if (!filing) {
          console.warn(`[DEBUG][FilingService] No ${normalizedFormType} filings found for ${ticker}`);
          return { data: null, error: `No ${normalizedFormType} filings found for ${ticker}` };
        }
        
        console.log(`[DEBUG][FilingService] Found ${normalizedFormType} filing for ${ticker}:`, JSON.stringify({
          accessionNumber: filing.accessionNumber,
          filingDate: filing.filingDate,
          form: filing.form,
          // Use optional chaining to safely access properties that might not exist
          hasReportDate: !!(filing as any).reportDate,
          reportDate: (filing as any).reportDate || 'N/A',
          hasPrimaryDocument: !!filing.primaryDocument,
          primaryDocument: filing.primaryDocument || 'N/A'
        }));
      } catch (error) {
        const fetchError = error as Error;
        console.error(`[DEBUG][FilingService] Error fetching ${normalizedFormType} filing for ${ticker}:`, fetchError);
        return { data: null, error: `Error fetching filing: ${fetchError.message || 'Unknown error'}` };
      }
      
      let filingDetails: any;
      let mainDocument: any;
      
      try {
        console.log(`[DEBUG][FilingService] Getting filing details for ${ticker} - ${normalizedFormType}`);
        filingDetails = await secService.getFilingDetails(filing.accessionNumber, company.cik);
        
        console.log(`[DEBUG][FilingService] Found filing details for ${ticker} - ${normalizedFormType}:`, JSON.stringify({
          hasDocuments: !!filingDetails.documents,
          documents: filingDetails.documents || 'N/A',
          hasEntityInformation: !!filingDetails.entityInformation,
          entityInformation: filingDetails.entityInformation || 'N/A'
        }));
        
        // Find the main document (usually HTML or XML)
        console.log(`[DEBUG][FilingService] Looking for main document in ${normalizedFormType} filing for ${ticker}`);
        console.log(`[DEBUG][FilingService] Primary document from filing details: ${filingDetails.primaryDocument || 'N/A'}`);
        console.log(`[DEBUG][FilingService] Available documents:`, 
          JSON.stringify(filingDetails.documents.map((doc: any) => ({
            fileName: doc.fileName,
            description: doc.description,
            size: doc.size
          })).slice(0, 3)) // Only log first 3 to avoid overwhelming logs
        );
        
        // Enhanced document detection logic for different filing types
        
        // Special handling for Form 4, SD, and other common filing types
        if (['4', 'SC 13G', 'SC 13D', 'SD', '3', '5'].includes(normalizedFormType)) {
          // For these forms, prioritize XML files as they contain structured data
          console.log(`[DEBUG][FilingService] Using special handling for ${normalizedFormType} form type`);
          mainDocument = filingDetails.documents.find((doc: any) => {
            // Handle both filename and fileName properties and add null checks
            const docFilename = doc.filename || doc.fileName || '';
            const docDescription = doc.description || '';
            const docType = doc.type || '';
            
            return (
              (typeof docFilename === 'string' && docFilename.endsWith('.xml')) || 
              docType === 'XML' ||
              docDescription.includes('PRIMARY DOCUMENT') ||
              (filingDetails.primaryDocument && docFilename === filingDetails.primaryDocument)
            );
          });
          
          // If no XML file found, fall back to any available document
          if (!mainDocument && filingDetails.documents.length > 0) {
            console.log(`[DEBUG][FilingService] No XML document found, falling back to first available document`);
            mainDocument = filingDetails.documents[0];
          }
        } else {
          // For standard forms (10-K, 10-Q, 8-K, etc.), look for HTML documents first
          mainDocument = filingDetails.documents.find((doc: any) => {
            // Handle both filename and fileName properties (SEC API inconsistency)
            const docFilename = doc.filename || doc.fileName;
            const docDescription = doc.description || '';
            
            // Add null checks to prevent TypeError
            return (docFilename && filingDetails.primaryDocument && docFilename === filingDetails.primaryDocument) || 
                  (docFilename && typeof docFilename === 'string' && docFilename.endsWith('.htm')) || 
                  (docFilename && typeof docFilename === 'string' && docFilename.endsWith('.html')) ||
                  (docDescription && docDescription.includes('FILING DOCUMENT')) ||
                  (docDescription && docDescription.includes('PRIMARY DOCUMENT'));
          });
        }
        
        // If still no document found, try a more permissive approach
        if (!mainDocument && filingDetails.documents && filingDetails.documents.length > 0) {
          console.log(`[DEBUG][FilingService] Using fallback document detection`);
          // Take the first document that's not a graphic or exhibit
          mainDocument = filingDetails.documents.find((doc: any) => 
            !doc.fileName.toLowerCase().includes('graphic') && 
            !doc.fileName.toLowerCase().includes('image') &&
            !doc.description.toLowerCase().includes('graphic')
          ) || filingDetails.documents[0]; // Absolute fallback: just use the first document
        }
        
        if (!mainDocument) {
          console.warn(`[DEBUG][FilingService] No main document found in ${normalizedFormType} filing for ${ticker}`);
          return { data: null, error: `No main document found in ${normalizedFormType} filing for ${ticker}` };
        }
        
        // Make sure company name is defined at this scope
        const companyName = company.name || ticker;
        
        // If still no document found, try a more permissive approach
        if (!mainDocument && filingDetails.documents.length > 0) {
          console.log(`[DEBUG][FilingService] Using fallback document detection`);
          // Take the first document that's not a graphic or exhibit
          mainDocument = filingDetails.documents.find((doc: any) => 
            !doc.fileName.toLowerCase().includes('graphic') && 
            !doc.fileName.toLowerCase().includes('image') &&
            !doc.description.toLowerCase().includes('graphic')
          ) || filingDetails.documents[0]; // Absolute fallback: just use the first document
        }
        
        if (!mainDocument) {
          console.warn(`[DEBUG][FilingService] No main document found in ${normalizedFormType} filing for ${ticker}`);
          return { data: null, error: `No main document found in ${normalizedFormType} filing for ${ticker}` };
        }
        
        // Safely log the main document name with null checks
        const mainDocName = mainDocument.filename || mainDocument.fileName || 'unnamed document';
        console.log(`[DEBUG][FilingService] Found main document: ${mainDocName}`);
        
        // Initialize variables at this scope level
        let summaryText = '';
        let keyPoints: string[] = [];
        let content = '';
        
        // Get the document content
        try {
          let documentUrl = mainDocument.documentUrl;
          const documentFilename = mainDocument.filename || mainDocument.fileName;
          
          // Check if we have a valid document URL or need to use a better source
          if (!documentUrl || documentUrl.includes('0000000000-00-000000.txt') || documentUrl === '/Archives/edgar/data/') {
            console.log(`[DEBUG][FilingService] Invalid or missing document URL detected: ${documentUrl}`);
            
            // IMPROVED APPROACH: First try to use primaryDocUrl from the original filing data
            if (filing && filing.primaryDocUrl) {
              documentUrl = filing.primaryDocUrl;
              console.log(`[DEBUG][FilingService] ✅ Using primaryDocUrl from filing data: ${documentUrl}`);
            }
            // If we have filingUrl and primaryDocument, we can construct the URL
            else if (filing && filing.filingUrl && filing.primaryDocument) {
              documentUrl = `${filing.filingUrl}/${filing.primaryDocument}`;
              console.log(`[DEBUG][FilingService] ✅ Constructed URL from filingUrl and primaryDocument: ${documentUrl}`);
            }
            // Otherwise fall back to the old approach of constructing URLs
            else {
              // Get the filing accession number from multiple possible sources
              let accessionNumber = '';
              
              // Try to extract from filing details first
              if (filingDetails.accessionNumber) {
                accessionNumber = filingDetails.accessionNumber;
              } 
              // Try to extract from document URL if available
              else if (documentUrl && documentUrl.match(/\/(\d{10}-\d{2}-\d{6})\//)) {
                const matches = documentUrl.match(/\/(\d{10}-\d{2}-\d{6})\//); 
                if (matches && matches[1]) {
                  accessionNumber = matches[1];
                }
              }
              // Try to extract from the filing data if available
              else if (filing && filing.accessionNumber) {
                accessionNumber = filing.accessionNumber;
              }
              
              if (!accessionNumber) {
                console.error(`[DEBUG][FilingService] ❌ Could not determine accession number for ${ticker} - ${normalizedFormType}`);
                return { data: null, error: `Could not determine accession number for ${ticker} - ${normalizedFormType}` };
              }
              
              console.log(`[DEBUG][FilingService] 🔑 Using accession number: ${accessionNumber}`);
              
              // Extract CIK from multiple possible sources
              let cik = '';
              
              // Try filing details first
              if (filingDetails.cik) {
                cik = filingDetails.cik;
              }
              // Try company info
              else if (company && company.cik) {
                cik = company.cik.toString().padStart(10, '0');
              }
              // Try to extract from accession number
              else if (accessionNumber) {
                cik = accessionNumber.split('-')[0].padStart(10, '0');
              }
              
              if (!cik) {
                console.error(`[DEBUG][FilingService] ❌ Could not determine CIK for ${ticker} - ${normalizedFormType}`);
                return { data: null, error: `Could not determine CIK for ${ticker} - ${normalizedFormType}` };
              }
              
              console.log(`[DEBUG][FilingService] 💼 Using CIK: ${cik}`);
              
              // For Form 4 filings, try to use the XML document URL pattern
              if (['4', '3', '5'].includes(normalizedFormType)) {
                // Form 4 XML documents often follow this pattern
                const xmlFileName = filingDetails.primaryDocument || 
                                 (documentFilename && documentFilename.includes('.xml') ? documentFilename : 
                                  `xslF345X05/form4_${accessionNumber.replace(/-/g, '')}.xml`);
                
                documentUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${xmlFileName}`;
                console.log(`[DEBUG][FilingService] 📝 Using Form ${normalizedFormType} XML URL: ${documentUrl}`);
              }
              // Try to use the primary document from filing details
              else if (filingDetails.primaryDocument && filingDetails.primaryDocument !== documentFilename) {
                documentUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${filingDetails.primaryDocument}`;
                console.log(`[DEBUG][FilingService] 📄 Using primary document URL: ${documentUrl}`);
              } 
              // If we have an HTML file from the document
              else if (documentFilename && (documentFilename.endsWith('.htm') || documentFilename.endsWith('.html'))) {
                documentUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${documentFilename}`;
                console.log(`[DEBUG][FilingService] 📃 Using document filename URL: ${documentUrl}`);
              }
              // Fallback to the filing URL with index.htm appended
              else {
                documentUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${filing.primaryDocument || 'index.htm'}`;
                console.log(`[DEBUG][FilingService] 🔧 Using fallback URL: ${documentUrl}`);
              }
            }
          }
          
          // Ensure documentUrl is an absolute URL
          const SEC_BASE_URL = 'https://www.sec.gov';
          const absoluteUrl = documentUrl.startsWith('http') 
            ? documentUrl 
            : documentUrl.startsWith('/') 
              ? `${SEC_BASE_URL}${documentUrl}` 
              : `${SEC_BASE_URL}/${documentUrl}`;
          
          console.log(`[DEBUG][FilingService] 🌐 Fetching from absolute URL: ${absoluteUrl}`);
          
          // Get the SEC API config headers that include User-Agent
          const secHeaders = await secService.getSecApiHeaders();
          console.log(`[DEBUG][FilingService] Using SEC headers for request: ${JSON.stringify(secHeaders)}`);
          
          // Use axios for fetching to properly set headers
          try {
            // axios is now imported at the top of the file.
            const axiosResponse = await axios.get(absoluteUrl, {
              headers: secHeaders,
              timeout: 10000 // 10 second timeout
            });
            
            if (axiosResponse.status !== 200) {
              console.error(`[DEBUG][FilingService] ❌ Failed to fetch document: ${axiosResponse.status} ${axiosResponse.statusText}`);
              return { data: null, error: `Failed to fetch document: ${axiosResponse.status} ${axiosResponse.statusText}` };
            }
            
            // Set content to the response data - ensure it's a string
            content = typeof axiosResponse.data === 'string' ? axiosResponse.data : JSON.stringify(axiosResponse.data);
          } catch (error) {
            // Type assertion for the error
            const axiosError = error as { message: string };
            console.error(`[DEBUG][FilingService] ❌ Axios error fetching document: ${axiosError.message}`);
            
            // Fallback to fetch with headers if axios fails
            console.log(`[DEBUG][FilingService] 🔍 Trying fallback with fetch`);
            
            // Ensure URL is absolute by prepending SEC base URL if it's a relative path
            const absoluteUrl = documentUrl.startsWith('/') 
              ? `https://www.sec.gov${documentUrl}` 
              : documentUrl;
            console.log(`[DEBUG][FilingService] 🌐 Fetching from absolute URL: ${absoluteUrl}`);
            
            const fetchResponse = await fetch(absoluteUrl, {
              headers: secHeaders,
            });
            
            if (!fetchResponse.ok) {
              console.error(`[DEBUG][FilingService] ❌ Failed to fetch document: ${fetchResponse.status} ${fetchResponse.statusText}`);
              
              // If we get a 404, try alternative document formats
              if (fetchResponse.status === 404) {
                console.log(`[DEBUG][FilingService] 🔍 Trying alternative document formats...`);
                
                // Extract the base URL without the file extension
                const urlParts = absoluteUrl.split('/');
                const baseUrl = urlParts.slice(0, -1).join('/');
                const filename = urlParts[urlParts.length - 1];
                const filenameWithoutExt = filename.split('.')[0];
                
                // List of alternative file extensions to try
                const extensions = ['html', 'htm', 'xml', 'txt'];
                
                for (const ext of extensions) {
                  const alternativeUrl = `${baseUrl}/${filenameWithoutExt}.${ext}`;
                  console.log(`[DEBUG][FilingService] 🔍 Trying alternative URL: ${alternativeUrl}`);
                  
                  try {
                    const altResponse = await fetch(alternativeUrl, { headers: secHeaders });
                    if (altResponse.ok) {
                      console.log(`[DEBUG][FilingService] ✅ Successfully fetched alternative URL: ${alternativeUrl}`);
                      content = await altResponse.text();
                      break; // Exit the loop if we found a working URL
                    }
                  } catch (altError) {
                    console.error(`[DEBUG][FilingService] ❌ Error fetching alternative URL: ${alternativeUrl}`, altError);
                  }
                }
                
                // If we still don't have content, try the directory listing
                if (!content) {
                  // Try to fetch the directory listing
                  const directoryUrl = `${baseUrl}/`;
                  console.log(`[DEBUG][FilingService] Trying directory listing: ${directoryUrl}`);
                  
                  try {
                    const dirResponse = await fetch(directoryUrl, { headers: secHeaders });
                    if (dirResponse.ok) {
                      const dirHtml = await dirResponse.text();
                      console.log(`[DEBUG][FilingService] Successfully fetched directory listing. Parsing for HTML files...`);
                      
                      // Look for HTML files in the directory listing
                      const htmlFileMatches = dirHtml.match(/href="([^"]+\.html?)"/gi);
                      if (htmlFileMatches && htmlFileMatches.length > 0) {
                        // Extract the first HTML file URL
                        const htmlFile = htmlFileMatches[0].replace(/href="|"/gi, '');
                        const htmlUrl = `${baseUrl}/${htmlFile}`;
                        console.log(`[DEBUG][FilingService] Found HTML file in directory: ${htmlUrl}`);
                        
                        const htmlResponse = await fetch(htmlUrl, { headers: secHeaders });
                        if (htmlResponse.ok) {
                          content = await htmlResponse.text();
                          console.log(`[DEBUG][FilingService] ✅ Successfully fetched HTML file from directory listing`);
                        }
                      }
                    }
                  } catch (dirError) {
                    console.error(`[DEBUG][FilingService] ❌ Error fetching directory listing: ${directoryUrl}`, dirError);
                  }
                }
                
                // If we still don't have content, try to scrape document links from the filing page
                if (!content && filing && filing.filingUrl) {
                  try {
                    console.log(`[DEBUG][FilingService] 🔍 Attempting to scrape document links from filing page...`);
                    const scrapedDocumentUrl = await scrapeDocumentLinksFromFilingPage(filing, secHeaders);
                    
                    if (scrapedDocumentUrl) {
                      console.log(`[DEBUG][FilingService] ✅ Successfully scraped document URL: ${scrapedDocumentUrl}`);
                      
                      // Try to fetch the content from the scraped URL
                      try {
                        const scrapedResponse = await fetch(scrapedDocumentUrl, {
                          headers: secHeaders
                        });
                        
                        if (scrapedResponse.ok) {
                          console.log(`[DEBUG][FilingService] ✅ Successfully fetched content from scraped URL`);
                          content = await scrapedResponse.text();
                        } else {
                          console.error(`[DEBUG][FilingService] ❌ Failed to fetch content from scraped URL: ${scrapedResponse.status}`);
                        }
                      } catch (scrapedError) {
                        console.error(`[DEBUG][FilingService] ❌ Error fetching content from scraped URL: ${scrapedError}`);
                      }
                    } else {
                      console.error(`[DEBUG][FilingService] ❌ Failed to scrape document links`);
                    }
                  } catch (scrapeError) {
                    console.error(`[DEBUG][FilingService] ❌ Error during document link scraping: ${scrapeError}`);
                  }
                }
                
                // If we still don't have content, return an error
                if (!content) {
                  return { data: null, error: `Failed to fetch document: ${fetchResponse.status} ${fetchResponse.statusText}` };
                }
              } else {
                // For non-404 errors, return the original error
                return { data: null, error: `Failed to fetch document: ${fetchResponse.status} ${fetchResponse.statusText}` };
              }
            }
            
            // Get content from fetch response
            content = await fetchResponse.text();
          }
          console.log(`[DEBUG][FilingService] Successfully fetched document content, length: ${content.length} characters`);
          
          // Log a sample of the content (first 200 chars)
          const contentSample = content.substring(0, 200).replace(/\n/g, ' ');
          console.log(`[DEBUG][FilingService] Content sample: ${contentSample}...`);
          
          // Generate a meaningful summary using Claude AI
          console.log(`[DEBUG][FilingService] Generating AI summary for ${normalizedFormType} filing`);
          
          // Generate the HTML viewer URL before we use it
          const htmlViewerUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${filing.accessionNumber.replace(/-/g, '')}/`;
          
          try {
            // summarizeFiling is now imported at the top of the file.
            
            // First, store the filing in the database to get an ID
            const tickerRecord = await prisma.ticker.findFirst({
              where: {
                symbol: ticker.toUpperCase()
              }
            });
            
            if (!tickerRecord) {
              throw new Error(`Ticker record not found for ${ticker}`);
            }
            
            // Check if the SEC filing table exists in the schema
            // If not, we'll skip creating the filing record and use a different approach
            let filingId: string;
            let summaryId: string;
            
            try {
              // Create a filing record in the database
              const filingRecord = await prisma.$queryRaw`
                INSERT INTO "SecFiling" ("id", "tickerId", "formType", "filingDate", "secUrl", "accessionNumber", "companyName", "cik", "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), ${tickerRecord.id}, ${normalizedFormType}, ${new Date(filing.filingDate)}, ${documentUrl}, ${filing.accessionNumber}, ${company.name}, ${company.cik}, NOW(), NOW())
                RETURNING "id"
              `;
              
              // Extract the ID from the result
              filingId = Array.isArray(filingRecord) && filingRecord.length > 0 ? filingRecord[0].id : null;
              
              // Create a summary record to track the summarization process
              const summaryRecord = await prisma.summary.create({
                data: {
                  tickerId: tickerRecord.id,
                  filingType: normalizedFormType,
                  filingDate: new Date(filing.filingDate),
                  filingUrl: htmlViewerUrl, // Keep for backward compatibility
                  url: htmlViewerUrl, // New field for SEC HTML viewer URL
                  summaryText: '',
                  summaryJSON: {},
                  sentToUser: false
                }
              });
              
              summaryId = summaryRecord.id;
            } catch (dbError) {
              console.error(`[ERROR][FilingService] Database error creating records: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
              
              // Fallback approach - just create a summary record
              const summaryRecord = await prisma.summary.create({
                data: {
                  tickerId: tickerRecord.id,
                  filingType: normalizedFormType,
                  filingDate: new Date(filing.filingDate),
                  filingUrl: htmlViewerUrl, // Keep for backward compatibility
                  url: htmlViewerUrl, // New field for SEC HTML viewer URL
                  summaryText: '',
                  summaryJSON: {},
                  sentToUser: false
                }
              });
              
              filingId = 'temp-' + Date.now();
              summaryId = summaryRecord.id;
            }
            
            console.log(`[DEBUG][FilingService] Created filing record ID ${filingId} and summary record ID ${summaryId}`);
            
            // Helper function to extract basic key points from document content
            const extractKeyPoints = (content: string, formType: string): string[] => {
              const points: string[] = [];
              
              // Extract some basic information based on form type
              if (formType === '10-K') {
                if (content.includes('Item 7')) points.push('Includes Management Discussion & Analysis (Item 7)');
                if (content.includes('Item 1A')) points.push('Includes Risk Factors (Item 1A)');
                if (content.includes('Item 8')) points.push('Includes Financial Statements (Item 8)');
              } else if (formType === '10-Q') {
                if (content.includes('Item 2')) points.push('Includes Management Discussion & Analysis (Item 2)');
                if (content.includes('Item 1A')) points.push('Includes Risk Factors (Item 1A)');
                if (content.includes('Item 1')) points.push('Includes Financial Statements (Item 1)');
              }
              return points;
            };
            
            // Try to call the AI summarization function with error handling
            try {
              console.log(`[DEBUG][FilingService] Attempting AI summarization for ${ticker} - ${normalizedFormType}`);
              
              const summaryResult = await summarizeFiling({
                filingId: filingId,
                summaryId: summaryId,
                requestId: `filing-summary-${ticker}-${normalizedFormType}-${Date.now()}`,
                documentContent: content
              });
              
              console.log(`[DEBUG][FilingService] AI summarization completed for ${ticker} - ${normalizedFormType}`);
              
              // Extract the summary text and structured data
              // Ensure summaryText is always a string
              summaryText = typeof summaryResult.summaryText === 'string' 
                ? summaryResult.summaryText 
                : `Summary of ${normalizedFormType} filing for ${company.name} (${ticker})`;
              
              // Get the updated summary record with the AI-generated content
              const updatedSummary = await prisma.summary.findUnique({
                where: { id: summaryId }
              });
              
              // Parse the summary JSON to extract key points
              summaryJSON = updatedSummary?.summaryJSON as Record<string, any> || {};
            } catch (aiError) {
              console.error(`[ERROR][FilingService] AI summarization failed for ${ticker} - ${normalizedFormType}:`, aiError);
              console.log(`[DEBUG][FilingService] Using fallback summary generation for ${ticker} - ${normalizedFormType}`);
              
              // Use fallback summary generation
              summaryText = `Summary of ${normalizedFormType} filing for ${company.name} (${ticker}). Filed on ${new Date(filing.filingDate).toLocaleDateString()}.`;
              
              // Create basic fallback key points
              keyPoints = [
                `${normalizedFormType} filing from ${new Date(filing.filingDate).toLocaleDateString()}`,
                `Filed by ${company.name} (${ticker})`,
                `Accession number: ${filing.accessionNumber}`
              ];
              
              // Try to extract some basic info from the document content if available
              if (content) {
                const basicPoints = extractKeyPoints(content, normalizedFormType);
                if (basicPoints.length > 0) {
                  keyPoints = [...keyPoints, ...basicPoints];
                }
              }
            }
            
            // We'll skip trying to parse the summaryJSON since AI summarization failed
            if (normalizedFormType === '10-K') {
              // For 10-K, extract from financial highlights, business highlights, risk factors
              keyPoints = [
                summaryJSON.summary || `Annual report for ${company.name} (${ticker})`,
                ...(summaryJSON.financialHighlights || []).map((item: any) => 
                  `${item.metric}: ${item.value} (${item.yearOverYearChange})`
                ),
                ...(summaryJSON.businessHighlights || []).map((item: any) => item.detail),
                ...(summaryJSON.riskFactors || []).map((item: any) => item.description),
                summaryJSON.keyTakeaway || ''
              ].filter(Boolean);
            } else if (normalizedFormType === '10-Q') {
              // For 10-Q, extract from financial performance, business developments
              keyPoints = [
                summaryJSON.summary || `Quarterly report for ${company.name} (${ticker})`,
                ...(summaryJSON.financialPerformance || []).map((item: any) => 
                  `${item.metric}: ${item.value} (${item.quarterOverQuarterChange})`
                ),
                ...(summaryJSON.businessDevelopments || []).map((item: any) => item.detail),
                ...(summaryJSON.riskFactorUpdates || []).map((item: any) => item.description)
              ].filter(Boolean);
            } else {
              // For other filing types, use a more generic approach
              keyPoints = [
                summaryJSON.summary || `${normalizedFormType} filing for ${company.name} (${ticker})`,
                ...(summaryJSON.keyPoints || []),
                ...(summaryJSON.highlights || []),
                summaryJSON.conclusion || ''
              ].filter(Boolean);
            }
            
            // If we still don't have key points, create some basic ones
            if (keyPoints.length === 0) {
              keyPoints = [
                `${normalizedFormType} filing from ${new Date(filing.filingDate).toLocaleDateString()}`,
                `Filed by ${company.name} (${ticker})`,
                `Accession number: ${filing.accessionNumber}`
              ];
            }
            
            console.log(`[DEBUG][FilingService] Generated AI summary with ${keyPoints.length} key points`);
          } catch (aiError) {
            const failureReason = aiError instanceof Error ? aiError.message : 'Unknown error';
            console.error(`[ERROR][FilingService] Error generating AI summary: ${failureReason}`);
            console.error(`[ERROR][FilingService] Stack trace:`, aiError instanceof Error ? aiError.stack : 'No stack trace');
            
            // Fallback to basic summary if AI summarization fails
            console.log(`[DEBUG][FilingService] Using fallback summary generation`);
            summaryText = `Summary of ${normalizedFormType} filing for ${company.name} (${ticker})`;
            keyPoints = [
              `${normalizedFormType} filing from ${new Date(filing.filingDate).toLocaleDateString()}`,
              `Filed by ${company.name} (${ticker})`,
              `Accession number: ${filing.accessionNumber}`
            ];
            // Store failureReason for downstream reporting
            if (summaryJSON) {
              summaryJSON.failureReason = failureReason;
            }
          }
        } catch (fetchError) {
          console.error(`[DEBUG][FilingService] Error fetching or processing document for ${ticker}:`, fetchError);
          return { data: null, error: `Error fetching or processing document: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}` };
        }
        
        // Prepare final summary result
        // Ensure we use the HTML viewer URL, not the raw text URL
        // Generate a proper HTML viewer URL (not the raw text URL)
        const htmlViewerUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${filing.accessionNumber.replace(/-/g, '')}/`;
        
        // Get the updated summary record to retrieve token usage and cost information
        const updatedSummary = await prisma.summary.findFirst({
          where: {
            tickerId: (await prisma.ticker.findFirst({ where: { symbol: ticker.toUpperCase() } }))?.id,
            filingType: normalizedFormType,
            filingDate: new Date(filing.filingDate)
          },
          orderBy: {
            createdAt: 'desc'
          }
        });
        
        const summaryResult = {
          data: {
            ticker: ticker.toUpperCase(),
            companyName: company.name,
            filingType: normalizedFormType,
            filingDate: filing.filingDate,
            accessionNumber: filing.accessionNumber,
            summaryText,
            keyPoints,
            url: htmlViewerUrl,
            rawData: filingDetails,
            // Add AI metrics fields from the database record if available
            tokensUsed: updatedSummary?.tokensUsed || 0,
            model: updatedSummary?.model || 'unknown',
            cost: updatedSummary?.cost || 0,
            processingStatus: updatedSummary?.processingStatus || 'COMPLETED',
            processingTimeMs: updatedSummary?.processingTimeMs || 0,
            // Add failureReason if present in summaryJSON or updatedSummary
            failureReason: summaryJSON?.failureReason || updatedSummary?.processingError || undefined
          }
        };
        // Store the summary in the database for future use
        try {
          // Find or create the ticker record
          const tickerRecord = await prisma.ticker.findFirst({
            where: {
              symbol: ticker.toUpperCase()
            }
          });
          
          if (tickerRecord) {
            // Create a new summary record
            await prisma.summary.create({
              data: {
                tickerId: tickerRecord.id,
                filingType: normalizedFormType,
                filingDate: new Date(filing.filingDate),
                filingUrl: htmlViewerUrl, // Use the HTML viewer URL, not the raw text URL
                summaryText: summaryText,
                summaryJSON: {
                  accessionNumber: filing.accessionNumber,
                  keyPoints: keyPoints,
                  // Include detailed data for better caching
                  parsedContent: content && content.length > 0 ? content.substring(0, 5000) : null, // Store first 5000 chars of parsed content
                  documentType: mainDocument?.type || 'unknown',
                  documentDescription: mainDocument?.description || 'unknown',
                  rawData: filingDetails ? JSON.stringify(filingDetails).substring(0, 5000) : null,
                  generatedAt: new Date().toISOString(),
                  ...(summaryJSON.failureReason && { failureReason: summaryJSON.failureReason })
                },
                sentToUser: false, // Will be marked as sent when included in an email
                // Store failure reason in processingError and set processingStatus/model for fallback
                ...(summaryJSON.failureReason && {
                  processingError: summaryJSON.failureReason,
                  processingStatus: 'FAILED',
                  model: 'fallback'
                })
              }
            });
            console.log(`[INFO][FilingService] Successfully stored summary in database for ${ticker} - ${normalizedFormType}`);
          } else {
            console.warn(`[WARN][FilingService] Could not store summary in database - ticker record not found for ${ticker}`);
          }
        } catch (dbError) {
          // Log the error but don't fail the operation if database storage fails
          console.error(`[ERROR][FilingService] Failed to store summary in database: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
        }
        
        console.log(`[DEBUG][FilingService] Successfully created summary for ${ticker} - ${normalizedFormType}`);
        return summaryResult;
      } catch (innerError) {
        console.error(`[DEBUG][FilingService] Error processing filing details for ${ticker}:`, innerError);
        console.error(`[DEBUG][FilingService] Error stack:`, innerError instanceof Error ? innerError.stack : 'No stack trace available');
        return { 
          data: null, 
          error: innerError instanceof Error ? innerError.message : `Failed to process filing details for ${ticker}` 
        };
      }
    } catch (error) {
      console.error(`[DEBUG][FilingService] Error generating summary for ${ticker}:`, error);
      console.error(`[DEBUG][FilingService] Error stack:`, error instanceof Error ? error.stack : 'No stack trace available');
      console.error(`[DEBUG][FilingService] Form type that caused error: ${formType}`);
      return { 
        data: null, 
        error: error instanceof Error ? error.message : `Failed to generate summary for ${ticker}` 
      };
    }
  }
};



/**
 * Generate a plain text version of the email
 */
function generatePlainTextEmail(summaries: FilingSummaryResult[], errors: {ticker: string, error: string}[] = []): string {
  let text = `SEC Filing Summaries - ${new Date().toLocaleDateString()}\n\n`;
  
  // Add summaries
  summaries.forEach(summary => {
    const formMetadata = getFormMetadata(summary.filingType);
    const formName = formMetadata ? formMetadata.displayName : summary.filingType;
    const filingDate = new Date(summary.filingDate).toLocaleDateString();
    
    // Make sure we have a summary text
    const summaryTextContent = summary.summaryText && summary.summaryText.trim() !== '' ? 
      summary.summaryText : 
      `This is a ${formName} filing from ${summary.companyName}. View the original filing for complete details.`;
    
    text += `${summary.companyName} (${summary.ticker}) - ${formName}\n`;
    text += `Filed on: ${filingDate}\n\n`;
    text += `${summaryTextContent}\n\n`;
    
    text += `Key Points:\n`;
    summary.keyPoints.forEach((point: string) => {
      text += `- ${point}\n`;
    });
    text += `\n`;
    
    text += `View on SEC Website: ${summary.url}\n`;
    text += `\n---\n\n`;
  });
  
  // Add errors if any
  if (errors.length > 0) {
    text += `Issues Encountered:\n`;
    errors.forEach(err => {
      text += `- ${err.ticker}: ${err.error}\n`;
    });
    text += `\n`;
  }
  
  // Add footer
  text += `This email was generated by tldrSEC. The information provided is for informational purposes only and should not be considered financial advice.\n`;
  text += ` ${new Date().getFullYear()} tldrSEC\n`;
  
  return text;
}

/**
 * Generate a simple summary based on parsed content
 * This is a fallback when AI summarization is not available
 */
function generateSimpleSummary(parsedContent: ParsedContent, formType: FilingType, ticker: string, companyName: string): string {
  const { sections, keyData, title } = parsedContent;
  const formMetadata = getFormMetadata(formType);
  const formName = formMetadata ? formMetadata.displayName : formType;
  
  let summary = `This ${formName} filing from ${companyName} (${ticker}) was filed on ${new Date().toLocaleDateString()}.`;
  
  // Add information based on form type
  if (formType.includes('10-K')) {
    summary += ` This annual report provides comprehensive information about the company's financial performance, business operations, risk factors, and future outlook for the fiscal year.`;
  } else if (formType.includes('10-Q')) {
    summary += ` This quarterly report provides financial statements, management's discussion of the company's financial condition, and other important updates for the most recent fiscal quarter.`;
  } else if (formType === '8-K') {
    summary += ` This current report discloses material events or corporate changes that could be important to shareholders or the SEC.`;
  } else if (formType.includes('13D') || formType.includes('13G')) {
    summary += ` This filing discloses beneficial ownership information from investors who have acquired a significant position in the company's securities.`;
  } else if (formType === '4' || formType === 'Form4') {
    summary += ` This filing reports changes in ownership of company securities by directors, officers, or significant shareholders.`;
  }
  
  // Add key data if available
  if (Object.keys(keyData).length > 0) {
    summary += ` Key information includes: `;
    const keyItems = Object.entries(keyData)
      .filter(([_, value]) => value !== null)
      .map(([key, value]) => `${key}: ${value}`)
      .slice(0, 3);
    summary += keyItems.join(', ');
  }
  
  // Add section highlights if available
  const importantSectionNames = Object.keys(sections).slice(0, 2);
  if (importantSectionNames.length > 0) {
    summary += ` The filing includes sections on: ${importantSectionNames.join(', ')}.`;
  }
  
  return summary;
}

/**
 * Extract key points from parsed content
 */
function extractKeyPoints(parsedContent: ParsedContent, formType: FilingType): string[] {
  const { sections, keyData } = parsedContent;
  const keyPoints: string[] = [];
  
  // Add form-specific key points
  const formMetadata = getFormMetadata(formType);
  if (formMetadata) {
    keyPoints.push(`This is a ${formMetadata.displayName} filing`);
  }
  
  // Add key data points
  for (const [key, value] of Object.entries(keyData)) {
    if (value !== null && keyPoints.length < 5) {
      keyPoints.push(`${key}: ${value}`);
    }
  }
  
  // Add section highlights
  for (const [sectionName, content] of Object.entries(sections)) {
    if (keyPoints.length < 5 && content.length > 0) {
      // Extract the first sentence or a short excerpt
      const excerpt = content.split('.')[0].trim() + '.';
      if (excerpt.length < 100) {
        keyPoints.push(`${sectionName}: ${excerpt}`);
      }
    }
  }
  
  // Ensure we have at least some key points
  if (keyPoints.length === 0) {
    keyPoints.push('Filing available on SEC EDGAR');
    keyPoints.push('Contains official company disclosures');
    keyPoints.push('May contain material information for investors');
  }
  
  return keyPoints;
}

/**
 * Generate HTML email content for filing summaries
 */
function generateEmailHtml(summaries: FilingSummaryResult[], errors: {ticker: string, error: string}[] = []): string {
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
        .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; }
        .summary { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
        .summary h2 { margin-top: 0; color: #0066cc; }
        .meta { color: #666; font-size: 0.9em; margin-bottom: 10px; }
        .key-points { background-color: #f9f9f9; padding: 10px; border-left: 3px solid #0066cc; margin-bottom: 15px; }
        .key-points h3 { margin-top: 0; }
        .key-points ul { margin-bottom: 0; }
        .summary-text { margin-bottom: 15px; }
        .filing-link { display: inline-block; margin-top: 15px; background-color: #0066cc; color: white; padding: 8px 15px; text-decoration: none; border-radius: 4px; }
        .filing-link:hover { background-color: #0055aa; }
        .errors { background-color: #fff0f0; padding: 10px; margin-top: 20px; border-radius: 5px; }
        .footer { margin-top: 30px; text-align: center; font-size: 0.8em; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>SEC Filing Summaries</h1>
        <p>${new Date().toLocaleDateString()}</p>
      </div>
  `;
  
  // Add summaries
  summaries.forEach(summary => {
    const formMetadata = getFormMetadata(summary.filingType);
    const formName = formMetadata ? formMetadata.displayName : summary.filingType;
    const filingDate = new Date(summary.filingDate).toLocaleDateString();
    
    // Make sure we have a summary text
    const summaryTextContent = summary.summaryText && summary.summaryText.trim() !== '' ? 
      summary.summaryText : 
      `This is a ${formName} filing from ${summary.companyName}. View the original filing for complete details.`;
    
    html += `
      <div class="summary">
        <h2>${summary.companyName} (${summary.ticker}) - ${formName}</h2>
        <div class="meta">Filed on: ${filingDate}</div>
        
        <div class="summary-text">
          <p>${summaryTextContent}</p>
        </div>
        
        <div class="key-points">
          <h3>Key Points</h3>
          <ul>
            ${summary.keyPoints.map((point: string) => `<li>${point}</li>`).join('')}
          </ul>
        </div>
        
        <a href="${summary.url}" class="filing-link" target="_blank">View on SEC Website</a>
      </div>
    `;
  });
  
  // Add errors if any
  if (errors.length > 0) {
    html += `
      <div class="errors">
        <h3>Issues Encountered</h3>
        <ul>
          ${errors.map(err => `<li>${err.ticker}: ${err.error}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  // Add footer
  html += `
      <div class="footer">
        <p>This email was generated by tldrSEC. The information provided is for informational purposes only and should not be considered financial advice.</p>
        <p>© ${new Date().getFullYear()} tldrSEC</p>
      </div>
    </body>
    </html>
  `;
  
  return html;
}



export default filingService;
