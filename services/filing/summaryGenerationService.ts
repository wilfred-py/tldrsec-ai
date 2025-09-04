import { Anthropic } from '@anthropic-ai/sdk';
import { logger } from '../../lib/logging';
import { SummaryGenerationResult, SECFiling, Company } from './types';
import { normalizeFormType } from './formTypeService';

// Circuit breaker state management
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

// Global circuit breaker for AI service
const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: 0,
  state: 'CLOSED'
};

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5, // Open circuit after 5 consecutive failures
  timeoutMs: 30000, // 30 seconds timeout
  recoveryTimeMs: 60000 // 1 minute before attempting recovery
};

// Error classification for intelligent retry
enum ErrorType {
  TRANSIENT = 'TRANSIENT', // Temporary errors that should be retried
  PERMANENT = 'PERMANENT', // Permanent errors that should not be retried
  RATE_LIMIT = 'RATE_LIMIT', // Rate limiting errors with special handling
  AUTHENTICATION = 'AUTHENTICATION', // Auth errors - don't retry
  UNKNOWN = 'UNKNOWN'
}

function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase();
  
  if (message.includes('rate limit') || message.includes('429')) {
    return ErrorType.RATE_LIMIT;
  }
  if (message.includes('authentication') || message.includes('unauthorized') || message.includes('401')) {
    return ErrorType.AUTHENTICATION;
  }
  if (message.includes('timeout') || message.includes('network') || message.includes('connection')) {
    return ErrorType.TRANSIENT;
  }
  if (message.includes('invalid') || message.includes('malformed') || message.includes('400')) {
    return ErrorType.PERMANENT;
  }
  
  return ErrorType.UNKNOWN;
}

function shouldRetry(error: Error, attempt: number, maxRetries: number): boolean {
  const errorType = classifyError(error);
  
  if (attempt >= maxRetries) return false;
  if (errorType === ErrorType.PERMANENT) return false;
  if (errorType === ErrorType.AUTHENTICATION) return false;
  
  return true;
}

function getBackoffDelay(attempt: number, errorType: ErrorType): number {
  let baseDelay = Math.pow(2, attempt) * 1000; // Exponential backoff
  
  // Special handling for rate limits
  if (errorType === ErrorType.RATE_LIMIT) {
    baseDelay = Math.max(baseDelay, 30000); // Minimum 30 seconds for rate limits
  }
  
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 1000;
  return Math.min(baseDelay + jitter, 300000); // Max 5 minutes
}

function updateCircuitBreaker(success: boolean): void {
  const now = Date.now();
  
  if (success) {
    circuitBreaker.failures = 0;
    circuitBreaker.state = 'CLOSED';
  } else {
    circuitBreaker.failures++;
    circuitBreaker.lastFailureTime = now;
    
    if (circuitBreaker.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      circuitBreaker.state = 'OPEN';
      logger.error('Circuit breaker OPENED - AI service calls will be blocked', {
        failures: circuitBreaker.failures,
        threshold: CIRCUIT_BREAKER_CONFIG.failureThreshold
      });
    }
  }
}

