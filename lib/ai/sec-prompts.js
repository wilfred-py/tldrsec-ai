/**
 * SEC filing analysis prompt templates
 * 
 * This module provides specialized prompts for analyzing different types of SEC filings
 * with Claude AI. Each prompt is tailored to extract the most relevant information
 * from specific filing types.
 */

/**
 * Get the appropriate prompt template for a specific filing type
 * 
 * @param {string} filingType - The SEC filing type (e.g., '10-K', '10-Q', '8-K')
 * @param {string} content - The filing content to analyze
 * @returns {string} - The formatted prompt for the AI
 */
export function getPromptForFilingType(filingType, content) {
  // Base prompt that works for any filing type
  const basePrompt = `
    You are an expert financial analyst specializing in SEC filings analysis.
    
    Please analyze the following ${filingType} filing and provide:
    
    1. A concise summary (2-3 sentences)
    2. Key financial metrics mentioned
    3. Important disclosures or material changes
    4. Potential risks identified
    5. Overall sentiment (positive, neutral, negative)
    
    Format your response as structured JSON with the following fields:
    - summary
    - keyMetrics (array)
    - importantDisclosures (array)
    - risks (array)
    - sentiment
    
    Filing content:
    ${content.substring(0, 15000)} // Limit content to avoid token limits
  `;
  
  // Filing-specific prompts
  switch (filingType) {
    case '10-K':
      return `
        ${basePrompt}
        
        For 10-K annual reports, also include:
        - Year-over-year revenue and profit changes
        - Major business segment performance
        - Changes in long-term strategy
        - Executive compensation highlights
        - Audit findings
      `;
      
    case '10-Q':
      return `
        ${basePrompt}
        
        For 10-Q quarterly reports, also include:
        - Quarter-over-quarter changes
        - Seasonal factors affecting results
        - Progress on previously announced initiatives
        - Updated guidance if provided
      `;
      
    case '8-K':
      return `
        ${basePrompt}
        
        For 8-K current reports, focus on:
        - The specific material event being reported
        - Immediate financial impact
        - Management's explanation of the event
        - Market reaction if mentioned
      `;
      
    case 'DEF 14A':
      return `
        ${basePrompt}
        
        For proxy statements, focus on:
        - Board composition changes
        - Executive compensation packages
        - Shareholder proposals
        - Voting recommendations
      `;
      
    case 'S-1':
      return `
        ${basePrompt}
        
        For S-1 registration statements, focus on:
        - Company business model
        - Use of proceeds
        - Risk factors for new investors
        - Competitive landscape
        - Growth strategy
      `;
      
    case 'SD':
      return `
        ${basePrompt}
        
        For specialized disclosure reports, focus on:
        - Conflict minerals disclosure
        - Supply chain ethics
        - Environmental impact reporting
        - Compliance with regulations
      `;
      
    default:
      return basePrompt;
  }
}
