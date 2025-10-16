/**
 * Enhanced SEC Filing Summary Generation Service with OpenRouter xAI Integration
 * 
 * Provides improved functions for generating comprehensive SEC filing summaries
 * using OpenRouter's xAI models with comprehensive error handling and retry logic
 */

import { openRouterClient, OpenRouterClient } from '../../lib/ai/openrouter-client';
import { logger } from '../../lib/logging';
import { SummaryGenerationResult, SECFiling, Company } from './types';
import { normalizeFormType } from './formTypeService';
import { RetryWrapper, ErrorType } from '../../lib/resilience/retry-utility';
import { generateSecureCorrelationId } from '../../lib/security/secure-random';
import { CircuitBreakerRegistry, CIRCUIT_BREAKER_CONFIGS } from '../../lib/resilience/circuit-breaker';
import { 
  ExternalServiceError, 
  TimeoutError, 
  RateLimitError,
  ErrorClassifier,
  GlobalErrorHandler
} from '../../lib/resilience/error-handling';

// Initialize OpenRouter client for enhanced summary generation
const aiClient = openRouterClient;

// Initialize circuit breaker for OpenRouter API
const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();
const openRouterCircuitBreaker = circuitBreakerRegistry.getCircuitBreaker(CIRCUIT_BREAKER_CONFIGS.ANTHROPIC_API); // Reuse config

// Global error handler instance
const errorHandler = GlobalErrorHandler.getInstance();

// Default AI model to use (configurable via environment variable)
const DEFAULT_MODEL = process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4-fast-reasoning';

/**
 * Generates an optimized prompt for xAI models to analyze SEC filings
 * @param content Document content to summarize
 * @param filing SEC filing information
 * @param company Company information
 * @returns Enhanced prompt optimized for xAI 2M context window
 */
function generateEnhancedSummaryPrompt(content: string, filing: SECFiling, company: Company): string {
  const companyName = company.name || 'Unknown Company';
  const ticker = company.ticker || '';
  const formType = normalizeFormType(filing.formType || 'UNKNOWN');
  const filingDate = filing.filingDate ? new Date(filing.filingDate).toLocaleDateString() : 'Unknown date';
  
  // Enhanced prompt optimized for xAI models with 2M token context window
  const prompt = `You are an expert financial analyst specializing in SEC filings analysis. 
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

Here is the filing content (utilizing the full 2M token context window for comprehensive analysis):
${content.substring(0, 1800000)}`; // Utilize xAI's 2M token context window

  return prompt;
}