function checkCircuitBreaker(): { allowed: boolean; reason?: string } {
  const now = Date.now();
  
  if (circuitBreaker.state === 'CLOSED') {
    return { allowed: true };
  }
  
  if (circuitBreaker.state === 'OPEN') {
    const timeSinceLastFailure = now - circuitBreaker.lastFailureTime;
    
    if (timeSinceLastFailure >= CIRCUIT_BREAKER_CONFIG.recoveryTimeMs) {
      circuitBreaker.state = 'HALF_OPEN';
      logger.info('Circuit breaker entering HALF_OPEN state - allowing test request');
      return { allowed: true };
    }
    
    return { 
      allowed: false, 
      reason: `Circuit breaker OPEN - ${Math.ceil((CIRCUIT_BREAKER_CONFIG.recoveryTimeMs - timeSinceLastFailure) / 1000)}s until retry` 
    };
  }
  
  if (circuitBreaker.state === 'HALF_OPEN') {
    // Allow one request to test if service is healthy
    return { allowed: true };
  }
  
  return { allowed: false, reason: 'Circuit breaker in unknown state' };
}

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
 * Generates a summary of a filing using AI with enhanced retry mechanisms
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
  const correlationId = `ai_summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    // Check circuit breaker before attempting API call
    const circuitCheck = checkCircuitBreaker();
    if (!circuitCheck.allowed) {
      const error = new Error(`Circuit breaker preventing API call: ${circuitCheck.reason}`);
      updateCircuitBreaker(false);
      throw error;
    }
    
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    
    const formType = normalizeFormType(filing.formType || 'UNKNOWN');
    const prompt = generateSummaryPrompt(content, filing, company);
    
    logger.info(`Generating AI summary for ${company.ticker || 'unknown'} ${formType} filing`, {
      correlationId,
      circuitBreakerState: circuitBreaker.state,
      circuitBreakerFailures: circuitBreaker.failures,
      contentLength: content.length
    });
    
    // Call the Anthropic API with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('API call timeout')), CIRCUIT_BREAKER_CONFIG.timeoutMs);
    });
    
    const apiPromise = anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      temperature: 0.2,
      system: 'You are a financial expert specializing in SEC filing analysis. Provide accurate, concise summaries in valid JSON format.',
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    const response = await Promise.race([apiPromise, timeoutPromise]) as Anthropic.Messages.Message;
    
    // Record success in circuit breaker
    updateCircuitBreaker(true);
    
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
      logger.error(`Error parsing AI summary JSON`, {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        responsePreview: responseContent.substring(0, 200)
      });
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
    
    // Claude-3 Opus pricing: $15 per 1M input tokens, $75 per 1M output tokens
    const inputCost = (inputTokens / 1000000) * 15;
    const outputCost = (outputTokens / 1000000) * 75;
    const totalCost = inputCost + outputCost;
    
    logger.info(`AI summary generation completed successfully`, {
      correlationId,
      ticker: company.ticker,
      formType,
      tokensUsed: totalTokens,
      cost: totalCost
    });
    
    return {
      summary,
      keyPoints,
      tokensUsed: totalTokens,
      inputTokens,
      outputTokens,
      model: 'claude-3-opus-20240229',
      cost: totalCost,
      correlationId,
      processingStatus: 'SUCCESS'
    };
  } catch (error) {
    // Record failure in circuit breaker
    updateCircuitBreaker(false);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = classifyError(error instanceof Error ? error : new Error(errorMessage));
    
    logger.error(`AI summary generation failed`, {
      correlationId,
      ticker: company.ticker,
      error: errorMessage,
      errorType,
      circuitBreakerState: circuitBreaker.state
    });
    
    // Return error information instead of throwing - NO FALLBACK SUMMARIES
    return {
      summary: '', // Empty summary indicates failure - no fallback
      keyPoints: [],
      error: `AI summary generation failed: ${errorMessage}`,
      processingStatus: 'FAILED',
      processingError: errorMessage,
      processingErrorCode: error instanceof Error && error.name ? error.name : 'UNKNOWN_ERROR',
      correlationId,
      errorType,
      isRetryable: shouldRetry(error instanceof Error ? error : new Error(errorMessage), 0, 2)
    };
  }
}

/**
 * Attempts to generate an AI summary with intelligent retry mechanisms
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
  maxRetries: number = 3
): Promise<SummaryGenerationResult> {
  const correlationId = `ai_summary_retry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  let lastError: Error | null = null;
  let totalAttempts = 0;
  const startTime = Date.now();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    totalAttempts++;
    
    try {
      if (attempt > 0) {
        logger.info(`Retry attempt ${attempt} for generating AI summary`, {
          correlationId,
          attempt,
          ticker: company.ticker,
          formType: filing.formType,
          totalDuration: Date.now() - startTime
        });
      }
      
      const result = await generateAISummary(content, filing, company);
      
      // If successful, add retry metadata
      if (result.processingStatus === 'SUCCESS') {
        return {
          ...result,
          attempts: totalAttempts,
          totalRetryDuration: Date.now() - startTime,
          correlationId: result.correlationId || correlationId
        };
      } else if (result.error && !result.isRetryable) {
        // If error is not retryable, stop immediately
        logger.warn(`Non-retryable error encountered, stopping retries`, {
          correlationId,
          error: result.error,
          errorType: result.errorType
        });
        return {
          ...result,
          attempts: totalAttempts,
          totalRetryDuration: Date.now() - startTime
        };
      }
      
      // If we got a retryable error, continue to retry logic
      lastError = new Error(result.error || 'Unknown error');
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error should be retried
      if (!shouldRetry(lastError, attempt, maxRetries)) {
        logger.warn(`Error not retryable, stopping attempts`, {
          correlationId,
          error: lastError.message,
          errorType: classifyError(lastError),
          attempt
        });
        break;
      }
    }
    
    // If this is not the last attempt, calculate backoff delay
    if (attempt < maxRetries && lastError) {
      const errorType = classifyError(lastError);
      const backoffDelay = getBackoffDelay(attempt, errorType);
      
      logger.info(`Waiting before retry`, {
        correlationId,
        attempt: attempt + 1,
        maxRetries,
        backoffDelay,
        errorType
      });
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
  
  // All retries failed, return comprehensive error information
  const totalDuration = Date.now() - startTime;
  const errorMessage = lastError?.message || 'Unknown error';
  const errorType = lastError ? classifyError(lastError) : ErrorType.UNKNOWN;
  
  logger.error(`All retry attempts exhausted for AI summary generation`, {
    correlationId,
    ticker: company.ticker,
    totalAttempts,
    totalDuration,
    finalError: errorMessage,
    errorType
  });
  
  // Return comprehensive error information - NO FALLBACK SUMMARIES
  return {
    summary: '', // Empty summary indicates failure - no fallback
    keyPoints: [],
    error: `AI summary generation failed after ${totalAttempts} attempts: ${errorMessage}`,
    processingStatus: 'FAILED',
    processingError: errorMessage,
    processingErrorCode: lastError?.name || 'UNKNOWN_ERROR',
    attempts: totalAttempts,
    totalRetryDuration: totalDuration,
    correlationId,
    errorType,
    isRetryable: false // No more retries possible
  };
}
