/**
 * Enhanced SEC Filing Summary Generation Service
 * 
 * Provides improved functions for generating comprehensive SEC filing summaries
 * using Claude Sonnet 4 with optimized prompts
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { logger } from '../../lib/logging';
import { SummaryGenerationResult, SECFiling, Company } from './types';
import { generateFallbackSummary } from './fallbackSummary';
import { normalizeFormType } from './formTypeService';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

// Claude model to use (updated to Sonnet 4 per organization standards)
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

/**
 * Generates an optimized prompt for the AI to summarize a filing
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @returns Prompt for the AI
 */
function generateEnhancedSummaryPrompt(content: string, filing: SECFiling, company: Company): string {
  const companyName = company.name || 'Unknown Company';
  const ticker = company.ticker || '';
  const formType = normalizeFormType(filing.formType || 'UNKNOWN');
  const filingDate = filing.filingDate ? new Date(filing.filingDate).toLocaleDateString() : 'Unknown date';
  
  // Create a detailed prompt for the AI
  let prompt = `You are an expert financial analyst specializing in SEC filings analysis. 
Provide a comprehensive analysis of the following ${formType} filing for ${companyName}${ticker ? ` (${ticker})` : ''} filed on ${filingDate}.

Your analysis should be 300-500 words and include:

1. OVERVIEW: A concise introduction summarizing the filing's purpose and key points
2. KEY FINANCIAL DATA: Important metrics, changes from previous periods, and their significance
3. BUSINESS DEVELOPMENTS: Major events, strategic initiatives, acquisitions, or operational changes
4. RISK ASSESSMENT: New or significant risk factors, legal issues, or regulatory concerns
5. MANAGEMENT PERSPECTIVE: Leadership changes, forward guidance, or strategic outlook
6. IMPLICATIONS: What this filing means for investors, the company's future, or the industry

Format your response as valid JSON with the following structure:
{
  "summary": "A comprehensive 300-500 word analysis covering all the aspects mentioned above, formatted with appropriate headings and paragraphs",
  "keyPoints": [
    "Key point 1 - important takeaway from the filing",
    "Key point 2 - another significant insight",
    "Key point 3 - another significant insight",
    "Key point 4 - another significant insight",
    "Key point 5 - another significant insight"
  ],
  "financialMetrics": [
    {"metric": "Revenue", "value": "$X million", "change": "+/-X% YoY", "significance": "Brief interpretation"},
    {"metric": "Net Income", "value": "$X million", "change": "+/-X% YoY", "significance": "Brief interpretation"}
  ],
  "riskFactors": [
    {"category": "Risk category", "description": "Detailed description of the risk"}
  ],
  "conclusion": "A one-sentence overall assessment of what this filing reveals about the company's position and outlook"
}

IMPORTANT: Ensure your summary is detailed, insightful, and provides meaningful analysis rather than just repeating facts from the filing. Focus on implications and context that would be valuable to investors.

Here is the filing content:
${content.substring(0, 32000)}`;

  return prompt;
}

/**
 * Generates an enhanced summary of a filing using Claude Sonnet 4
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @returns Summary generation result
 */
