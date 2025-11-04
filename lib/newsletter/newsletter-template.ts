import { NewsletterDigest, NewsletterSection, NewsletterItem, FilingItem } from './company-config';

export function generateNewsletterTemplate(digest: NewsletterDigest): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SEC Filing Weekly - ${digest.week}</title>
        <style>
          @media only screen and (max-width: 600px) {
            .container { width: 100% !important; }
            .content { padding: 15px !important; }
            .stats-grid { display: block !important; }
            .stat-item { display: block !important; margin-bottom: 15px !important; }
            .highlight-item { padding: 15px !important; }
            .company-item { padding: 15px !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background-color: #f8fafc;">
        <div class="container" style="max-width: 600px; margin: 0 auto; background: #ffffff;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); color: white; padding: 30px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: bold; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">SEC Filing Weekly</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">${digest.week}</p>
          </div>

          <!-- Stats -->
          <div style="background: #f8fafc; padding: 20px; text-align: center;">
            <div class="stats-grid" style="display: inline-block;">
              <div class="stat-item" style="display: inline-block; margin: 0 20px; vertical-align: top;">
                <div style="font-size: 24px; font-weight: bold; color: #7c3aed;">${digest.totalFilings}</div>
                <div style="font-size: 14px; color: #6b7280;">New Filings</div>
              </div>
              <div class="stat-item" style="display: inline-block; margin: 0 20px; vertical-align: top;">
                <div style="font-size: 24px; font-weight: bold; color: #7c3aed;">${digest.companiesCovered}</div>
                <div style="font-size: 14px; color: #6b7280;">Companies</div>
              </div>
              <div class="stat-item" style="display: inline-block; margin: 0 20px; vertical-align: top;">
                <div style="font-size: 24px; font-weight: bold; color: #7c3aed;">5min</div>
                <div style="font-size: 14px; color: #6b7280;">Read Time</div>
              </div>
            </div>
          </div>

          <!-- Content Sections -->
          ${digest.sections.map(section => renderSection(section)).join('')}

          <!-- Footer -->
          <div style="background: #f8fafc; padding: 30px 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h3 style="margin: 0 0 10px 0; color: #7c3aed; font-size: 20px;">Ready for real-time alerts?</h3>
              <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 16px;">Get instant notifications for any company, access our complete archive, and customize your preferences.</p>
              <a href="https://tldrsec.app/sign-up?utm_source=newsletter&utm_medium=email&utm_campaign=footer_cta" 
                 style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">
                Upgrade to Full Access
              </a>
            </div>
            
            <p style="margin: 0; font-size: 14px; color: #6b7280;">
              You're receiving this because you subscribed to SEC Filing Summaries.
              <br><br>
              <a href="mailto:summaries@tldrsec.app?subject=Unsubscribe" style="color: #7c3aed;">Unsubscribe</a> | 
              <a href="https://tldrsec.app" style="color: #7c3aed;">Visit Website</a> |
              <a href="https://tldrsec.app/dashboard" style="color: #7c3aed;">Dashboard</a>
            </p>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                TLDRSec, Inc. | Making SEC filings simple for investors
                <br>
                Generated on ${new Date(digest.generatedAt).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
          </div>

        </div>
      </body>
    </html>
  `;
}

function renderSection(section: NewsletterSection): string {
  return `
    <div class="content" style="padding: 30px 20px;">
      <h2 style="margin: 0 0 20px 0; font-size: 24px; color: #1f2937; border-bottom: 2px solid #7c3aed; padding-bottom: 10px;">
        ${section.title}
      </h2>
      
      ${section.items.map(item => {
        if (section.title === 'This Week\'s Key Filings') {
          return renderHighlightItem(item);
        } else if (section.title === 'By Company') {
          return renderCompanyItem(item);
        } else {
          return renderUpgradeItem(item);
        }
      }).join('')}
    </div>
  `;
}

function renderHighlightItem(item: NewsletterItem): string {
  const priorityColor = item.priority === 0 ? '#dc2626' : item.priority === 1 ? '#ea580c' : '#7c3aed';
  
  return `
    <div class="highlight-item" style="background: #f9fafb; border-left: 4px solid ${priorityColor}; padding: 20px; margin-bottom: 20px; border-radius: 0 8px 8px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px;">
          <span style="font-weight: bold; color: #1f2937; font-size: 16px;">${item.company}</span>
          <span style="background: #e5e7eb; color: #6b7280; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 10px; white-space: nowrap;">
            ${item.filingType}
          </span>
        </div>
        <div style="text-align: right;">
          <span style="color: #7c3aed; font-weight: bold; font-size: 14px;">${item.symbol}</span>
          ${item.sector ? `<div style="font-size: 12px; color: #6b7280;">${item.sector}</div>` : ''}
        </div>
      </div>
      <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #1f2937; line-height: 1.4;">${item.headline}</h3>
      <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 15px; line-height: 1.5;">${item.summary}</p>
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
        <a href="${item.url}" style="color: #7c3aed; text-decoration: none; font-weight: bold; font-size: 14px;">
          Read Full Summary →
        </a>
        ${item.filedAt ? `<span style="font-size: 12px; color: #9ca3af;">Filed ${new Date(item.filedAt).toLocaleDateString()}</span>` : ''}
      </div>
    </div>
  `;
}

function renderCompanyItem(item: NewsletterItem): string {
  return `
    <div class="company-item" style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap;">
        <div>
          <h3 style="margin: 0; font-size: 18px; color: #1f2937; font-weight: bold;">${item.company}</h3>
          <div style="font-size: 14px; color: #6b7280; margin-top: 2px;">
            ${item.symbol} • ${item.sector}
          </div>
        </div>
      </div>
      
      <div style="space-y: 10px;">
        ${item.filings?.map((filing: FilingItem) => `
          <div style="padding: 12px; background: #f8fafc; border-radius: 6px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
              <span style="background: #7c3aed; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                ${filing.type}
              </span>
              <span style="font-size: 12px; color: #6b7280;">
                ${new Date(filing.filedAt).toLocaleDateString()}
              </span>
            </div>
            <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px; line-height: 1.4;">
              ${filing.summary}
            </p>
            <a href="${filing.url}" style="color: #7c3aed; text-decoration: none; font-size: 13px; font-weight: 500;">
              Read more →
            </a>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderUpgradeItem(item: NewsletterItem): string {
  return `
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); color: white; border-radius: 8px; padding: 25px; margin-bottom: 20px; text-align: center;">
      <h3 style="margin: 0 0 10px 0; font-size: 22px; font-weight: bold;">${item.headline}</h3>
      <p style="margin: 0 0 20px 0; font-size: 16px; opacity: 0.9; line-height: 1.5;">${item.description}</p>
      
      ${item.features ? `
        <div style="text-align: left; margin: 20px 0; padding: 0 20px;">
          <ul style="margin: 0; padding: 0; list-style: none;">
            ${item.features?.map((feature: string) => `
              <li style="margin-bottom: 8px; font-size: 14px;">
                <span style="color: #a5f3fc; margin-right: 8px;">✓</span>
                ${feature}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      
      <a href="${item.url}" 
         style="background: white; color: #7c3aed; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; margin-top: 10px;">
        ${item.cta}
      </a>
    </div>
  `;
}

export function generateTextVersion(digest: NewsletterDigest): string {
  // Plain text version of newsletter for email clients that don't support HTML
  let textContent = `
SEC Filing Weekly - ${digest.week}

This week: ${digest.totalFilings} new filings from ${digest.companiesCovered} companies

`;

  // Add key filings section
  const highlightsSection = digest.sections.find(s => s.title === 'This Week\'s Key Filings');
  if (highlightsSection && highlightsSection.items.length > 0) {
    textContent += `${highlightsSection.title}:\n`;
    textContent += highlightsSection.items.map((item: NewsletterItem) => 
      `• ${item.company} (${item.symbol}): ${item.headline}`
    ).join('\n');
    textContent += '\n\n';
  }

  // Add company section summary
  const companySection = digest.sections.find(s => s.title === 'By Company');
  if (companySection && companySection.items.length > 0) {
    textContent += `Companies with new filings this week:\n`;
    textContent += companySection.items.map((item: NewsletterItem) => 
      `• ${item.company} (${item.symbol}) - ${item.filings?.length || 0} filing${(item.filings?.length || 0) > 1 ? 's' : ''}`
    ).join('\n');
    textContent += '\n\n';
  }

  textContent += `Want real-time alerts? Upgrade at: https://tldrsec.app/sign-up?utm_source=newsletter&utm_medium=email&utm_campaign=text_version

View full newsletter online: https://tldrsec.app/newsletter

---
Unsubscribe: Reply with "UNSUBSCRIBE"
TLDRSec, Inc. | Making SEC filings simple for investors
  `;

  return textContent.trim();
}