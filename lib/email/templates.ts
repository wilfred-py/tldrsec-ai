/**
 * Email Templates
 * 
 * Provides standardized, responsive HTML and text templates for various
 * email notification types and SEC filing categories.
 */

import { EmailType } from './types';

// Branding colors and styling variables
const COLORS = {
  primary: '#3498db',
  secondary: '#2c3e50',
  accent: '#e74c3c',
  background: '#f9f9f9',
  text: '#333333',
  lightText: '#7f8c8d',
  border: '#dddddd',
  success: '#2ecc71',
  warning: '#f39c12',
  error: '#e74c3c',
};

const FONTS = {
  main: 'Arial, Helvetica, sans-serif',
  heading: 'Arial, Helvetica, sans-serif',
  monospace: 'Courier New, monospace',
};

/**
 * Interface for common template data
 */
export interface BaseTemplateData {
  recipientName?: string;
  recipientEmail: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
  currentYear?: number;
}

/**
 * Filing data for templates
 */
export interface FilingTemplateData {
  symbol: string;
  companyName: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  summaryUrl: string;
  summaryId: string;
  summaryText?: string;
  summaryData?: any;
}

/**
 * Base container template for all emails
 * Provides responsive layout and consistent branding
 */
export function baseTemplate(content: string, data: BaseTemplateData): string {
  const year = data.currentYear || new Date().getFullYear();
  const recipientName = data.recipientName || 'there';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>tldrSEC Update</title>
  <style>
    /* Base styles */
    body {
      margin: 0;
      padding: 0;
      font-family: ${FONTS.main};
      line-height: 1.6;
      color: ${COLORS.text};
      background-color: ${COLORS.background};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    /* Container styling */
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    
    /* Header styling */
    .header {
      padding: 20px;
      background-color: ${COLORS.primary};
      text-align: center;
    }
    
    .header-logo {
      max-height: 50px;
    }
    
    /* Content container */
    .content {
      padding: 30px 20px;
    }
    
    /* Typography */
    h1, h2, h3, h4, h5, h6 {
      font-family: ${FONTS.heading};
      margin-top: 0;
      color: ${COLORS.secondary};
      line-height: 1.3;
    }
    
    h1 {
      font-size: 24px;
      margin-bottom: 20px;
    }
    
    h2 {
      font-size: 20px;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid ${COLORS.border};
    }
    
    h3 {
      font-size: 18px;
      margin-bottom: 10px;
    }
    
    p {
      margin: 0 0 15px;
    }
    
    a {
      color: ${COLORS.primary};
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    /* Button styling */
    .button {
      display: inline-block;
      padding: 10px 20px;
      background-color: ${COLORS.primary};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 4px;
      font-weight: bold;
      text-align: center;
    }
    
    .button:hover {
      background-color: #2980b9;
      text-decoration: none;
    }
    
    /* Card styling for filings */
    .card {
      margin-bottom: 20px;
      padding: 15px;
      border: 1px solid ${COLORS.border};
      border-radius: 4px;
      background-color: #ffffff;
    }
    
    .card-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    
    .filing-type {
      font-weight: bold;
      color: ${COLORS.primary};
    }
    
    .filing-date {
      color: ${COLORS.lightText};
      font-size: 0.9em;
    }
    
    /* Footer styling */
    .footer {
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: ${COLORS.lightText};
      border-top: 1px solid ${COLORS.border};
    }
    
    /* Mobile responsiveness */
    @media screen and (max-width: 600px) {
      .container {
        width: 100% !important;
      }
      
      .content {
        padding: 20px 15px !important;
      }
      
      .button {
        display: block !important;
        width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://tldrsec.com/images/logo-white.png" alt="tldrSEC Logo" class="header-logo">
    </div>
    
    <div class="content">
      ${content}
    </div>
    
    <div class="footer">
      <p>You received this email because you're subscribed to updates from tldrSEC.</p>
      <p>
        <a href="${data.preferencesUrl}">Manage preferences</a> | 
        <a href="${data.unsubscribeUrl}">Unsubscribe</a>
      </p>
      <p>&copy; ${year} tldrSEC. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Template for immediate notification of a single filing
 */
export function immediateNotificationTemplate(
  data: BaseTemplateData & { filing: FilingTemplateData }
): { html: string; text: string } {
  const { filing, recipientName } = data;
  const name = recipientName || 'there';
  const formattedDate = filing.filingDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  
  // Generate filing-type specific content
  let specificContent = '';
  let keyPoints = '';
  
  if (filing.summaryData) {
    const json = filing.summaryData;
    
    if (filing.filingType === '10-K' || filing.filingType === '10-Q') {
      specificContent = `
        <p><strong>Period:</strong> ${json.period || 'N/A'}</p>
      `;
      
      if (json.financials && json.financials.length > 0) {
        specificContent += `
          <h3>Key Financials</h3>
          <ul>
            ${json.financials.map((f: any) => 
              `<li><strong>${f.label}:</strong> ${f.value} ${f.growth ? `(${f.growth})` : ''}</li>`
            ).join('')}
          </ul>
        `;
      }
      
      if (json.insights && json.insights.length > 0) {
        keyPoints = `
          <h3>Key Insights</h3>
          <ul>
            ${json.insights.map((insight: string) => `<li>${insight}</li>`).join('')}
          </ul>
        `;
      }
    } 
    else if (filing.filingType === '8-K') {
      specificContent = `
        <p><strong>Event:</strong> ${json.eventType || 'N/A'}</p>
        <p><strong>Summary:</strong> ${json.summary || ''}</p>
      `;
      
      if (json.positiveHighlights || json.negativeHighlights) {
        keyPoints = `
          <h3>Analysis</h3>
          ${json.positiveHighlights ? `<p><strong>Positive:</strong> ${json.positiveHighlights}</p>` : ''}
          ${json.negativeHighlights ? `<p><strong>Potential concerns:</strong> ${json.negativeHighlights}</p>` : ''}
        `;
      }
    } 
    else if (filing.filingType === 'Form4') {
      specificContent = `
        <p><strong>Insider:</strong> ${json.filerName || 'N/A'} (${json.relationship || 'Insider'})</p>
        <p><strong>Transaction:</strong> ${json.summary || ''}</p>
      `;
      
      if (json.totalValue || json.percentageChange) {
        keyPoints = `
          <h3>Details</h3>
          ${json.totalValue ? `<p><strong>Value:</strong> ${json.totalValue}</p>` : ''}
          ${json.percentageChange ? `<p><strong>Ownership change:</strong> ${json.percentageChange}</p>` : ''}
          ${json.newStake ? `<p><strong>New stake:</strong> ${json.newStake}</p>` : ''}
        `;
      }
    }
  } else if (filing.summaryText) {
    // Fallback to plain text summary
    specificContent = `<p>${filing.summaryText}</p>`;
  }
  
  // HTML Version
  const htmlContent = `
    <h1>New ${filing.filingType} for ${filing.symbol}</h1>
    <p>Hello ${name},</p>
    <p>A new ${filing.filingType} filing has been submitted for ${filing.companyName} (${filing.symbol}).</p>
    
    <div class="card">
      <div class="card-header">
        <span class="filing-type">${filing.filingType}</span>
        <span class="filing-date">${formattedDate}</span>
      </div>
      
      ${specificContent}
      ${keyPoints}
      
      <p>
        <a href="${filing.summaryUrl}" class="button">View Full Summary</a>
      </p>
      <p style="margin-top: 15px;">
        <a href="${filing.filingUrl}">View Original SEC Filing</a>
      </p>
    </div>
    
    <p>Stay informed with tldrSEC's automated SEC filing summaries.</p>
  `;
  
  // Plain Text Version
  const textContent = `
NEW ${filing.filingType} FOR ${filing.symbol}

Hello ${name},

A new ${filing.filingType} filing has been submitted for ${filing.companyName} (${filing.symbol}).

Filing Type: ${filing.filingType}
Filing Date: ${formattedDate}

${filing.summaryText ? filing.summaryText.substring(0, 300) + '...' : 'View the full summary for details.'}

View Full Summary: ${filing.summaryUrl}
View Original SEC Filing: ${filing.filingUrl}

Stay informed with tldrSEC's automated SEC filing summaries.

--
You received this email because you're subscribed to updates from tldrSEC.
Manage preferences: ${data.preferencesUrl}
Unsubscribe: ${data.unsubscribeUrl}
  `.trim();
  
  return {
    html: baseTemplate(htmlContent, data),
    text: textContent
  };
}

/**
 * Template for daily digest email
 */
export function digestTemplate(
  data: BaseTemplateData & { 
    tickerGroups: Array<{
      symbol: string;
      companyName: string;
      filings: FilingTemplateData[];
    }> 
  }
): { html: string; text: string } {
  const { tickerGroups, recipientName } = data;
  const name = recipientName || 'there';
  
  // Calculate total filings
  const totalFilings = tickerGroups.reduce(
    (sum, group) => sum + group.filings.length, 
    0
  );
  
  // HTML version
  let htmlContent = `
    <h1>Your Daily SEC Filings Digest</h1>
    <p>Hello ${name},</p>
    <p>Here's a summary of the latest ${totalFilings} SEC ${totalFilings === 1 ? 'filing' : 'filings'} for your tracked companies:</p>
  `;
  
  // Add ticker sections
  for (const group of tickerGroups) {
    htmlContent += `
      <h2>${group.symbol} - ${group.companyName}</h2>
    `;
    
    // Add filings for this ticker
    for (const filing of group.filings) {
      const formattedDate = filing.filingDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      htmlContent += `
        <div class="card">
          <div class="card-header">
            <span class="filing-type">${filing.filingType}</span>
            <span class="filing-date">${formattedDate}</span>
          </div>
      `;
      
      // Add filing content based on type
      if (filing.summaryData) {
        const json = filing.summaryData;
        
        if (filing.filingType === '10-K' || filing.filingType === '10-Q') {
          htmlContent += `
            <p><strong>Period:</strong> ${json.period || 'N/A'}</p>
          `;
          
          if (json.insights && json.insights.length > 0) {
            htmlContent += `
              <p><strong>Key Insight:</strong> ${json.insights[0]}</p>
            `;
          }
        } 
        else if (filing.filingType === '8-K') {
          htmlContent += `
            <p><strong>Event:</strong> ${json.eventType || 'N/A'}</p>
            <p>${json.summary || ''}</p>
          `;
        } 
        else if (filing.filingType === 'Form4') {
          htmlContent += `
            <p><strong>Insider:</strong> ${json.filerName || 'N/A'}</p>
            <p>${json.summary || ''}</p>
          `;
        }
      } else if (filing.summaryText) {
        // Fallback to plain text summary (truncated)
        const snippet = filing.summaryText.substring(0, 150) + 
          (filing.summaryText.length > 150 ? '...' : '');
        htmlContent += `<p>${snippet}</p>`;
      }
      
      htmlContent += `
          <p><a href="${filing.summaryUrl}">View Full Summary</a></p>
          <p><a href="${filing.filingUrl}">View Original Filing</a></p>
        </div>
      `;
    }
  }
  
  // Text version
  let textContent = `
YOUR DAILY SEC FILINGS DIGEST

Hello ${name},

Here's a summary of the latest ${totalFilings} SEC ${totalFilings === 1 ? 'filing' : 'filings'} for your tracked companies:

`;
  
  // Add ticker sections
  for (const group of tickerGroups) {
    textContent += `
${group.symbol} - ${group.companyName}
${'='.repeat(group.symbol.length + group.companyName.length + 3)}

`;
    
    // Add summaries for this ticker
    for (const filing of group.filings) {
      const formattedDate = filing.filingDate.toLocaleDateString();
      
      textContent += `
${filing.filingType} - ${formattedDate}
Original Filing: ${filing.filingUrl}
`;
      
      // Add summary content based on filing type and available data
      if (filing.summaryData) {
        const json = filing.summaryData;
        
        if (filing.filingType === '10-K' || filing.filingType === '10-Q') {
          textContent += `Period: ${json.period || 'N/A'}\n`;
          
          if (json.insights && json.insights.length > 0) {
            textContent += `Key Insight: ${json.insights[0]}\n`;
          }
        } else if (filing.filingType === '8-K') {
          textContent += `Event: ${json.eventType || 'N/A'}\n`;
          textContent += `${json.summary || ''}\n`;
        } else if (filing.filingType === 'Form4') {
          textContent += `Insider: ${json.filerName || 'N/A'}\n`;
          textContent += `${json.summary || ''}\n`;
        }
      } else if (filing.summaryText) {
        // Fallback to plain text summary (truncated)
        const snippet = filing.summaryText.substring(0, 150) + 
          (filing.summaryText.length > 150 ? '...' : '');
        textContent += `${snippet}\n`;
      }
      
      textContent += `View Full Summary: ${filing.summaryUrl}\n\n`;
    }
  }
  
  textContent += `
--
You received this digest because you're subscribed to daily updates from tldrSEC.
Manage preferences: ${data.preferencesUrl}
Unsubscribe: ${data.unsubscribeUrl}
`;
  
  return {
    html: baseTemplate(htmlContent, data),
    text: textContent
  };
}

/**
 * Template for welcome email
 */
export function welcomeTemplate(
  data: BaseTemplateData & { 
    selectedTickers?: string[] 
  }
): { html: string; text: string } {
  const { recipientName, selectedTickers } = data;
  const name = recipientName || 'there';
  
  // HTML Version
  const htmlContent = `
    <h1>Welcome to tldrSEC!</h1>
    <p>Hello ${name},</p>
    <p>Thank you for signing up for tldrSEC. We're excited to help you stay informed about SEC filings for the companies you care about.</p>
    
    ${selectedTickers && selectedTickers.length > 0 ? `
    <h2>Your Selected Tickers</h2>
    <p>You've selected the following tickers to track:</p>
    <ul>
      ${selectedTickers.map(ticker => `<li>${ticker}</li>`).join('')}
    </ul>
    <p>You can add or remove tickers at any time from your dashboard.</p>
    ` : ''}
    
    <h2>Getting Started</h2>
    <p>Here's how to make the most of tldrSEC:</p>
    <ol>
      <li><strong>Add more tickers</strong> - Go to your dashboard to search and add more companies to track.</li>
      <li><strong>Set preferences</strong> - Customize your notification preferences to receive updates how and when you want them.</li>
      <li><strong>Explore summaries</strong> - Browse through our existing collection of AI-generated filing summaries.</li>
    </ol>
    
    <p style="margin-top:25px">
      <a href="https://tldrsec.com/dashboard" class="button">Go to Your Dashboard</a>
    </p>
    
    <p style="margin-top:25px">If you have any questions or feedback, just reply to this email.</p>
    <p>Welcome aboard!</p>
    <p>The tldrSEC Team</p>
  `;
  
  // Text Version
  const textContent = `
WELCOME TO TLDRSEC!

Hello ${name},

Thank you for signing up for tldrSEC. We're excited to help you stay informed about SEC filings for the companies you care about.

${selectedTickers && selectedTickers.length > 0 ? `
YOUR SELECTED TICKERS
You've selected the following tickers to track:
${selectedTickers.map(ticker => `- ${ticker}`).join('\n')}

You can add or remove tickers at any time from your dashboard.
` : ''}

GETTING STARTED
Here's how to make the most of tldrSEC:

1. Add more tickers - Go to your dashboard to search and add more companies to track.
2. Set preferences - Customize your notification preferences to receive updates how and when you want them.
3. Explore summaries - Browse through our existing collection of AI-generated filing summaries.

Go to Your Dashboard: https://tldrsec.com/dashboard

If you have any questions or feedback, just reply to this email.

Welcome aboard!
The tldrSEC Team

--
You received this email because you signed up for tldrSEC.
Manage preferences: ${data.preferencesUrl}
  `.trim();
  
  return {
    html: baseTemplate(htmlContent, data),
    text: textContent
  };
}

/**
 * Generate an HTML version of a template
 */
export function getEmailTemplate(
  templateType: EmailType,
  data: any
): { html: string; text: string } {
  switch (templateType) {
    case EmailType.IMMEDIATE:
      return immediateNotificationTemplate(data);
    case EmailType.DIGEST:
      return digestTemplate(data);
    case EmailType.WELCOME:
      return welcomeTemplate(data);
    default:
      throw new Error(`Template type "${templateType}" not implemented`);
  }
} 