export async function generateEnhancedAISummary(
  content: string, 
  filing: SECFiling, 
  company: Company
): Promise<SummaryGenerationResult> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    
    const formType = normalizeFormType(filing.formType || 'UNKNOWN');
    const prompt = generateEnhancedSummaryPrompt(content, filing, company);
    
    logger.debug(`Generating enhanced AI summary for ${company.ticker || 'unknown'} ${formType} filing using ${CLAUDE_MODEL}`);
    
    // Call the Anthropic API with Claude Sonnet 4
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      temperature: 0.1, // Lower temperature for more consistent outputs
      system: 'You are a financial expert specializing in SEC filing analysis. Provide accurate, comprehensive summaries in valid JSON format with detailed insights that would be valuable to investors.',
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    // Extract the response content
    const responseContent = response.content[0].text;
    
    // Parse the JSON response
    let summaryJSON: Record<string, unknown>;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = responseContent.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                         responseContent.match(/({[\s\S]*})/);
      
      if (jsonMatch && jsonMatch[1]) {
        summaryJSON = JSON.parse(jsonMatch[1]);
      } else {
        summaryJSON = JSON.parse(responseContent);
      }
    } catch (error) {
      logger.error(`Error parsing enhanced AI summary JSON: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to parse enhanced AI summary response');
    }
    
    // Extract summary and key points
    const summary = typeof summaryJSON.summary === 'string' ? summaryJSON.summary : '';
    
    // Extract key points
    let keyPoints: string[] = [];
    
    // Add explicit key points
    if (Array.isArray(summaryJSON.keyPoints)) {
      keyPoints = summaryJSON.keyPoints as string[];
    }
    
    // Add financial metrics
    if (Array.isArray(summaryJSON.financialMetrics)) {
      const financialMetrics = summaryJSON.financialMetrics as Array<{metric: string, value: string, change?: string, significance?: string}>;
      keyPoints = keyPoints.concat(
        financialMetrics.map(item => `${item.metric}: ${item.value}${item.change ? ` (${item.change})` : ''}${item.significance ? ` - ${item.significance}` : ''}`)
      );
    }
    
    // Add risk factors
    if (Array.isArray(summaryJSON.riskFactors)) {
      const riskFactors = summaryJSON.riskFactors as Array<{category?: string, description: string}>;
      keyPoints = keyPoints.concat(
        riskFactors.map(item => `Risk - ${item.category ? `${item.category}: ` : ''}${item.description}`)
      );
    }
    
    // Add conclusion
    if (typeof summaryJSON.conclusion === 'string') {
      keyPoints.push(`Conclusion: ${summaryJSON.conclusion}`);
    }
    
    // Filter out empty key points
    keyPoints = keyPoints.filter(Boolean);
    
    // Calculate token usage and cost
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;
    
    // Claude Sonnet 4 pricing (adjust if needed)
    const inputCost = (inputTokens / 1000000) * 3; // $3 per 1M input tokens
    const outputCost = (outputTokens / 1000000) * 15; // $15 per 1M output tokens
    const totalCost = inputCost + outputCost;
    
    return {
      summary,
      keyPoints,
      tokensUsed: totalTokens,
      inputTokens,
      outputTokens,
      model: CLAUDE_MODEL,
      cost: totalCost
    };
  } catch (error) {
    logger.error(`Error generating enhanced AI summary: ${error instanceof Error ? error.message : String(error)}`);
    
    // Generate a fallback summary
    const fallbackSummary = generateFallbackSummary(filing, company, filing.formType || 'UNKNOWN');
    
    return {
      summary: fallbackSummary,
      keyPoints: [
        `This is a ${filing.formType || 'UNKNOWN'} filing for ${company.name || 'Unknown Company'}${company.ticker ? ` (${company.ticker})` : ''}.`,
        'Enhanced AI-powered summary generation failed. This is a fallback summary.',
        'Please review the original filing for complete details.'
      ],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Attempts to generate an enhanced AI summary with retries
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @param maxRetries Maximum number of retries
 * @returns Summary generation result
 */
export async function generateEnhancedAISummaryWithRetry(
  content: string, 
  filing: SECFiling, 
  company: Company, 
  maxRetries: number = 2
): Promise<SummaryGenerationResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.info(`Retry attempt ${attempt} for generating enhanced AI summary for ${company.ticker || 'unknown'} ${filing.formType || 'UNKNOWN'}`);
      }
      
      return await generateEnhancedAISummary(content, filing, company);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this is the last attempt, don't wait
      if (attempt < maxRetries) {
        // Exponential backoff: 2^attempt * 1000ms (2s, 4s, 8s, etc.)
        const backoffTime = Math.pow(2, attempt) * 1000;
        logger.info(`Waiting ${backoffTime}ms before retry ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }
  
  // If all retries failed, generate a fallback summary
  logger.error(`All ${maxRetries + 1} attempts to generate enhanced AI summary failed`);
  
  const fallbackSummary = generateFallbackSummary(filing, company, filing.formType || 'UNKNOWN');
  
  return {
    summary: fallbackSummary,
    keyPoints: [
      `This is a ${filing.formType || 'UNKNOWN'} filing for ${company.name || 'Unknown Company'}${company.ticker ? ` (${company.ticker})` : ''}.`,
      'Enhanced AI-powered summary generation failed after multiple attempts. This is a fallback summary.',
      'Please review the original filing for complete details.'
    ],
    error: lastError?.message || 'Unknown error during enhanced AI summary generation'
  };
}