/**
 * Generates an enhanced summary of a filing using OpenRouter xAI models with comprehensive retry and circuit breaker protection
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
  const correlationId = generateSecureCorrelationId('xai_enhanced_summary');
  const context = {
    correlationId,
    operation: 'enhanced-xai-summary',
    service: 'openrouter-xai',
    metadata: {
      ticker: company.ticker,
      formType: filing.formType,
      contentLength: content.length,
      model: DEFAULT_MODEL
    }
  };

  try {
    if (!process.env.TLDRSEC_AI_SUMMARIZER && !process.env.OPENROUTER_API_KEY) {
      const configError = new ExternalServiceError('OpenRouter API key not set', context, 'CONFIG_ERROR');
      throw errorHandler.handleError(configError, context);
    }
    
    const formType = normalizeFormType(filing.formType || 'UNKNOWN');
    const prompt = generateEnhancedSummaryPrompt(content, filing, company);
    
    logger.info(`Starting enhanced xAI summary generation via OpenRouter`, {
      correlationId,
      ticker: company.ticker,
      formType,
      model: DEFAULT_MODEL,
      contentLength: content.length
    });
    
    // Execute AI API call through circuit breaker and retry logic
    const aiOperation = async () => {
      return await openRouterCircuitBreaker.execute(async () => {
        try {
          const response = await aiClient.sendMessage(
            [{ role: 'user', content: prompt }],
            {
              model: DEFAULT_MODEL,
              maxTokens: 4000,
              temperature: 0.1,
              system: 'You are a financial expert specializing in SEC filing analysis. Provide accurate, comprehensive summaries in valid JSON format with detailed insights that would be valuable to investors.',
              requestType: 'premium', // Enhanced summaries are premium
              timeout: 180000, // 3 minutes for enhanced analysis
              requiredCapabilities: ['reasoning'],
              costLimit: 0.75 // $0.75 maximum per enhanced summary for cost control
            }
          );
          
          return response;
        } catch (error) {
          // Transform OpenRouter API errors into structured errors
          const structuredError = transformOpenRouterError(error, context);
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
    logger.info(`xAI API call successful`, {
      correlationId,
      attempts: retryResult.attempts,
      duration: retryResult.totalDuration,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      model: response.model,
      fallbackUsed: response.fallbackUsed
    });
    
    // Extract the response content
    const responseContent = response.content;
    
    // Parse the JSON response with enhanced error handling
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
    } catch (error) {
      const parseError = new ExternalServiceError(
        'Failed to parse xAI enhanced summary response JSON',
        { ...context, responseContent: responseContent.substring(0, 500) },
        'JSON_PARSE_ERROR'
      );
      logger.error(`xAI JSON parsing failed`, {
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
    
    // Calculate token usage and cost (already calculated by OpenRouter client)
    const inputTokens = response.usage.inputTokens;
    const outputTokens = response.usage.outputTokens;
    const totalTokens = inputTokens + outputTokens;
    const totalCost = response.cost.totalCost;
    
    logger.info(`Enhanced xAI summary generation completed successfully`, {
      correlationId,
      ticker: company.ticker,
      formType,
      model: response.model,
      tokensUsed: totalTokens,
      cost: totalCost,
      attempts: retryResult.attempts,
      duration: retryResult.totalDuration,
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
      processingTime: retryResult.totalDuration,
      modelFallbackUsed: response.fallbackUsed,
      originalModel: response.originalModel
    };
  } catch (error) {
    const structuredError = errorHandler.handleError(error instanceof Error ? error : new Error(String(error)), context);
    
    logger.error(`Enhanced xAI summary generation failed completely`, {
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
      error: `Enhanced xAI summary generation failed: ${structuredError.message}`,
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
 * Transform OpenRouter API errors into structured errors
 */
function transformOpenRouterError(error: any, context: any): Error {
  const message = error?.message || error?.toString() || 'Unknown OpenRouter API error';
  
  // Check for specific OpenRouter/xAI error types
  if (error?.status === 401 || message.includes('authentication') || message.includes('unauthorized')) {
    return new ExternalServiceError('OpenRouter API authentication failed', context, 'AUTH_ERROR', false, false);
  }
  
  if (error?.status === 429 || message.includes('rate limit')) {
    return new RateLimitError('OpenRouter API rate limit exceeded', context, 'RATE_LIMIT');
  }
  
  if (error?.status >= 500 || message.includes('server error') || message.includes('unavailable')) {
    return new ExternalServiceError('OpenRouter API server error', context, 'SERVER_ERROR', true, true);
  }
  
  if (error?.status === 400 || message.includes('bad request')) {
    return new ExternalServiceError('OpenRouter API bad request', context, 'BAD_REQUEST', false, false);
  }
  
  if (message.includes('context window') || message.includes('token limit')) {
    return new ExternalServiceError('OpenRouter API context window exceeded', context, 'CONTEXT_WINDOW_ERROR', false, false);
  }
  
  if (message.includes('content policy') || message.includes('filtered')) {
    return new ExternalServiceError('OpenRouter API content filtered', context, 'CONTENT_FILTERED', false, false);
  }
  
  if (message.includes('timeout') || error?.code === 'ECONNRESET') {
    return new TimeoutError('OpenRouter API timeout', context, 'TIMEOUT');
  }
  
  // Default to retryable external service error
  return new ExternalServiceError(message, context, 'UNKNOWN_API_ERROR', true, true);
}
