import { FilingLog } from '@/types/filing';
import { FilingType } from '../lib/sec-edgar/types';
import { FormTypeMetadata, getFormMetadata, getFormsByCategory, getHighImportanceForms } from '../lib/sec-edgar/form-registry';
import { parseFormContent, extractImportantContent, ParsedContent } from '../lib/parsers/form-parser';
import { generateSystemPrompt, generateUserPrompt } from '../lib/ai/sec-prompts';
import * as secService from './secService';

// Mock email client until we install the Resend package
class ResendClient {
  async sendEmail(options: any) {
    console.log('Mock email sending:', options);
    return { success: true, id: 'mock-email-id' };
  }
}

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
  filingUrl: string;
  parsedContent?: ParsedContent;
  rawData?: any;
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
  sendEmailSummary: async (email: string, tickers: string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META']) => {
    try {
      const summaries: FilingSummaryResult[] = [];
      const errors: {ticker: string, error: string}[] = [];
      
      // Get summaries for each ticker
      for (const ticker of tickers) {
        try {
          // Get the latest filings of any type for this ticker
          const latestFilings = await secService.getLatestFilings(ticker, 3); // Get top 3 latest filings
          
          if (!latestFilings || latestFilings.length === 0) {
            errors.push({ ticker, error: 'No recent filings found' });
            continue;
          }
          
          // Process each filing and try to get a summary
          let foundSummary = false;
          
          console.log(`Processing ${latestFilings.length} latest filings for ${ticker}:`, 
            latestFilings.map(f => `${f.form} (${f.filingDate})`).join(', '));
          
          for (const filing of latestFilings) {
            try {
              // Extract form type from the filing
              const formType = filing.form as FilingType;
              console.log(`Attempting to get summary for ${ticker} - ${formType} filing from ${filing.filingDate}`);
              
              // Get summary for this filing
              const filingSummary = await filingService.getFilingSummary(ticker, formType);
              
              if (filingSummary.data) {
                console.log(`Successfully generated summary for ${ticker} - ${formType}`);
                summaries.push(filingSummary.data);
                foundSummary = true;
                break; // Found a valid summary, move to next ticker
              } else {
                console.warn(`Failed to generate summary for ${ticker} - ${formType}: ${filingSummary.error}`);
              }
            } catch (filingError) {
              console.error(`Error processing ${filing.form} for ${ticker}:`, filingError);
              // Continue to next filing if this one fails
            }
          }
          
          // If we couldn't get a summary for any of the filings
          if (!foundSummary) {
            errors.push({ ticker, error: 'Could not generate summaries for recent filings' });
          }
        } catch (error) {
          console.error(`Error getting summary for ${ticker}:`, error);
          errors.push({ 
            ticker, 
            error: error instanceof Error ? error.message : 'Failed to get filing summary' 
          });
        }
      }
      
      if (summaries.length === 0) {
        // Instead of throwing an error, return a graceful failure response
        return {
          success: false,
          message: 'No filing summaries could be generated',
          errors
        };
      }
      
      // Generate email content
      const emailHtml = generateEmailHtml(summaries, errors);
      
      // Send email
      const emailClient = new ResendClient();
      const result = await emailClient.sendEmail({
        to: email,
        subject: `SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
        html: emailHtml,
        text: generatePlainTextEmail(summaries, errors),
        tags: ['type:summaries', 'content:filings'], // Use simple string tags
        replyTo: 'no-reply@tldrsec.app'
      });
      
      return {
        success: true,
        message: 'Email summary sent successfully!',
        summaries,
        errors
      };
    } catch (error) {
      console.error('Error sending email summary:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email summary'
      };
    }
  },
  
  // Get a summary of a specific filing type for a company
  getFilingSummary: async (ticker: string, formType: FilingType): Promise<{ data: FilingSummaryResult | null, error?: string }> => {
    try {
      console.log(`Getting summary for ${ticker} - ${formType}`);
      
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
      }
      
      console.log(`Normalized form type: ${normalizedFormType}`);
      
      // For Form 144, use the existing specialized function
      if (normalizedFormType === '144') {
        console.log(`Using specialized Form 144 summary function for ${ticker}`);
        try {
          const summary = await secService.getForm144Summary(ticker);
          console.log(`Successfully generated Form 144 summary for ${ticker}`);
          // Add the missing accessionNumber field required by FilingSummaryResult
          // Ensure filingType is properly typed as FilingType
          return { data: {
            ...summary,
            filingType: '144' as FilingType,
            accessionNumber: summary.rawData?.accessionNumber || 'unknown'
          }};
        } catch (error) {
          const form144Error = error as Error;
          console.error(`Error generating Form 144 summary for ${ticker}:`, form144Error);
          return { data: null, error: `Failed to generate Form 144 summary: ${form144Error.message || 'Unknown error'}` };
        }
      }
      
      // For other form types, use the general approach
      console.log(`Using general approach for ${ticker} - ${normalizedFormType}`);
      
      let company;
      let filing;
      
      try {
        company = await secService.findCompanyByTicker(ticker);
        if (!company) {
          console.warn(`Company with ticker ${ticker} not found`);
          return { data: null, error: `Company with ticker ${ticker} not found` };
        }
        
        filing = await secService.getLatestFilingByFormType(ticker, normalizedFormType);
        if (!filing) {
          console.warn(`No ${normalizedFormType} filings found for ${ticker}`);
          return { data: null, error: `No ${normalizedFormType} filings found for ${ticker}` };
        }
        
        console.log(`Found ${normalizedFormType} filing for ${ticker}: ${filing.accessionNumber} from ${filing.filingDate}`);
      } catch (error) {
        const fetchError = error as Error;
        console.error(`Error fetching ${normalizedFormType} filing for ${ticker}:`, fetchError);
        return { data: null, error: `Error fetching filing: ${fetchError.message || 'Unknown error'}` };
      }
      
      let filingDetails: any;
      try {
        filingDetails = await secService.getFilingDetails(filing.accessionNumber, company.cik);
        
        // Find the main document (usually HTML or XML)
        const mainDocument = filingDetails.documents.find((doc: any) => 
          doc.fileName === filingDetails.primaryDocument || 
          doc.fileName.endsWith('.htm') || 
          doc.fileName.endsWith('.html')
        );
        
        if (!mainDocument) {
          return { data: null, error: `No main document found in ${normalizedFormType} filing for ${ticker}` };
        }
        
        // Get the document content
        const documentUrl = mainDocument.documentUrl;
        const response = await fetch(documentUrl);
        const content = await response.text();
        
        // Generate a simple summary based on the content
        // This is a placeholder for actual implementation
        const summaryText = `Summary of ${normalizedFormType} filing for ${company.name} (${ticker})`;
        
        // Extract key points (placeholder)
        const keyPoints = [
          `${normalizedFormType} filing from ${new Date(filing.filingDate).toLocaleDateString()}`,
          `Filed by ${company.name} (${ticker})`,
          `Accession number: ${filing.accessionNumber}`
        ];
        
        return {
          data: {
            ticker: ticker.toUpperCase(),
            companyName: company.name,
            filingType: normalizedFormType,
            filingDate: filing.filingDate,
            accessionNumber: filing.accessionNumber,
            summaryText,
            keyPoints,
            filingUrl: filing.filingUrl,
            rawData: filingDetails
          }
        };
      } catch (innerError) {
        console.error(`Error processing filing details for ${ticker}:`, innerError);
        return { 
          data: null, 
          error: innerError instanceof Error ? innerError.message : `Failed to process filing details for ${ticker}` 
        };
      }
    } catch (error) {
      console.error(`Error generating summary for ${ticker}:`, error);
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
function generatePlainTextEmail(summaries: FilingSummaryResult[], errors: {ticker: string, error: string}[]): string {
  let text = 'YOUR DAILY SEC FILINGS DIGEST\n\n';
  text += 'Hello,\n\n';
  text += `Here's a summary of the latest ${summaries.length} SEC filing${summaries.length !== 1 ? 's' : ''} for your tracked companies:\n\n`;
  
  // Group summaries by ticker
  const tickerMap = new Map<string, FilingSummaryResult[]>();
  for (const summary of summaries) {
    if (!tickerMap.has(summary.ticker)) {
      tickerMap.set(summary.ticker, []);
    }
    tickerMap.get(summary.ticker)?.push(summary);
  }
  
  // Generate text for each ticker
  for (const [ticker, tickerSummaries] of tickerMap.entries()) {
    const companyName = tickerSummaries[0]?.companyName || '';
    text += `${ticker} - ${companyName}\n`;
    text += '='.repeat(ticker.length + companyName.length + 3) + '\n';
    
    for (const summary of tickerSummaries) {
      const filingDate = new Date(summary.filingDate).toLocaleDateString();
      text += `${summary.filingType} - ${filingDate}\n`;
      text += `Original Filing: ${summary.filingUrl}\n`;
      
      if (summary.keyPoints && summary.keyPoints.length > 0) {
        text += 'Key Points:\n';
        for (const point of summary.keyPoints) {
          text += `- ${point}\n`;
        }
      }
      
      text += `View Full Summary: ${process.env.NEXT_PUBLIC_APP_URL}/summary/${summary.accessionNumber}\n\n`;
    }
  }
  
  // Add errors if any
  if (errors.length > 0) {
    text += '\nIssues Encountered:\n';
    for (const error of errors) {
      text += `- ${error.ticker}: ${error.error}\n`;
    }
    text += '\n';
  }
  
  // Add footer
  text += '--\n';
  text += 'You received this digest because you\'re subscribed to daily updates from tldrSEC.\n';
  text += `Manage preferences: ${process.env.NEXT_PUBLIC_APP_URL}/settings\n`;
  text += `Unsubscribe: ${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications\n`;
  
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
        .key-points { background-color: #f9f9f9; padding: 10px; border-left: 3px solid #0066cc; }
        .key-points h3 { margin-top: 0; }
        .key-points ul { margin-bottom: 0; }
        .filing-link { display: block; margin-top: 15px; }
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
    
    html += `
      <div class="summary">
        <h2>${summary.companyName} (${summary.ticker}) - ${formName}</h2>
        <div class="meta">Filed on: ${summary.filingDate}</div>
        <p>${summary.summaryText}</p>
        
        <div class="key-points">
          <h3>Key Points</h3>
          <ul>
            ${summary.keyPoints.map(point => `<li>${point}</li>`).join('')}
          </ul>
        </div>
        
        <a href="${summary.filingUrl}" class="filing-link" target="_blank">View Original Filing</a>
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
