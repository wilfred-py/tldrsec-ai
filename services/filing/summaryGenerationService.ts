/**
 * SEC Filing Summary Generation Service with OpenRouter xAI Integration
 * 
 * Provides comprehensive AI-powered summarization of SEC filings using
 * OpenRouter's xAI models with intelligent fallback and retry mechanisms
 */

import { openRouterClient, OpenRouterClient } from '../../lib/ai/openrouter-client';
import { logger } from '../../lib/logging';
import { SummaryGenerationResult, SECFiling, Company } from './types';
import { normalizeFormType } from './formTypeService';
import { generateSecureCorrelationId } from '../../lib/security/secure-random';

// Initialize OpenRouter client for summary generation
const aiClient = openRouterClient;

/**
 * Generates a comprehensive prompt for AI summarization of SEC filings
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @returns Optimized prompt for xAI models
 */
function generateSummaryPrompt(content: string, filing: SECFiling, company: Company): string {
  const companyName = company.name || 'Unknown Company';
  const ticker = company.ticker || '';
  const formType = normalizeFormType(filing.formType || 'UNKNOWN');
  const filingDate = filing.filingDate ? new Date(filing.filingDate).toLocaleDateString() : 'Unknown date';
  
  // Enhanced prompt optimized for xAI models with 2M context window
  const prompt = `You are an expert financial analyst specializing in SEC filings analysis. 
Analyze and summarize the following ${formType} filing for ${companyName}${ticker ? ` (${ticker})` : ''} filed on ${filingDate}.

Your analysis should be comprehensive yet concise, focusing on material information that would be valuable to investors and stakeholders.

Focus on:
1. Key financial metrics, changes, and performance indicators
2. Important business developments, strategic initiatives, and operational changes
3. Material risk factors, legal issues, or regulatory concerns
4. Management's guidance, outlook, and strategic direction
5. Any unusual, noteworthy, or material items that could impact the business
6. Comparative analysis where applicable (year-over-year, quarter-over-quarter)

Format your response as valid JSON with the following structure:
{
  "summary": "A comprehensive 2-3 paragraph overview highlighting the most material aspects of the filing",
  "financialHighlights": [
    {
      "metric": "Revenue", 
      "value": "$X million", 
      "yearOverYearChange": "+/-X%",
      "significance": "Brief explanation of what this means for the business"
    },
    {
      "metric": "Net Income", 
      "value": "$X million", 
      "yearOverYearChange": "+/-X%",
      "significance": "Brief explanation of what this means for the business"
    }
  ],
  "businessHighlights": [
    {
      "category": "Strategic Initiative",
      "detail": "Description of key business development",
      "impact": "Expected impact on the business"
    },
    {
      "category": "Operational Change",
      "detail": "Description of operational development",
      "impact": "Expected impact on the business"
    }
  ],
  "riskFactors": [
    {
      "category": "Market Risk",
      "description": "Description of the risk factor",
      "severity": "High/Medium/Low",
      "mitigation": "Company's approach to managing this risk if mentioned"
    }
  ],
  "managementOutlook": {
    "guidance": "Management's forward-looking statements or guidance",
    "strategy": "Key strategic priorities or initiatives mentioned",
    "concerns": "Any concerns or challenges highlighted by management"
  },
  "keyTakeaway": "The single most important insight or development from this filing that investors should know",
  "investorImpact": "Overall assessment of how this filing might impact the company's investment thesis"
}

IMPORTANT: Ensure all financial figures are accurate and sourced from the filing. If specific metrics are not available, indicate "Not disclosed" rather than estimating. Focus on material information only.

Here is the filing content (utilizing the full 2M token context window for comprehensive analysis):
${content.substring(0, 1800000)}`; // Utilize xAI's 2M token context window

  return prompt;
}

/**
 * Generate AI summary using OpenRouter xAI models with comprehensive error handling
 * @param content Document content to summarize
 * @param filing SEC filing information  
 * @param company Company information
 * @returns Summary generation result with enhanced metadata
 */
