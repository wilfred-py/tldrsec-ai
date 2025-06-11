import { FilingLog } from '../types/filing';
import { FilingType } from '../lib/sec-edgar/types';
import { FormTypeMetadata, getFormMetadata, getFormsByCategory, getHighImportanceForms } from '../lib/sec-edgar/form-registry';
import { parseFormContent, extractImportantContent, ParsedContent } from '../lib/parsers/form-parser';
import { generateSystemPrompt, generateUserPrompt } from '../lib/ai/sec-prompts';
import axios from 'axios';
import { summarizeFiling } from '../lib/ai/summarize';
import * as secService from './secService';
import { prisma } from '../lib/db';
import { JsonObject } from '@prisma/client/runtime/library';

// Import the email client and types
import { emailClient, EmailMessage } from '../lib/email';

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
    return { data: mockFilings };
  },
  
  // Get filing details by ID
  getFilingById: async (id: string) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300));
    const filing = mockFilings.find(f => f.id === id);
    return { data: filing };
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
      
      // Generate email content
      const emailHtml = generateEmailHtml(summaries, errors);
      
      // Send email using the pre-initialized emailClient
      const emailParams: EmailMessage = {
        to: email,
        subject: `SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
        html: emailHtml,
        text: generatePlainTextEmail(summaries, errors),
        tags: ['type:summaries', 'content:filings'],
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
          where: { symbol: ticker.toUpperCase() }
        });

        if (tickerRecord) {
          // Caching: get latest filing accession for comparison
          let accessionNumber: string | undefined;
          try {
            const latestFiling = await secService.getLatestFilingByFormType(ticker, formType);
            accessionNumber = latestFiling?.accessionNumber;
            console.log(`[DEBUG][FilingService] Latest ${formType} for ${ticker} has accession number: ${accessionNumber}`);
          } catch (err) {
            console.error(`[ERROR][FilingService] Failed to get latest filing for caching check: ${err}`);
          }
          
          // Look for existing summary matching ticker, form and accession
          const existingSummary = await prisma.summary.findFirst({
            where: {
              tickerId: tickerRecord.id,
              filingType: formType,
              ...(accessionNumber
                ? { summaryJSON: { path: ['accessionNumber'], equals: accessionNumber } }
                : {}),
            },
            orderBy: { createdAt: 'desc' }
          });

          if (existingSummary) {
            console.log(`[INFO][FilingService] Found existing summary in database for ${ticker} - ${formType}`);
            const summaryData = (existingSummary.summaryJSON as Record<string, any>) || {};
            return {
              data: {
                ticker: ticker.toUpperCase(),
                companyName: tickerRecord.companyName || ticker,
                filingType: formType,
                filingDate: existingSummary.filingDate.toISOString(),
                accessionNumber: summaryData.accessionNumber || '',
                url: existingSummary.url || existingSummary.filingUrl || '',
                summaryText: existingSummary.summaryText,
                keyPoints: Array.isArray(summaryData.keyPoints) ? summaryData.keyPoints : [],
                tokensUsed: existingSummary.tokensUsed ?? 0,
                model: existingSummary.model ?? 'unknown',
                cost: existingSummary.cost ?? 0,
                processingStatus: existingSummary.processingStatus ?? 'COMPLETED',
                processingTimeMs: existingSummary.processingTimeMs ?? 0,
                failureReason: summaryData.failureReason || existingSummary.processingError || undefined
              }
            };
          }
        }
      } catch (dbCacheError) {
        console.error(`[ERROR][FilingService] Error checking cache: ${dbCacheError}`);
      }
      // Continue with generating a new summary
      // ... summarization logic ...
      // After building summaryResult
      // Store the summary in the database for future use
      try {
        const tickerRecord = await prisma.ticker.findFirst({ where: { symbol: ticker.toUpperCase() } });
        if (tickerRecord) {
          const existingAccessionSummary = await prisma.summary.findFirst({
            where: {
              tickerId: tickerRecord.id,
              filingType: normalizedFormType,
              summaryJSON: { path: ['accessionNumber'], equals: filing.accessionNumber }
            }
          });
          if (!existingAccessionSummary) {
            await prisma.summary.create({
              data: {
                tickerId: tickerRecord.id,
                filingType: normalizedFormType,
                filingDate: new Date(filing.filingDate),
                filingUrl: htmlViewerUrl,
                url: htmlViewerUrl,
                summaryText,
                summaryJSON: {
                  accessionNumber: filing.accessionNumber,
                  keyPoints,
                  parsedContent: content?.substring(0, 5000) || null,
                  documentType: mainDocument?.type || 'unknown',
                  documentDescription: mainDocument?.description || 'unknown',
                  rawData: filingDetails ? JSON.stringify(filingDetails).substring(0, 5000) : null,
                  generatedAt: new Date().toISOString()
                },
                sentToUser: false,
                processingStatus: 'COMPLETED'
              }
            });
            console.log(`[INFO][FilingService] Stored new summary for ${ticker} - ${normalizedFormType}`);
          } else {
            console.log(`[INFO][FilingService] Skipped duplicate summary for ${ticker} - ${normalizedFormType}`);
          }
        } else {
          console.warn(`[WARN][FilingService] No ticker record found for ${ticker}, summary not stored`);
        }
      } catch (dbError) {
        console.error(`[ERROR][FilingService] Error storing summary in DB: ${dbError}`);
      }
      console.log(`[DEBUG][FilingService] Successfully created summary for ${ticker} - ${normalizedFormType}`);
      return summaryResult;
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
        <p> ${new Date().getFullYear()} tldrSEC</p>
      </div>
    </body>
    </html>
  `;
  
  return html;
}

export default filingService;
