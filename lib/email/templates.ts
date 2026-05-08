/**
 * Email Templates
 * 
 * Provides standardized, responsive HTML and text templates for various
 * email notification types and SEC filing categories.
 */

import { EmailType, FilingTemplateData } from './types';
import { escapeHtml } from './security-helpers';
import { renderAsync } from '@react-email/render';
import * as SECFilingEmailTemplate from '../../components/email/templates/SECFilingEmailTemplate';
const { default: _SECFilingEmailTemplateComponent } = SECFilingEmailTemplate;
import { markdownToHtml } from '../../components/ui/email/design-system';

// Import minimalist templates for Phase 2 design
import { Form4MinimalistTemplate } from '../../components/ui/email/templates/form4-minimalist-template';
import { Form10KMinimalistTemplate } from '../../components/ui/email/templates/10k-minimalist-template';
import { Form10QMinimalistTemplate } from '../../components/ui/email/templates/10q-minimalist-template';
import { Form8KMinimalistTemplate } from '../../components/ui/email/templates/8k-minimalist-template';
import { Form144MinimalistTemplate } from '../../components/ui/email/templates/form144-minimalist-template';
import { FormDEF14AMinimalistTemplate } from '../../components/ui/email/templates/def14a-minimalist-template';
import { Form11KMinimalistTemplate } from '../../components/ui/email/templates/11k-minimalist-template';
import { FormS1MinimalistTemplate } from '../../components/ui/email/templates/s1-minimalist-template';
import { FormS3MinimalistTemplate } from '../../components/ui/email/templates/s3-minimalist-template';
import { GenericMinimalistTemplate } from '../../components/ui/email/templates/generic-minimalist-template';
import Schedule13DEmailTemplate from '../../components/ui/email/templates/13d-template';
import {
  OnboardingFallbackNoticeTemplate,
  type OnboardingFallbackNoticeData,
} from '../../components/ui/email/templates/onboarding-fallback-notice-template';
import * as React from 'react';

/**
 * Template registry for O(1) lookup - Morning Brew style minimalist templates
 * Each entry pairs a component with a canonical template name used in analytics tags.
 */
type MinimalistTemplateEntry = {
  component: React.ComponentType<{ filing: FilingTemplateData }>;
  name: string;
};

const FORM4_ENTRY: MinimalistTemplateEntry = { component: Form4MinimalistTemplate, name: 'form4_minimalist' };
const FORM10K_ENTRY: MinimalistTemplateEntry = { component: Form10KMinimalistTemplate, name: '10k_minimalist' };
const FORM10Q_ENTRY: MinimalistTemplateEntry = { component: Form10QMinimalistTemplate, name: '10q_minimalist' };
const FORM8K_ENTRY: MinimalistTemplateEntry = { component: Form8KMinimalistTemplate, name: '8k_minimalist' };
const FORM144_ENTRY: MinimalistTemplateEntry = { component: Form144MinimalistTemplate, name: 'form144_minimalist' };
const DEF14A_ENTRY: MinimalistTemplateEntry = { component: FormDEF14AMinimalistTemplate, name: 'def14a_minimalist' };
const FORM11K_ENTRY: MinimalistTemplateEntry = { component: Form11KMinimalistTemplate, name: '11k_minimalist' };
const FORMS1_ENTRY: MinimalistTemplateEntry = { component: FormS1MinimalistTemplate, name: 's1_minimalist' };
const FORMS3_ENTRY: MinimalistTemplateEntry = { component: FormS3MinimalistTemplate, name: 's3_minimalist' };
const GENERIC_ENTRY: MinimalistTemplateEntry = { component: GenericMinimalistTemplate, name: 'generic_minimalist' };
// Legacy 13D template — no layout change per Step 9, but routed here so outbound
// tags carry an accurate `template` value (instead of falling back to generic).
const SCHEDULE13D_ENTRY: MinimalistTemplateEntry = { component: Schedule13DEmailTemplate, name: '13d_legacy' };

