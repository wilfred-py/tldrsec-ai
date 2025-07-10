import { Anthropic } from '@anthropic-ai/sdk';
import { logger } from '../../lib/logging';
import { SummaryGenerationResult, SECFiling, Company } from './types';
import { generateFallbackSummary } from './fallbackSummary';
import { normalizeFormType } from './formTypeService';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

/**
 * Generates a prompt for the AI to summarize a filing
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @returns Prompt for the AI
 */
function generateSummaryPrompt(content: string, filing: SECFiling, company: Company): string {
  const companyName = company.name || 'Unknown Company';
  const ticker = company.ticker || '';
  const formType = normalizeFormType(filing.formType || 'UNKNOWN');
  const filingDate = filing.filingDate ? new Date(filing.filingDate).toLocaleDateString() : 'Unknown date';
  
  // Create a prompt for the AI
  let prompt = `You are an expert financial analyst specializing in SEC filings. 
Summarize the following ${formType} filing for ${companyName}${ticker ? ` (${ticker})` : ''} filed on ${filingDate}.

Focus on:
1. Key financial metrics and changes
2. Important business developments
3. Risk factors or warnings
4. Management's outlook and guidance
5. Any unusual or noteworthy items

Format your response as valid JSON with the following structure:
{
  "summary": "A concise 1-2 paragraph overview of the filing",
  "financialHighlights": [
    {"metric": "Revenue", "value": "$X million", "yearOverYearChange": "+/-X%"},
    {"metric": "Net Income", "value": "$X million", "yearOverYearChange": "+/-X%"}
  ],
  "businessHighlights": [
    {"detail": "Key business development 1"},
    {"detail": "Key business development 2"}
  ],
  "riskFactors": [
    {"description": "Risk factor 1"},
    {"description": "Risk factor 2"}
  ],
  "keyTakeaway": "The most important insight from this filing"
}

Here is the filing content:
${content.substring(0, 32000)}`;

  return prompt;
}

/**
 * Generates a summary of a filing using AI
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @returns Summary generation result
 */
export async function generateAISummary(
  content: string, 
  filing: SECFiling, 
  company: Company
): Promise<SummaryGenerationResult> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    
    const formType = normalizeFormType(filing.formType || 'UNKNOWN');
    const prompt = generateSummaryPrompt(content, filing, company);
    
    logger.debug(`Generating AI summary for ${company.ticker || 'unknown'} ${formType} filing`);
    
    // Call the Anthropic API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.2,
      system: 'You are a financial expert specializing in SEC filing analysis. Provide accurate, concise summaries in valid JSON format.',
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    // Extract the response content
    const responseContent = response.content[0].type === 'text' ? response.content[0].text : '';
    
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
      logger.error(`Error parsing AI summary JSON: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to parse AI summary response');
    }
    
    // Extract summary and key points
    const summary = typeof summaryJSON.summary === 'string' ? summaryJSON.summary : 
      `Summary for ${company.name || 'Unknown Company'}${company.ticker ? ` (${company.ticker})` : ''} ${formType} filing`;
    
    // Extract key points from the summary JSON
    let keyPoints: string[] = [];
    
    // Add financial highlights
    if (Array.isArray(summaryJSON.financialHighlights)) {
      const financialHighlights = summaryJSON.financialHighlights as Array<{metric: string, value: string, yearOverYearChange: string}>;
      keyPoints = keyPoints.concat(
        financialHighlights.map(item => `${item.metric}: ${item.value} (${item.yearOverYearChange})`)
      );
    }
    
    // Add business highlights
    if (Array.isArray(summaryJSON.businessHighlights)) {
      const businessHighlights = summaryJSON.businessHighlights as Array<{detail: string}>;
      keyPoints = keyPoints.concat(
        businessHighlights.map(item => item.detail)
      );
    }
    
    // Add risk factors
    if (Array.isArray(summaryJSON.riskFactors)) {
      const riskFactors = summaryJSON.riskFactors as Array<{description: string}>;
      keyPoints = keyPoints.concat(
        riskFactors.map(item => item.description)
      );
    }
    
    // Add key takeaway
    if (typeof summaryJSON.keyTakeaway === 'string') {
      keyPoints.push(summaryJSON.keyTakeaway);
    }
    
    // Filter out empty key points
    keyPoints = keyPoints.filter(Boolean);
    
    // Calculate token usage and cost
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;
    
    // Claude Sonnet 4 pricing: $3 per 1M input tokens, $15 per 1M output tokens
    const inputCost = (inputTokens / 1000000) * 3;
    const outputCost = (outputTokens / 1000000) * 15;
    const totalCost = inputCost + outputCost;
    
    return {
      summary,
      keyPoints,
      tokensUsed: totalTokens,
      inputTokens,
      outputTokens,
      model: 'claude-sonnet-4-20250514',
      cost: totalCost
    };
  } catch (error) {
    logger.error(`Error generating AI summary: ${error instanceof Error ? error.message : String(error)}`);
    
    // Generate a fallback summary
    const fallbackSummary = generateFallbackSummary(filing, company, filing.formType || 'UNKNOWN');
    
    return {
      summary: fallbackSummary,
      keyPoints: [
        `This is a ${filing.formType || 'UNKNOWN'} filing for ${company.name || 'Unknown Company'}${company.ticker ? ` (${company.ticker})` : ''}.`,
        'AI-powered summary generation failed. This is a fallback summary.',
        'Please review the original filing for complete details.'
      ],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Attempts to generate an AI summary with retries
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @param maxRetries Maximum number of retries
 * @returns Summary generation result
 */
export async function generateAISummaryWithRetry(
  content: string, 
  filing: SECFiling, 
  company: Company, 
  maxRetries: number = 2
): Promise<SummaryGenerationResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.info(`Retry attempt ${attempt} for generating AI summary for ${company.ticker || 'unknown'} ${filing.formType || 'UNKNOWN'}`);
      }
      
      return await generateAISummary(content, filing, company);
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
  logger.error(`All ${maxRetries + 1} attempts to generate AI summary failed`);
  
  const fallbackSummary = generateFallbackSummary(filing, company, filing.formType || 'UNKNOWN');
  
  return {
    summary: fallbackSummary,
    keyPoints: [
      `This is a ${filing.formType || 'UNKNOWN'} filing for ${company.name || 'Unknown Company'}${company.ticker ? ` (${company.ticker})` : ''}.`,
      'AI-powered summary generation failed after multiple attempts. This is a fallback summary.',
      'Please review the original filing for complete details.'
    ],
    error: lastError?.message || 'Unknown error during AI summary generation'
  };
}