export async function generateAISummary(
  content: string, 
  filing: SECFiling, 
  company: Company
): Promise<SummaryGenerationResult> {
  const correlationId = generateSecureCorrelationId('xai_summary');
  const startTime = Date.now();
  
  try {
    const formType = normalizeFormType(filing.formType || 'UNKNOWN');
    const prompt = generateSummaryPrompt(content, filing, company);
    
    // DEBUG: Check environment and client setup
    const apiKey = process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY;
    const model = process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4-fast:free';
    
    logger.info(`[DEBUG] Starting xAI summary generation via OpenRouter`, {
      correlationId,
      ticker: company.ticker,
      formType,
      contentLength: content.length,
      model: model,
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING',
      promptLength: prompt.length,
      aiClientExists: !!aiClient
    });

    // Call OpenRouter with xAI model selection and fallback
    const response = await aiClient.sendMessage(
      [{ role: 'user', content: prompt }],
      {
        model: process.env.DEFAULT_AI_MODEL,
        maxTokens: 4000,
        temperature: 0.1,
        system: 'You are a financial expert specializing in SEC filing analysis. Provide accurate, comprehensive summaries in valid JSON format with detailed insights valuable to investors.',
        requestType: 'standard',
        timeout: parseInt(process.env.AI_SUMMARY_TIMEOUT_MS || '100000', 10), // 100s - must fit within 150s job timeout (leaves ~50s for SEC fetch + DB ops)
        requiredCapabilities: ['reasoning'],
        costLimit: 0.50, // $0.50 maximum per summary for cost control
        remainingExecutionTime: 100000 // 100s - aligned with job timeout constraint
      }
    );

    // Extract and parse the JSON response
    const responseContent = response.content;
    let summaryJSON: Record<string, unknown>;
    
    try {
      // Enhanced JSON extraction for xAI model responses
      const jsonMatch = responseContent.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                        responseContent.match(/({[\s\S]*})/);
      
      if (jsonMatch && jsonMatch[1]) {
        summaryJSON = JSON.parse(jsonMatch[1]);
      } else {
        summaryJSON = JSON.parse(responseContent);
      }
    } catch (parseError) {
      logger.error(`JSON parsing failed for xAI response`, {
        correlationId,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        responsePreview: responseContent.substring(0, 200)
      });
      throw new Error(`Failed to parse AI response JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Extract and structure the summary data
    const summary = typeof summaryJSON.summary === 'string' ? summaryJSON.summary : '';
    const keyTakeaway = typeof summaryJSON.keyTakeaway === 'string' ? summaryJSON.keyTakeaway : '';
    const investorImpact = typeof summaryJSON.investorImpact === 'string' ? summaryJSON.investorImpact : '';
    
    // Build comprehensive key points from structured response
    let keyPoints: string[] = [];
    
    // Add financial highlights
    if (Array.isArray(summaryJSON.financialHighlights)) {
      const financialHighlights = summaryJSON.financialHighlights as Array<{
        metric: string; 
        value: string; 
        yearOverYearChange?: string;
        significance?: string;
      }>;
      keyPoints = keyPoints.concat(
        financialHighlights.map(item => 
          `${item.metric}: ${item.value}${item.yearOverYearChange ? ` (${item.yearOverYearChange})` : ''}${item.significance ? ` - ${item.significance}` : ''}`
        )
      );
    }
    
    // Add business highlights  
    if (Array.isArray(summaryJSON.businessHighlights)) {
      const businessHighlights = summaryJSON.businessHighlights as Array<{
        category?: string;
        detail: string;
        impact?: string;
      }>;
      keyPoints = keyPoints.concat(
        businessHighlights.map(item => 
          `${item.category ? `${item.category}: ` : ''}${item.detail}${item.impact ? ` (Impact: ${item.impact})` : ''}`
        )
      );
    }
    
    // Add risk factors
    if (Array.isArray(summaryJSON.riskFactors)) {
      const riskFactors = summaryJSON.riskFactors as Array<{
        category?: string;
        description: string;
        severity?: string;
      }>;
      keyPoints = keyPoints.concat(
        riskFactors.map(item => 
          `Risk - ${item.category ? `${item.category}: ` : ''}${item.description}${item.severity ? ` (${item.severity} severity)` : ''}`
        )
      );
    }
    
    // Add management outlook
    if (typeof summaryJSON.managementOutlook === 'object' && summaryJSON.managementOutlook) {
      const outlook = summaryJSON.managementOutlook as {
        guidance?: string;
        strategy?: string;
        concerns?: string;
      };
      if (outlook.guidance) keyPoints.push(`Management Guidance: ${outlook.guidance}`);
      if (outlook.strategy) keyPoints.push(`Strategic Priority: ${outlook.strategy}`);
      if (outlook.concerns) keyPoints.push(`Management Concerns: ${outlook.concerns}`);
    }
    
    // Add key takeaway and investor impact
    if (keyTakeaway) keyPoints.push(`Key Takeaway: ${keyTakeaway}`);
    if (investorImpact) keyPoints.push(`Investor Impact: ${investorImpact}`);
    
    // Filter out empty key points
    keyPoints = keyPoints.filter(Boolean);
    
    // Calculate processing metrics
    const executionTime = Date.now() - startTime;
    const inputTokens = response.usage.inputTokens;
    const outputTokens = response.usage.outputTokens;
    const totalTokens = inputTokens + outputTokens;
    const totalCost = response.cost.totalCost;
    
    logger.info(`xAI summary generation completed successfully`, {
      correlationId,
      ticker: company.ticker,
      formType,
      model: response.model,
      tokensUsed: totalTokens,
      cost: totalCost,
      executionTime,
      fallbackUsed: response.fallbackUsed,
      keyPointsCount: keyPoints.length
    });

    return {
      summary,
      keyPoints,
      tokensUsed: totalTokens,
      inputTokens,
      outputTokens,
      model: response.model,
      cost: totalCost,
      correlationId,
      processingStatus: 'SUCCESS',
      processingTime: executionTime,
      modelFallbackUsed: response.fallbackUsed,
      originalModel: response.originalModel
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error(`xAI summary generation failed`, {
      correlationId,
      ticker: company.ticker,
      error: error instanceof Error ? error.message : String(error),
      executionTime
    });
    
    // Return structured error information instead of throwing
    return {
      summary: '', // Empty summary indicates failure
      keyPoints: [],
      error: `xAI summary generation failed: ${error instanceof Error ? error.message : String(error)}`,
      processingStatus: 'FAILED',
      processingError: error instanceof Error ? error.message : String(error),
      processingErrorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      correlationId,
      processingTime: executionTime,
      isRetryable: true // Most xAI/OpenRouter errors are retryable
    };
  }
}

/**
 * Generate AI summary with retry logic for improved reliability
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information  
 * @param maxRetries Maximum number of retry attempts
 * @returns Summary generation result with retry metadata
 */
export async function generateAISummaryWithRetry(
  content: string,
  filing: SECFiling, 
  company: Company,
  maxRetries: number = 1 // Reduced from 2 to 1 to prevent timeout cascading
): Promise<SummaryGenerationResult> {
  let lastError: Error | null = null;
  let attempt = 0;
  
  const correlationId = generateSecureCorrelationId('xai_summary_retry');
  
  while (attempt <= maxRetries) {
    attempt++;
    
    logger.info(`Attempting xAI summary generation (attempt ${attempt}/${maxRetries + 1})`, {
      correlationId,
      ticker: company.ticker,
      formType: filing.formType
    });
    
    try {
      const result = await generateAISummary(content, filing, company);
      
      // Check if the result indicates success
      if (result.processingStatus === 'SUCCESS' && result.summary && result.summary.length > 0) {
        if (attempt > 1) {
          logger.info(`xAI summary generation succeeded after ${attempt} attempts`, {
            correlationId,
            ticker: company.ticker,
            totalAttempts: attempt
          });
        }
        
        // Add retry metadata to result
        return {
          ...result,
          retryAttempts: attempt - 1,
          retriesRequired: attempt > 1
        };
      }
      
      // If processing status indicates failure but we should retry
      if (result.isRetryable && attempt <= maxRetries) {
        lastError = new Error(result.processingError || 'AI processing failed');
        logger.warn(`xAI summary generation failed (attempt ${attempt}), retrying...`, {
          correlationId,
          error: result.processingError,
          attemptsRemaining: maxRetries - attempt + 1
        });
        
        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      
      // Return the failed result if not retryable or max retries exceeded
      return {
        ...result,
        retryAttempts: attempt - 1,
        retriesRequired: attempt > 1
      };
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt <= maxRetries) {
        logger.warn(`xAI summary generation attempt ${attempt} failed, retrying...`, {
          correlationId,
          error: lastError.message,
          attemptsRemaining: maxRetries - attempt + 1
        });
        
        // Exponential backoff for retries
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All attempts failed
  logger.error(`All xAI summary generation attempts failed after ${attempt} attempts`, {
    correlationId,
    ticker: company.ticker,
    finalError: lastError?.message
  });
  
  return {
    summary: '',
    keyPoints: [],
    error: `All retry attempts failed: ${lastError?.message || 'Unknown error'}`,
    processingStatus: 'FAILED',
    processingError: lastError?.message || 'Unknown error',
    processingErrorCode: lastError?.name || 'RETRY_EXHAUSTED',
    correlationId,
    retryAttempts: maxRetries,
    retriesRequired: true,
    isRetryable: false // Don't retry further after exhausting all attempts
  };
}

/**
 * Validate summary generation result for quality assurance
 * @param result Summary generation result to validate
 * @returns Validation status and quality metrics
 */
export function validateSummaryResult(result: SummaryGenerationResult): {
  isValid: boolean;
  qualityScore: number;
  issues: string[];
} {
  const issues: string[] = [];
  let qualityScore = 100;
  
  // Check for basic completeness
  if (!result.summary || result.summary.length < 100) {
    issues.push('Summary too short or missing');
    qualityScore -= 30;
  }
  
  if (!result.keyPoints || result.keyPoints.length < 3) {
    issues.push('Insufficient key points extracted');
    qualityScore -= 20;
  }
  
  // Check token usage (should be in 4K-150K range for valid summaries)
  if (result.tokensUsed && (result.tokensUsed < 4000 || result.tokensUsed > 150000)) {
    if (result.tokensUsed < 4000) {
      issues.push(`Token usage too low (${result.tokensUsed}) - may indicate processing failure`);
      qualityScore -= 40;
    }
  }
  
  // Check cost effectiveness (should be around $0.05 per summary based on business model)
  if (result.cost && result.cost > 0.10) {
    issues.push(`Cost higher than expected ($${result.cost.toFixed(3)}) - review model selection`);
    qualityScore -= 10;
  }
  
  const isValid = issues.length === 0 && qualityScore >= 70;
  
  return {
    isValid,
    qualityScore: Math.max(0, qualityScore),
    issues
  };
}