const MINIMALIST_TEMPLATE_REGISTRY: Record<string, MinimalistTemplateEntry> = {
  'FORM4': FORM4_ENTRY,
  'FORM 4': FORM4_ENTRY,
  '4': FORM4_ENTRY,
  '10-K': FORM10K_ENTRY,
  '10K': FORM10K_ENTRY,
  '10-Q': FORM10Q_ENTRY,
  '10Q': FORM10Q_ENTRY,
  '8-K': FORM8K_ENTRY,
  '8K': FORM8K_ENTRY,
  'FORM 8-K': FORM8K_ENTRY,
  'FORM8-K': FORM8K_ENTRY,
  '144': FORM144_ENTRY,
  'FORM 144': FORM144_ENTRY,
  'FORM144': FORM144_ENTRY,
  'DEF 14A': DEF14A_ENTRY,
  'FORM DEF 14A': DEF14A_ENTRY,
  '11-K': FORM11K_ENTRY,
  'FORM 11-K': FORM11K_ENTRY,
  'S-1': FORMS1_ENTRY,
  'FORM S-1': FORMS1_ENTRY,
  'S-3': FORMS3_ENTRY,
  'FORM S-3': FORMS3_ENTRY,
  'SCHEDULE 13D': SCHEDULE13D_ENTRY,
  'SCHEDULE13D': SCHEDULE13D_ENTRY,
  '13D': SCHEDULE13D_ENTRY,
  'SC 13D': SCHEDULE13D_ENTRY,
  'SC13D': SCHEDULE13D_ENTRY,
};

function lookupMinimalistEntry(filingType: string): MinimalistTemplateEntry {
  const normalizedType = filingType?.toUpperCase().trim() || '';
  return MINIMALIST_TEMPLATE_REGISTRY[normalizedType] || GENERIC_ENTRY;
}

/**
 * Get the appropriate minimalist template for a filing type
 * Falls back to generic template if no specific template exists
 */
function getMinimalistTemplate(filingType: string): React.ComponentType<{ filing: FilingTemplateData }> {
  return lookupMinimalistEntry(filingType).component;
}

/**
 * Canonical template name for a filing type — used in outbound analytics tags
 * so PostHog events carry the actual template that rendered the email.
 */
export function getMinimalistTemplateName(filingType: string): string {
  return lookupMinimalistEntry(filingType).name;
}

// Helper function to generate plain text version of email
function generatePlainTextEmail(filings: FilingTemplateData[], errors: string[]) {
  let text = '';

  for (const filing of filings) {
    text += `${filing.companyName} (${filing.symbol}) - ${filing.filingType}\n`;
    text += `Filing Date: ${new Date(filing.filingDate).toLocaleDateString()}\n`;
    if (filing.summaryText) {
      text += `Summary: ${filing.summaryText}\n`;
    }
    text += `View Filing: ${filing.filingUrl}\n\n`;
  }

  if (errors.length > 0) {
    text += '\nErrors encountered:\n';
    for (const error of errors) {
      text += `${error}\n`;
    }
  }

  return text;
}

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
 * Base container template for all emails
 * Provides responsive layout and consistent branding
 */
