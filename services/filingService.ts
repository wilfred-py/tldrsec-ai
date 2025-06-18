import { FilingLog } from '../types/filing';
import { FilingType } from '../types/sec/filing';
import { FormTypeMetadata, getFormMetadata, getFormsByCategory, getHighImportanceForms } from '../lib/sec-edgar/form-registry';
import { parseFormContent, extractImportantContent, ParsedContent } from '../lib/parsers/form-parser';
import { generateSystemPrompt, generateUserPrompt } from '../lib/ai/sec-prompts';
import axios from 'axios';
import { summarizeFiling } from '../lib/ai/summarize';
import * as secService from './secService';
import { prisma } from '../lib/db/index';
import { JsonObject } from '@prisma/client/runtime/library';
import { SEC_CONFIG } from '../config/sec';
import { logger } from '../lib/logging'; // Added logger import

// Import the email client and types
import { emailClient, EmailMessage } from '../lib/email';
import { getEmailTemplate } from '../lib/email/templates';
import { EmailType } from '../lib/email/types';

// Mock filing data for demonstration
const mockFilings: FilingLog[] = [
  {
    id: '1',
    ticker: 'AAPL',
    company: 'Apple Inc.',
    filingName: 'Annual Report',
    filingCode: '10-K',
    filingDate: '2025-02-15',
    status: 'completed',
    details: {
      revenue: '$394.3B',
      operatingMargin: '30.3%',
      eps: '$6.14',
      yoy: {
        revenue: '+8.1%',
        margin: '+1.2%',
        eps: '+10.4%'
      },
      keyInsights: [
        'Record services revenue of $85.2B, up 17% year-over-year',
        'Returned over $110B to shareholders through dividends and share repurchases',
        'Announced new AI features across product lineup'
      ],
      riskFactors: [
        'Increasing regulatory scrutiny in key markets',
        'Supply chain constraints affecting product availability',
        'Intensifying competition in services segment'
      ]
    }
  },
  {
    id: '2',
    ticker: 'MSFT',
    company: 'Microsoft Corporation',
    filingName: 'Quarterly Report',
    filingCode: '10-Q',
    filingDate: '2025-04-28',
    status: 'completed',
    details: {
      revenue: '$52.7B',
      operatingMargin: '42.1%',
      eps: '$2.45',
      yoy: {
        revenue: '+12.3%',
        margin: '+2.5%',
        eps: '+14.0%'
      },
      keyInsights: [
        'Azure revenue growth accelerated to 31% year-over-year',
        'AI-powered Copilot services driving new commercial bookings',
        'Operating margins expanded across all business segments'
      ],
      riskFactors: [
        'Potential economic slowdown affecting enterprise spending',
        'Cybersecurity threats targeting cloud infrastructure',
        'Increasing competition in AI services'
      ]
    }
  },
  {
    id: '3',
    ticker: 'AMZN',
    company: 'Amazon.com Inc.',
    filingName: 'Current Report',
    filingCode: '8-K',
    filingDate: '2025-05-10',
    status: 'completed'
  },
  {
    id: '4',
    ticker: 'GOOGL',
    company: 'Alphabet Inc.',
    filingName: 'Quarterly Report',
    filingCode: '10-Q',
    filingDate: '2025-05-02',
    status: 'started'
  },
  {
    id: '5',
    ticker: 'META',
    company: 'Meta Platforms Inc.',
    filingName: 'Annual Report',
    filingCode: '10-K',
    filingDate: '2025-03-20',
    status: 'failed'
  }
];

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

