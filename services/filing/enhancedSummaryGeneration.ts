/**
 * Enhanced SEC Filing Summary Generation Service
 * 
 * Provides improved functions for generating comprehensive SEC filing summaries
 * using Claude Sonnet 4 with optimized prompts
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { logger } from '../../lib/logging';
import { SummaryGenerationResult, SECFiling, Company } from './types';
import { normalizeFormType } from './formTypeService';
import { RetryWrapper, ErrorType } from '../../lib/resilience/retry-utility';
import { CircuitBreakerRegistry, CIRCUIT_BREAKER_CONFIGS } from '../../lib/resilience/circuit-breaker';
import { 
  ExternalServiceError, 
  TimeoutError, 
  RateLimitError,
  ErrorClassifier,
  GlobalErrorHandler
} from '../../lib/resilience/error-handling';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

// Initialize circuit breaker for Anthropic API
const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();
const anthropicCircuitBreaker = circuitBreakerRegistry.getCircuitBreaker(CIRCUIT_BREAKER_CONFIGS.ANTHROPIC_API);

// Global error handler instance
const errorHandler = GlobalErrorHandler.getInstance();

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
 * Generates an enhanced summary of a filing using Claude Sonnet 4 with comprehensive retry and circuit breaker protection
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
  const correlationId = `ai_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const context = {
    correlationId,
    operation: 'enhanced-ai-summary',
    service: 'anthropic-api',
    metadata: {
      ticker: company.ticker,
      formType: filing.formType,
      contentLength: content.length
    }
  };

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      const configError = new ExternalServiceError('ANTHROPIC_API_KEY not set', context, 'CONFIG_ERROR');
      throw errorHandler.handleError(configError, context);
    }
    
    const formType = normalizeFormType(filing.formType || 'UNKNOWN');
    const prompt = generateEnhancedSummaryPrompt(content, filing, company);
    
    logger.info(`Starting enhanced AI summary generation`, {
      correlationId,
      ticker: company.ticker,
      formType,
      model: CLAUDE_MODEL,
      contentLength: content.length
    });
    
    // Execute AI API call through circuit breaker and retry logic
    const aiOperation = async () => {
      return await anthropicCircuitBreaker.execute(async () => {
        try {
          const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4000,
            temperature: 0.1,
            system: 'You are a financial expert specializing in SEC filing analysis. Provide accurate, comprehensive summaries in valid JSON format with detailed insights that would be valuable to investors.',
            messages: [
              { role: 'user', content: prompt }
            ]
          });
          
          return response;
        } catch (error) {
          // Transform Anthropic API errors into structured errors
          const structuredError = transformAnthropicError(error, context);
          throw structuredError;
        }
      });
    };

    // Execute with retry logic
    const retryResult = await RetryWrapper.retryAIOperation(
      aiOperation,
      'enhanced-summary-generation',
      {
        correlationId,
        retryCondition: (error) => {
          const errorType = ErrorClassifier.classifyError(error);
          return [ErrorType.TRANSIENT, ErrorType.TIMEOUT, ErrorType.RATE_LIMITED, ErrorType.NETWORK].includes(errorType as any);
        },
        onRetry: (attempt, error, delay) => {
          logger.warn(`Retrying AI summary generation`, {
            correlationId,
            attempt,
            error: error.message,
            delay,
            ticker: company.ticker
          });
        }
      }
    );

    if (!retryResult.success || !retryResult.result) {
      const error = retryResult.error || new Error('AI summary generation failed');
      const structuredError = errorHandler.handleError(error, context);
      throw structuredError;
    }

    const response = retryResult.result;
    logger.info(`AI API call successful`, {
      correlationId,
      attempts: retryResult.attempts,
      duration: retryResult.totalDuration,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    });
    
    // Extract the response content
    const responseContent = response.content[0].text;
    
    // Parse the JSON response with enhanced error handling
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
      const parseError = new ExternalServiceError(
        'Failed to parse AI summary response JSON',
        { ...context, responseContent: responseContent.substring(0, 500) },
        'JSON_PARSE_ERROR'
      );
      logger.error(`JSON parsing failed`, {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        responsePreview: responseContent.substring(0, 200)
      });
      throw errorHandler.handleError(parseError, context);
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
    
    logger.info(`Enhanced AI summary generation completed successfully`, {
      correlationId,
      ticker: company.ticker,
      formType,
      tokensUsed: totalTokens,
      cost: totalCost,
      attempts: retryResult.attempts,
      duration: retryResult.totalDuration
    });

    return {
      summary,
      keyPoints,
      tokensUsed: totalTokens,
      inputTokens,
      outputTokens,
      model: CLAUDE_MODEL,
      cost: totalCost,
      correlationId,
      processingStatus: 'SUCCESS'
    };
  } catch (error) {
    const structuredError = errorHandler.handleError(error instanceof Error ? error : new Error(String(error)), context);
    
    logger.error(`Enhanced AI summary generation failed completely`, {
      correlationId,
      ticker: company.ticker,
      error: structuredError.message,
      category: structuredError.category,
      severity: structuredError.severity
    });
    
    // Return structured error information instead of throwing - NO FALLBACK SUMMARIES
    return {
      summary: '', // Empty summary indicates failure - no fallback
      keyPoints: [],
      error: `Enhanced AI summary generation failed: ${structuredError.message}`,
      processingStatus: 'FAILED',
      processingError: structuredError.message,
      processingErrorCode: structuredError.code || structuredError.name,
      correlationId,
      errorCategory: structuredError.category,
      isRetryable: structuredError.isRetryable
    };
  }
}

/**
 * Legacy retry wrapper - now uses the new resilience utilities internally
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @param maxRetries Maximum number of retries (ignored - uses intelligent retry logic)
 * @returns Summary generation result
 */
export async function generateEnhancedAISummaryWithRetry(
  content: string, 
  filing: SECFiling, 
  company: Company, 
  maxRetries: number = 2
): Promise<SummaryGenerationResult> {
  // Delegate to the enhanced function which now includes retry logic
  return generateEnhancedAISummary(content, filing, company);
}

/**
 * Transform Anthropic API errors into structured errors
 */
function transformAnthropicError(error: any, context: any): Error {
  const message = error?.message || error?.toString() || 'Unknown Anthropic API error';
  
  // Check for specific Anthropic error types
  if (error?.status === 401 || message.includes('authentication')) {
    return new ExternalServiceError('Anthropic API authentication failed', context, 'AUTH_ERROR', false, false);
  }
  
  if (error?.status === 429 || message.includes('rate limit')) {
    return new RateLimitError('Anthropic API rate limit exceeded', context, 'RATE_LIMIT');
  }
  
  if (error?.status >= 500 || message.includes('server error')) {
    return new ExternalServiceError('Anthropic API server error', context, 'SERVER_ERROR', true, true);
  }
  
  if (error?.status === 400 || message.includes('bad request')) {
    return new ExternalServiceError('Anthropic API bad request', context, 'BAD_REQUEST', false, false);
  }
  
  if (message.includes('timeout') || error?.code === 'ECONNRESET') {
    return new TimeoutError('Anthropic API timeout', context, 'TIMEOUT');
  }
  
  // Default to retryable external service error
  return new ExternalServiceError(message, context, 'UNKNOWN_API_ERROR', true, true);
}