export function baseTemplate(content: string, data: BaseTemplateData): string {
  const year = data.currentYear || new Date().getFullYear();
  const _recipientName = data.recipientName || 'there';
  
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
      background-color: #ffffff;
      text-align: left;
      border-bottom: 1px solid #e6e6e6;
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
      <img src="https://tldrsec.app/images/logo-email.png" alt="tldrSEC" width="120" height="24" style="display:block;width:120px;height:24px;border:0;" class="header-logo">
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
  const formattedDate = new Date(filing.filingDate).toLocaleDateString('en-US', {
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
            ${json.financials.map((f: Record<string, unknown>) => 
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
      // Sentiment badge
      const sentimentBadge = json.sentiment ? `
        <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 8px; ${
          json.sentiment === 'positive' ? 'background-color: #ECFDF5; color: #059669;' :
          json.sentiment === 'negative' ? 'background-color: #FEF2F2; color: #DC2626;' :
          json.sentiment === 'mixed' ? 'background-color: #FFFBEB; color: #D97706;' :
          'background-color: #F3F4F6; color: #6B7280;'
        }">${json.sentiment.toUpperCase()}</span>
      ` : '';

      specificContent = `
        <p><strong>Event:</strong> ${json.eventType || 'N/A'}${sentimentBadge}</p>
        <p><strong>Summary:</strong> ${json.summary || ''}</p>
      `;

      // New keyHighlights section
      if (json.keyHighlights && Array.isArray(json.keyHighlights) && json.keyHighlights.length > 0) {
        keyPoints = `
          <h3>Key Highlights</h3>
          <ul>
            ${json.keyHighlights.map((h: string) => `<li>${h}</li>`).join('')}
          </ul>
        `;
      }

      // Add financial impact, management commentary, forward guidance if available
      let additionalInfo = '';
      if (json.financialImpact) {
        additionalInfo += `<p><strong>Financial Impact:</strong> ${json.financialImpact}</p>`;
      }
      if (json.managementCommentary) {
        additionalInfo += `<p><strong>Management:</strong> "${json.managementCommentary}"</p>`;
      }
      if (json.forwardGuidance) {
        additionalInfo += `<p><strong>Guidance:</strong> ${json.forwardGuidance}</p>`;
      }
      if (additionalInfo) {
        keyPoints += additionalInfo;
      }

      // Legacy support for positiveHighlights/negativeHighlights
      if (json.positiveHighlights || json.negativeHighlights) {
        keyPoints += `
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

${filing.summaryText || 'View the full summary for details.'}

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
 * Template for Form 4 insider trading email
 */
export function form4Template(
  data: BaseTemplateData & { filing: FilingTemplateData }
): { html: string; text: string } {
  const { filing, recipientName } = data;
  const name = recipientName || 'there';
  const formattedDate = new Date(filing.filingDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // HTML content
  const htmlContent = `
    <h1>Insider Transaction – Form 4</h1>
    <p>Hello ${name},</p>
    <p>A new Form 4 filing has been submitted for ${filing.companyName} (${filing.symbol}).</p>

    <div class="card">
      <div class="card-header">
        <span class="filing-type">Form 4</span>
        <span class="filing-date">${formattedDate}</span>
      </div>
      ${filing.summaryText ? `<p>${filing.summaryText}</p>` : ''}
      <p style="margin-top: 15px;">
        <a href="${filing.summaryUrl}" class="button">View Full Summary</a>
      </p>
      <p style="margin-top: 10px;">
        <a href="${filing.filingUrl}">View Original SEC Filing</a>
      </p>
    </div>

    <p>Stay informed with tldrSEC's automated SEC filing summaries.</p>
  `;

  // Plain text content
  const textContent = `
FORM 4 – INSIDER TRANSACTION

Hello ${name},

A new Form 4 filing has been submitted for ${filing.companyName} (${filing.symbol}) on ${formattedDate}.

${filing.summaryText || 'View the full summary for details.'}

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
    text: textContent,
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
      const formattedDate = new Date(filing.filingDate).toLocaleDateString('en-US', {
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
            ${markdownToHtml(String(json.summary || ''))}
          `;
        }
        else if (filing.filingType === 'Form4' || filing.filingType === 'Form 4') {
          htmlContent += `
            <p><strong>Insider:</strong> ${json.filerName || 'N/A'}</p>
            ${markdownToHtml(String(json.summary || ''))}
          `;
        }
      } else if (filing.summaryText) {
        // Convert markdown to HTML for proper rendering
        htmlContent += markdownToHtml(filing.summaryText);
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
      const formattedDate = new Date(filing.filingDate).toLocaleDateString();
      
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
  const { recipientName, selectedTickers, preferencesUrl } = data;
  const name = escapeHtml(recipientName || 'there');
  const tickers = selectedTickers ?? [];
  const count = tickers.length;
  const safeTickers = tickers.map(escapeHtml);
  const noun = count === 1 ? 'company' : 'companies';

  const promise = count > 0
    ? `We'll email you when new filings are posted for ${count} ${noun}.`
    : `We'll email you when new filings are posted for the companies you track.`;

  // HTML Version
  const htmlContent = `
    <h1>Welcome to tldrSEC!</h1>
    <p>Hello ${name},</p>
    <p>${promise} Your first email will arrive the moment a new SEC filing hits.</p>

    ${count > 0 ? `
    <h2>Companies you're tracking</h2>
    <ul>
      ${safeTickers.map(ticker => `<li>${ticker}</li>`).join('')}
    </ul>
    <p>You can add or remove tickers anytime from your dashboard.</p>
    ` : ''}

    <p style="margin-top:25px">
      <a href="https://tldrsec.app/dashboard" class="button">Go to your dashboard</a>
    </p>

    <div style="margin-top:28px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
      <p style="margin:0 0 4px 0;font-size:14px;color:#111827;"><strong>Getting too many?</strong></p>
      <p style="margin:0 0 10px 0;font-size:13px;color:#6b7280;">Switch to a daily digest &mdash; one email per day instead of one per filing.</p>
      <p style="margin:0;">
        <a href="${preferencesUrl}" style="font-size:13px;color:#4f46e5;text-decoration:underline;">Switch to daily digest</a>
      </p>
    </div>

    <p style="margin-top:25px">Questions or feedback? Just reply to this email.</p>
    <p>Welcome aboard!</p>
    <p>The tldrSEC Team</p>
  `;

  // Text Version
  const textContent = `
WELCOME TO TLDRSEC!

Hello ${recipientName || 'there'},

${promise} Your first email will arrive the moment a new SEC filing hits.

${count > 0 ? `
COMPANIES YOU'RE TRACKING
${tickers.map(ticker => `- ${ticker}`).join('\n')}

You can add or remove tickers anytime from your dashboard.
` : ''}

Go to your dashboard: https://tldrsec.app/dashboard

GETTING TOO MANY?
Switch to a daily digest — one email per day instead of one per filing.
Switch to daily digest: ${preferencesUrl}

Questions or feedback? Just reply to this email.

Welcome aboard!
The tldrSEC Team

--
You received this email because you signed up for tldrSEC.
Manage preferences: ${preferencesUrl}
  `.trim();

  return {
    html: baseTemplate(htmlContent, data),
    text: textContent
  };
}

/**
 * Template for quarterly earnings confirmation email
 * Sent when user confirms their portfolio
 */
export function quarterlyEarningsTemplate(
  data: BaseTemplateData & {
    summaries: Array<{
      ticker: string;
      companyName: string;
      filingType: string;
      filingDate: Date;
      filingUrl?: string;
      summaryText?: string;
      summaryJSON?: Record<string, unknown>;
    }>;
    tickerCount: number;
  }
): { html: string; text: string } {
  const { summaries, recipientName, tickerCount } = data;
  const name = recipientName || 'Investor';

  // HTML version
  let htmlContent = `
    <h1>Your Portfolio Quarterly Earnings</h1>
    <p>Hello ${name},</p>
    <p>Thank you for confirming your portfolio! Here are the latest quarterly earnings summaries for your ${tickerCount} tracked ${tickerCount === 1 ? 'company' : 'companies'}:</p>
  `;

  if (summaries.length === 0) {
    htmlContent += `
      <div class="card" style="background-color: #f8f9fa; border-left: 4px solid ${COLORS.primary};">
        <p>No quarterly earnings summaries are available yet for your tracked companies.</p>
        <p>We'll email you as soon as new 10-K or 10-Q filings are processed for your portfolio.</p>
      </div>
    `;
  } else {
    for (const summary of summaries) {
      const formattedDate = new Date(summary.filingDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      htmlContent += `
        <div class="card">
          <div class="card-header">
            <span class="filing-type">${summary.ticker} - ${summary.filingType}</span>
            <span class="filing-date">${formattedDate}</span>
          </div>
          <h3 style="margin: 10px 0 5px 0; color: ${COLORS.secondary};">${summary.companyName}</h3>
      `;

      // Add summary content
      if (summary.summaryJSON) {
        const json = summary.summaryJSON as Record<string, unknown>;
        if (json.period) {
          htmlContent += `<p><strong>Period:</strong> ${json.period}</p>`;
        }
        if (json.insights && Array.isArray(json.insights) && json.insights.length > 0) {
          htmlContent += `
            <h4 style="margin: 15px 0 10px 0;">Key Insights</h4>
            <ul style="margin: 0; padding-left: 20px;">
              ${(json.insights as string[]).slice(0, 3).map((insight: string) => `<li>${insight}</li>`).join('')}
            </ul>
          `;
        }
        if (json.financials && Array.isArray(json.financials) && json.financials.length > 0) {
          htmlContent += `
            <h4 style="margin: 15px 0 10px 0;">Key Financials</h4>
            <ul style="margin: 0; padding-left: 20px;">
              ${(json.financials as Array<{label: string; value: string; growth?: string}>).slice(0, 3).map((f) =>
                `<li><strong>${f.label}:</strong> ${f.value}${f.growth ? ` (${f.growth})` : ''}</li>`
              ).join('')}
            </ul>
          `;
        }
      } else if (summary.summaryText) {
        // Truncate long summaries
        const text = summary.summaryText.length > 400
          ? summary.summaryText.substring(0, 400) + '...'
          : summary.summaryText;
        htmlContent += `<p>${text}</p>`;
      }

      if (summary.filingUrl) {
        htmlContent += `
          <p style="margin-top: 15px;">
            <a href="${summary.filingUrl}">View Original SEC Filing →</a>
          </p>
        `;
      }

      htmlContent += `</div>`;
    }
  }

  htmlContent += `
    <div style="margin-top: 30px; padding: 20px; background-color: #f0f9ff; border-radius: 8px;">
      <h3 style="margin-top: 0; color: ${COLORS.primary};">What's Next?</h3>
      <p style="margin-bottom: 0;">We'll continue monitoring SEC filings for your portfolio and send you real-time alerts when new filings are submitted.</p>
    </div>
  `;

  // Text version
  let textContent = `
YOUR PORTFOLIO QUARTERLY EARNINGS

Hello ${name},

Thank you for confirming your portfolio! Here are the latest quarterly earnings summaries for your ${tickerCount} tracked ${tickerCount === 1 ? 'company' : 'companies'}:

`;

  if (summaries.length === 0) {
    textContent += `No quarterly earnings summaries are available yet for your tracked companies.

We'll email you as soon as new 10-K or 10-Q filings are processed for your portfolio.
`;
  } else {
    for (const summary of summaries) {
      const formattedDate = new Date(summary.filingDate).toLocaleDateString();
      textContent += `
${summary.ticker} - ${summary.companyName}
${summary.filingType} | ${formattedDate}
----------------------------------------
`;
      if (summary.summaryText) {
        const text = summary.summaryText.length > 300
          ? summary.summaryText.substring(0, 300) + '...'
          : summary.summaryText;
        textContent += `${text}\n`;
      }
      if (summary.filingUrl) {
        textContent += `View Filing: ${summary.filingUrl}\n`;
      }
      textContent += '\n';
    }
  }

  textContent += `
WHAT'S NEXT?
We'll continue monitoring SEC filings for your portfolio and send you real-time alerts when new filings are submitted.

--
You received this email because you confirmed your portfolio on tldrSEC.
Manage preferences: ${data.preferencesUrl}
Unsubscribe: ${data.unsubscribeUrl}
`;

  return {
    html: baseTemplate(htmlContent, data),
    text: textContent.trim(),
  };
}

/**
 * Generate an HTML version of a template
 * Updated to use minimalist Morning Brew-style templates for SEC filings
 */
export async function getEmailTemplate(
  templateType: EmailType,
  data: Record<string, unknown>
): Promise<{ html: string; text: string }> {
  switch (templateType) {
    case EmailType.IMMEDIATE: {
      // Use minimalist template based on filing type
      const filing = data.filing as FilingTemplateData;
      const MinimalistTemplate = getMinimalistTemplate(filing?.filingType || '');
      const html = await renderAsync(React.createElement(MinimalistTemplate, { filing }));
      return {
        html,
        text: generatePlainTextEmail([filing], [])
      };
    }
    case EmailType.DIGEST:
      return digestTemplate(data as unknown as Parameters<typeof digestTemplate>[0]);
    case EmailType.WELCOME:
      return welcomeTemplate(data as unknown as Parameters<typeof welcomeTemplate>[0]);
    case EmailType.QUARTERLY_EARNINGS:
      return quarterlyEarningsTemplate(data as unknown as Parameters<typeof quarterlyEarningsTemplate>[0]);
    case EmailType.FORM4: {
      // Use Form 4 minimalist template
      const filing = data.filing as FilingTemplateData;
      const html = await renderAsync(React.createElement(Form4MinimalistTemplate, { filing }));
      return {
        html,
        text: generatePlainTextEmail([filing], [])
      };
    }
    case EmailType.ONBOARDING_FALLBACK_NOTICE: {
      const noticeData = data as unknown as OnboardingFallbackNoticeData;
      const html = await renderAsync(
        React.createElement(OnboardingFallbackNoticeTemplate, { data: noticeData })
      );
      const tickerListText =
        noticeData.trackedTickers && noticeData.trackedTickers.length > 0
          ? noticeData.trackedTickers.join(', ')
          : 'your tracked tickers';
      const text = `Hi ${noticeData.recipientName},\n\nThanks for adding ${tickerListText} to your watchlist. We're monitoring SEC EDGAR for these companies. The next time one of them files (10-K, 10-Q, 8-K, Form 4, or anything material), the summary lands in your inbox within minutes.\n\nFor active companies this happens daily; for less active ones, the first email may be a few days out.\n\nOpen your dashboard: ${noticeData.dashboardUrl}\n`;
      return { html, text };
    }
    case EmailType.FILING_NOTIFICATION: {
      // Create filing object matching minimalist template expected format
      const filing: FilingTemplateData = {
        companyName: data.companyName as string,
        symbol: data.ticker as string,
        filingType: data.filingType as string,
        filingDate: data.filingDate instanceof Date
          ? data.filingDate.toISOString()
          : String(data.filingDate || ''),
        summaryText: data.summary as string,
        filingUrl: data.filingUrl as string,
        summaryData: data.summaryData as FilingTemplateData['summaryData']
      };
      // Use minimalist template based on filing type
      const MinimalistTemplate = getMinimalistTemplate(filing.filingType);
      const html = await renderAsync(React.createElement(MinimalistTemplate, { filing }));
      return {
        html,
        text: generatePlainTextEmail([filing], [])
      };
    }
    default:
      throw new Error(`Template type "${templateType}" not implemented`);
  }
} 