const filingService = {
  // Get all filing logs
  getFilingLogs: async () => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: [] };
  },
  
  // Get filing details by ID (accessionNumber)
  async getFilingById(accessionNumber: string, cik?: string): Promise<{ data: Record<string, any> }> {
    try {
      if (!accessionNumber) {
        throw new Error('Accession number is required');
      }

      // Normalize CIK if provided
      let normalizedCik = '';
      if (cik) {
        normalizedCik = cik.replace(/^0+/, '');
        // Pad with leading zeros to 10 digits for API URL
        normalizedCik = normalizedCik.padStart(10, '0');
      } else {
        // If no CIK provided, try to extract it from the accession number
        const cikMatch = accessionNumber.match(/^(\d+)-/);
        if (cikMatch && cikMatch[1]) {
          normalizedCik = cikMatch[1].padStart(10, '0');
        } else {
          throw new Error('CIK is required when accession number does not contain it');
        }
      }

      // Construct URL for the company submissions file which contains metadata for all filings
      const submissionsUrl = `https://data.sec.gov/submissions/CIK${normalizedCik}.json`;
      // Construct URL for the raw filing content
      const rawUrl = SEC_CONFIG.RAW_FILING_URL(accessionNumber, normalizedCik);

      logger.debug(`Fetching company submissions from ${submissionsUrl}`);
      logger.debug(`Fetching raw filing from ${rawUrl}`);

      // Fetch both the submissions data and raw filing content in parallel
      const [submissionsResponse, rawResponse] = await Promise.all([
        axios.get(submissionsUrl, {
          headers: SEC_CONFIG.HEADERS
        }),
        axios.get(rawUrl, {
          headers: SEC_CONFIG.HEADERS
        })
      ]);

      // Find the specific filing in the submissions data
      const submissionsData = submissionsResponse.data as {
        filings?: {
          recent?: {
            accessionNumber?: string[];
            filingDate?: string[];
            form?: string[];
            primaryDocument?: string[];
            reportDate?: string[];
          };
          files?: Array<{
            filings?: {
              recent?: {
                accessionNumber?: string[];
                filingDate?: string[];
                form?: string[];
                primaryDocument?: string[];
                reportDate?: string[];
              };
            };
          }>;
        };
        name?: string;
      };
      let filingMetadata = null;
      
      // Format accession number to match the format in the submissions file (without dashes)
      const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
      logger.debug(`Looking for formatted accession number: ${formattedAccessionNumber}`);
      
      // Log the structure of submissionsData to understand what we're working with
      logger.debug(`submissionsData keys: ${JSON.stringify(Object.keys(submissionsData))}`);
      if (submissionsData.filings) {
        logger.debug(`submissionsData.filings keys: ${JSON.stringify(Object.keys(submissionsData.filings))}`);
        if (submissionsData.filings.recent) {
          logger.debug(`submissionsData.filings.recent keys: ${JSON.stringify(Object.keys(submissionsData.filings.recent))}`);
          logger.debug(`Number of accessionNumber entries: ${(submissionsData.filings.recent.accessionNumber || []).length}`);
          logger.debug(`First few accessionNumbers: ${JSON.stringify((submissionsData.filings.recent.accessionNumber || []).slice(0, 5))}`);
        }
      }
      
      // Look for the filing in the recent filings list
      if (submissionsData.filings && submissionsData.filings.recent) {
        const recentFilings = submissionsData.filings.recent;
        const accessionNumberArray = recentFilings.accessionNumber || [];
        const accessionNumberIndex = accessionNumberArray.findIndex(
          (acc: string) => acc === formattedAccessionNumber
        );
        
        logger.debug(`accessionNumberIndex in recent filings: ${accessionNumberIndex}`);
        
        if (accessionNumberIndex !== undefined && accessionNumberIndex >= 0) {
          logger.debug(`Found filing at index ${accessionNumberIndex}`);
          logger.debug(`filingDate at index: ${(recentFilings.filingDate || [])[accessionNumberIndex]}`);
          logger.debug(`form at index: ${(recentFilings.form || [])[accessionNumberIndex]}`);
          logger.debug(`primaryDocument at index: ${(recentFilings.primaryDocument || [])[accessionNumberIndex]}`);
          logger.debug(`reportDate at index: ${(recentFilings.reportDate || [])[accessionNumberIndex]}`);
          
          filingMetadata = {
            accessionNumber: accessionNumberArray[accessionNumberIndex],
            filingDate: (recentFilings.filingDate || [])[accessionNumberIndex] || '',
            form: (recentFilings.form || [])[accessionNumberIndex] || '',
            primaryDocument: (recentFilings.primaryDocument || [])[accessionNumberIndex] || '',
            reportDate: (recentFilings.reportDate || [])[accessionNumberIndex] || ''
          };
        } else {
          logger.debug(`Filing with accessionNumber ${formattedAccessionNumber} not found in recent filings`);
        }
      }
      
      // If not found in recent, try the files array
      if (!filingMetadata && submissionsData.filings && submissionsData.filings.files) {
        logger.debug(`Filing not found in recent, checking files array with ${submissionsData.filings.files.length} entries`);
        
        for (let i = 0; i < submissionsData.filings.files.length; i++) {
          const file = submissionsData.filings.files[i];
          logger.debug(`Checking file ${i+1}/${submissionsData.filings.files.length}`);
          
          if (file.filings && file.filings.recent) {
            const fileRecentFilings = file.filings.recent;
            logger.debug(`File ${i+1} has recent filings, keys: ${JSON.stringify(Object.keys(fileRecentFilings))}`);
            
            if (fileRecentFilings.accessionNumber) {
              logger.debug(`File ${i+1} has ${fileRecentFilings.accessionNumber.length} accessionNumber entries`);
              logger.debug(`First few accessionNumbers: ${JSON.stringify(fileRecentFilings.accessionNumber.slice(0, 3))}`);
            }
            
            const fileAccessionNumberArray = fileRecentFilings.accessionNumber || [];
            const accessionNumberIndex = fileAccessionNumberArray.findIndex(
              (acc: string) => acc === formattedAccessionNumber
            );
            
            logger.debug(`File ${i+1} accessionNumberIndex: ${accessionNumberIndex}`);
            
            if (accessionNumberIndex !== undefined && accessionNumberIndex >= 0) {
              logger.debug(`Found filing in file ${i+1} at index ${accessionNumberIndex}`);
              logger.debug(`File ${i+1} filingDate at index: ${(fileRecentFilings.filingDate || [])[accessionNumberIndex]}`);
              logger.debug(`File ${i+1} form at index: ${(fileRecentFilings.form || [])[accessionNumberIndex]}`);
              logger.debug(`File ${i+1} primaryDocument at index: ${(fileRecentFilings.primaryDocument || [])[accessionNumberIndex]}`);
              logger.debug(`File ${i+1} reportDate at index: ${(fileRecentFilings.reportDate || [])[accessionNumberIndex]}`);
              
              filingMetadata = {
                accessionNumber: fileAccessionNumberArray[accessionNumberIndex],
                filingDate: (fileRecentFilings.filingDate || [])[accessionNumberIndex] || '',
                form: (fileRecentFilings.form || [])[accessionNumberIndex] || '',
                primaryDocument: (fileRecentFilings.primaryDocument || [])[accessionNumberIndex] || '',
                reportDate: (fileRecentFilings.reportDate || [])[accessionNumberIndex] || ''
              };
              break;
            }
          } else {
            logger.debug(`File ${i+1} has no recent filings`);
          }
        }
        
        if (!filingMetadata) {
          logger.debug(`Filing with accessionNumber ${formattedAccessionNumber} not found in any files`);
        }
      } else if (!filingMetadata) {
        logger.debug(`No files array found in submissionsData.filings or filingMetadata already found`);
      }

      // Combine the data from both responses
      const filingData: Record<string, any> = {
        accessionNumber,
        cik: normalizedCik,
        content: rawResponse.data,
        filingDate: filingMetadata?.filingDate || '',
        filingCode: filingMetadata?.form || '',
        company: submissionsData.name || '',
        // Include additional metadata that might be useful
        reportDate: filingMetadata?.reportDate || '',
        primaryDocument: filingMetadata?.primaryDocument || ''
      };
      
      // If metadata is not found in submissions data, try to extract it from raw filing content
      if (!filingData.filingDate || !filingData.filingCode) {
        logger.debug('Metadata not found in submissions data, attempting to extract from raw filing content');
        
        try {
          const content = rawResponse.data as string;
          
          // Extract filing date - look for common patterns in XML/text filings
          if (!filingData.filingDate) {
            // Try to find filing date in Form 4 XML
            const filingDateMatch = content.match(/<signatureDate>(\d{4}-\d{2}-\d{2})<\/signatureDate>/);
            if (filingDateMatch && filingDateMatch[1]) {
              filingData.filingDate = filingDateMatch[1];
              logger.debug(`Extracted filingDate from raw content: ${filingData.filingDate}`);
            }
            
            // Try to find filing date in other formats
            if (!filingData.filingDate) {
              const altDateMatch = content.match(/FILED:\s*(\d{2}\/\d{2}\/\d{4})/);
              if (altDateMatch && altDateMatch[1]) {
                // Convert MM/DD/YYYY to YYYY-MM-DD
                const parts = altDateMatch[1].split('/');
                if (parts.length === 3) {
                  filingData.filingDate = `${parts[2]}-${parts[0]}-${parts[1]}`;
                  logger.debug(`Extracted filingDate from raw content (alt format): ${filingData.filingDate}`);
                }
              }
            }
          }
          
          // Extract filing code (form type)
          if (!filingData.filingCode) {
            // Try to find form type in XML
            const formTypeMatch = content.match(/<transactionFormType>(\w+(-\w+)*)<\/transactionFormType>/);
            if (formTypeMatch && formTypeMatch[1]) {
              filingData.filingCode = formTypeMatch[1];
              logger.debug(`Extracted filingCode from raw content: ${filingData.filingCode}`);
            }
            
            // Try to find form type in other formats
            if (!filingData.filingCode) {
              const altFormMatch = content.match(/FORM\s+(\d+-\w+|\w+)\s/);
              if (altFormMatch && altFormMatch[1]) {
                filingData.filingCode = altFormMatch[1];
                logger.debug(`Extracted filingCode from raw content (alt format): ${filingData.filingCode}`);
              }
            }
          }
          
          // Extract company name if not already available
          if (!filingData.company) {
            // Try to find issuer name in XML
            const companyMatch = content.match(/<issuerName>([^<]+)<\/issuerName>/);
            if (companyMatch && companyMatch[1]) {
              filingData.company = companyMatch[1].trim();
              logger.debug(`Extracted company from raw content: ${filingData.company}`);
            }
          }
          
          // Extract report date if not already available
          if (!filingData.reportDate) {
            // Try to find transaction date in XML
            const reportDateMatch = content.match(/<transactionDate>\s*<value>(\d{4}-\d{2}-\d{2})<\/value>/);
            if (reportDateMatch && reportDateMatch[1]) {
              filingData.reportDate = reportDateMatch[1];
              logger.debug(`Extracted reportDate from raw content: ${filingData.reportDate}`);
            }
          }
        } catch (error) {
          logger.error(`Error extracting metadata from raw filing content: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      return { data: filingData };
    } catch (error: any) {
      logger.error(`Error fetching filing ${accessionNumber}: ${error.message}`);
      throw new Error(`Could not retrieve filing details for ${accessionNumber}`);
    }
  },
  
  // Send an email summary of the latest filings
  sendEmailSummary: async (email: string, tickers: string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'], debug: boolean = false) => {
    try {
      const summaries: FilingSummaryResult[] = [];
      const errors: {ticker: string, error: string}[] = [];
      
      // Log the start of the process with ticker count
      console.log(`[INFO][FilingService] Starting email summary generation for ${tickers.length} tickers: ${tickers.join(', ')}`);
      
      // Process each ticker
      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        const progressPercent = Math.round(((i + 1) / tickers.length) * 100);
        console.log(`[INFO][FilingService] Processing ticker ${i+1}/${tickers.length} (${progressPercent}%): ${ticker}`);
        
        try {
          // Get the latest filing for this ticker regardless of form type
          console.log(`[INFO][FilingService] Fetching latest filings for ${ticker}...`);
          const latestFilings = await secService.getLatestFilings(ticker, 3); // Get latest 3 filings
          
          if (latestFilings && latestFilings.length > 0) {
            // Log the latest filings found
            const filingInfo = latestFilings.slice(0, 3).map(f => 
              `${f.form} (${new Date(f.filingDate).toLocaleDateString()})`
            ).join(', ');
            console.log(`[INFO][FilingService] Found ${latestFilings.length} filings for ${ticker}. Latest: ${filingInfo}`);
            
            const latestFiling = latestFilings[0];
            // Use the actual form type from the latest filing
            console.log(`[INFO][FilingService] Generating summary for ${ticker} - ${latestFiling.form}...`);
            const result = await filingService.getFilingSummary(ticker, latestFiling.form as FilingType);
            
            if (result.data) {
              console.log(`[INFO][FilingService] Successfully generated summary for ${ticker} - ${latestFiling.form}`);
              summaries.push(result.data);
            } else if (result.error) {
              console.error(`[ERROR][FilingService] Failed to generate summary for ${ticker}: ${result.error}`);
              errors.push({ ticker, error: result.error });
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
      
      // Generate email content using per-filing templates
      
      
      const htmlSegments: string[] = [];
      const textSegments: string[] = [];
      for (const summary of summaries) {
        // Map filingType to EmailType
        let templateType: EmailType;
        switch (summary.filingType as string) {
          case 'Form4':
            templateType = EmailType.FORM4;
            break;
          default:
            templateType = EmailType.IMMEDIATE;
        }
        // Add await since getEmailTemplate is async
        const { html, text } = await getEmailTemplate(templateType, {
          recipientName: '',
          recipientEmail: email,
          unsubscribeUrl: process.env.UNSUBSCRIBE_URL || '',
          preferencesUrl: process.env.PREFERENCES_URL || '',
          currentYear: new Date().getFullYear(),
          filing: summary,
        });
        htmlSegments.push(html);
        textSegments.push(text);
      }
      // Append errors if any
      if (errors.length > 0) {
        htmlSegments.push(`<div class="errors"><h3>Issues Encountered</h3><ul>${errors.map(err => `<li>${err.ticker}: ${err.error}</li>`).join('')}</ul></div>`);
        textSegments.push('Issues Encountered:\n' + errors.map(err => `${err.ticker}: ${err.error}`).join('\n'));
      }
      const emailHtml = htmlSegments.join('<hr style="margin:20px 0;"/>');
      const emailText = textSegments.join('\n\n---\n\n');
      
      
      // Send email using the pre-initialized emailClient
      const emailParams: EmailMessage = {
        to: email,
        subject: `SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
        html: emailHtml,
        text: emailText,
        tags: [
          { name: 'type-summaries' },
          { name: 'content-filings' }
        ],
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
      
      let result;
      if (debug) {
        // Create a mock result for testing
        result = { id: 'debug-mode-' + Date.now(), success: true };
      } else {
        console.log(`[INFO][FilingService] Sending email summary to: ${email} with ${summaries.length} summaries and ${errors.length} errors`);
        result = await emailClient.sendEmail(emailParams);
      }
      
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
          
          if (existingSummary) { // Use cached summary from database
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
      } else if (formType.includes('25-NSE') || formType.includes('25')) {
        normalizedFormType = '25-NSE' as FilingType;
      } else if (formType.includes('13G')) {
        normalizedFormType = 'SC 13G' as FilingType;
      } else if (formType.includes('13D')) {
        normalizedFormType = 'SC 13D' as FilingType;
      } else if (formType.includes('6-K')) {
        normalizedFormType = '6-K' as FilingType;
      } else if (formType.includes('20-F')) {
        normalizedFormType = '20-F' as FilingType;
      } else if (formType.includes('40-F')) {
        normalizedFormType = '40-F' as FilingType;
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
        // Pass the company object instead of just the ticker string
        filing = await secService.getLatestFilingByFormType(company, normalizedFormType);
        if (!filing) {
          console.warn(`[DEBUG][FilingService] No ${normalizedFormType} filings found for ${ticker}`);
          return { data: null, error: `No ${normalizedFormType} filings found for ${ticker}` };
        }
        
        // Safely access properties with optional chaining
        // Log filing details, adapting to the actual structure returned by getLatestFilingByFormType
        // which returns { accessionNumber, companyName, filingDate, content } from form144Summary.ts
        console.log(`[DEBUG][FilingService] Found ${normalizedFormType} filing for ${ticker}:`, JSON.stringify({
          accessionNumber: filing.accessionNumber,
          filingDate: filing.filingDate,
          companyName: filing.companyName,
          hasContent: !!filing.content
        }));
        
        // Handle 25-NSE and other new form types with a generic approach
        if (['25-NSE', '25', 'SC 13G', 'SC 13D', '6-K', '20-F', '40-F', 'N-CSR', 'N-Q', 'N-PORT', 'PX14A6G', 'CORRESP', 'UPLOAD'].includes(normalizedFormType)) {
          console.log(`[DEBUG][FilingService] Using generic handler for ${normalizedFormType} filing`);
          
          // Create a basic summary for these form types
          const summaryText = `This is a ${normalizedFormType} filing for ${company.name} (${ticker}) filed on ${filing.filingDate}.`;
          
          // Construct a URL for the filing using the SEC EDGAR pattern
          const cik = company.cik.padStart(10, '0');
          const formattedAccessionNumber = filing.accessionNumber.replace(/-/g, '');
          const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccessionNumber}/`;
          
          return {
            data: {
              ticker: ticker,
              companyName: company.name,
              filingType: normalizedFormType,
              filingDate: filing.filingDate,
              accessionNumber: filing.accessionNumber,
              url: filingUrl,
              summaryText: summaryText,
              keyPoints: [`${normalizedFormType} filing from ${filing.filingDate}`],
              tokensUsed: 0,
              model: 'rule-based',
              cost: 0,
              processingStatus: 'completed',
              processingTimeMs: 0
            }
          };
        }
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
          mainDocument = filingDetails.documents.find((doc: any) => 
            doc.fileName.endsWith('.xml') || 
            doc.type === 'XML' ||
            doc.description.includes('PRIMARY DOCUMENT') ||
            doc.fileName === filingDetails.primaryDocument
          );
          
          // If no XML file found, fall back to any available document
          if (!mainDocument && filingDetails.documents.length > 0) {
            console.log(`[DEBUG][FilingService] No XML document found, falling back to first available document`);
            mainDocument = filingDetails.documents[0];
          }
        } else {
          // For standard forms (10-K, 10-Q, 8-K, etc.), look for HTML documents first
          mainDocument = filingDetails.documents.find((doc: any) => 
            doc.fileName === filingDetails.primaryDocument || 
            doc.fileName.endsWith('.htm') || 
            doc.fileName.endsWith('.html') ||
            doc.description.includes('FILING DOCUMENT') ||
            doc.description.includes('PRIMARY DOCUMENT')
          );
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
        
        console.log(`[DEBUG][FilingService] Found main document: ${mainDocument.fileName}`);
        
        // Initialize variables at this scope level
        let summaryText = '';
        let keyPoints: string[] = [];
        let content = '';
        
        // Get the document content
        try {
          const documentUrl = mainDocument.documentUrl;
          console.log(`[DEBUG][FilingService] Fetching document content from: ${documentUrl}`);
          
          // Get the SEC API config headers that include User-Agent
          const secHeaders = await secService.getSecApiHeaders();
          console.log(`[DEBUG][FilingService] Using SEC headers for request: ${JSON.stringify(secHeaders)}`);
          
          // Use axios for fetching to properly set headers
          try {
            // axios is now imported at the top of the file.
            const axiosResponse = await axios.get(documentUrl, {
              headers: secHeaders,
              timeout: 10000 // 10 second timeout
            });
            
            if (axiosResponse.status !== 200) {
              console.error(`[DEBUG][FilingService] Failed to fetch document: ${axiosResponse.status} ${axiosResponse.statusText}`);
              return { data: null, error: `Failed to fetch document: ${axiosResponse.status} ${axiosResponse.statusText}` };
            }
            
            // Set content to the response data with proper type casting
            content = axiosResponse.data as string;
          } catch (error) {
            // Type assertion for the error
            const axiosError = error as { message: string };
            console.error(`[DEBUG][FilingService] Axios error fetching document: ${axiosError.message}`);
            
            // Fallback to fetch with headers if axios fails
            console.log(`[DEBUG][FilingService] Trying fallback with fetch`);
            const fetchResponse = await fetch(documentUrl, {
              headers: secHeaders,
            });
            
            if (!fetchResponse.ok) {
              console.error(`[DEBUG][FilingService] Failed to fetch document: ${fetchResponse.status} ${fetchResponse.statusText}`);
              return { data: null, error: `Failed to fetch document: ${fetchResponse.status} ${fetchResponse.statusText}` };
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
  } else if (formType === '4' || formType === 'Form4' || (typeof formType === 'string' && formType.includes('Form4'))) {
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
        /* Header styling */
        .header { 
          background: linear-gradient(135deg, #7C3AED 0%, #EC4899 100%);
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .header h1 { font-size: 28px; margin: 0; }
        .header p { margin: 8px 0 0; font-size: 16px; }

        /* Card summary styling */
        .summary { 
          background-color: #fefefe;
          border: 1px solid #e2e8f0;
          padding: 20px;
          margin-bottom: 20px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .summary h2 { margin-top: 0; color: #000000; font-size: 22px; }
        .meta { color: #64748b; font-size: 14px; margin-bottom: 12px; }

        /* Key points styling */
        .key-points { 
          background-color: #fafafa;
          padding: 15px;
          border: 1px solid #e2e8f0;
          border-left: none;
          border-radius: 8px;
          margin-bottom: 15px;
        }
        .key-points h3 { margin-top: 0; font-size: 16px; font-weight: bold; color: #1E40AF; }
        .key-points ul { margin: 10px 0 0; padding-left: 20px; }

        .summary-text { margin-bottom: 15px; font-size: 14px; color: #374151; }

        /* Button styling */
        .filing-link { 
          display: inline-block;
          margin-top: 15px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #7C3AED 0%, #EC4899 100%);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: bold;
        }
        .filing-link:hover { opacity: 0.9; }

        /* Errors styling */
        .errors { background-color: #fff0f0; padding: 15px; margin-top: 20px; border-radius: 8px; }

        /* Footer */
        .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #6B7280; }
      </style>
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
