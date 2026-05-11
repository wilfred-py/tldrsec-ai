/**
 * SEC Filing Summary Generation Service with OpenRouter xAI Integration
 * 
 * Provides comprehensive AI-powered summarization of SEC filings using
 * OpenRouter's xAI models with intelligent fallback and retry mechanisms
 */

import { z } from 'zod';
import { openRouterClient, OpenRouterClient } from '../../lib/ai/openrouter-client';
import { costConfig } from '../../lib/ai/config';
import { logger } from '../../lib/logging';
import { SummaryGenerationResult, SECFiling, Company } from './types';
import { normalizeFormType } from './formTypeService';
import { generateSecureCorrelationId } from '../../lib/security/secure-random';
import { cleanHtmlContent } from '../../lib/parsers/filing-extractor-utils';

const TrancheSchema = z.object({
  amountDisplay: z.string().min(1).max(64),
  currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code'),
  coupon: z.string().max(64).optional(),
  yield: z.string().max(64).optional(),
  maturity: z.string().max(64).optional(),
  spread: z.string().max(64).optional(),
});

const DealTermsSchema = z.object({
  counterparty: z.string().min(1).max(200),
  dealValue: z.string().max(64).optional(),
  consideration: z.string().max(200).optional(),
  closeDate: z.string().max(64).optional(),
  approvals: z.array(z.string().max(100)).max(5).optional(),
  rationale: z.string().max(200).optional(),
});

// Initialize OpenRouter client for summary generation
const aiClient = openRouterClient;

/**
 * Generates a comprehensive prompt for AI summarization of SEC filings
 * Updated with journalist tone - Matt Levine style, lead with punchline
 *
 * OPTIMIZATION: Cleans HTML content before sending to AI to reduce token usage
 * by ~90% for PDF-converted filings (like 424B2 prospectuses).
 *
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

  // Clean HTML content to remove styling bloat, inline CSS, and PDF-to-HTML artifacts
  // This dramatically reduces token usage (90%+ savings for 424B2 and similar forms)
  const rawContentLength = content.length;
  const cleanedContent = cleanHtmlContent(content);
  const cleanedContentLength = cleanedContent.length;

  // Log the cleaning effectiveness for monitoring
  const reductionPercent = rawContentLength > 0
    ? ((1 - cleanedContentLength / rawContentLength) * 100).toFixed(1)
    : '0';

  logger.debug(`Content cleaning for ${formType}`, {
    ticker,
    rawLength: rawContentLength,
    cleanedLength: cleanedContentLength,
    reductionPercent: `${reductionPercent}%`
  });

  // Journalist-tone prompt optimized for xAI models with 2M context window
  const prompt = `You are a sharp financial journalist writing for sophisticated investors who value wit, precision, and zero bullshit.

Analyze this ${formType} filing for ${companyName}${ticker ? ` (${ticker})` : ''} filed on ${filingDate}.

YOUR WRITING STYLE:
- Lead with the punchline: Most important number/fact in the first sentence
- Hyper-specific: "$2.04M at $340/share" not "significant value"
- Active voice: "Bezos dumped $3B" not "shares were disposed of"
- Causal connections: "AWS growth slowed AS Azure grabbed share"
- Risk translation: "Tariffs could cut margins 5 points" not "trade policy concerns"
- No corporate-speak: "Sales" not "revenue generation", "profit" not "profitability metrics"
- Conversational asides: "Not exactly a vote of confidence, but..."
- Concise: If you can say it in 8 words instead of 15, do it
- Zero margin for error: Every number must come directly from the filing

Write for someone who manages $50M and reads 20 of these per week. They want the story, not the boilerplate.

FOCUS ON:
1. The ONE metric that tells this filing's story (lead with it!)
2. What actually changed and WHY (not just "increased revenue")
3. Which segment won/lost (with specific numbers)
4. Real risks (translated to impact: "could cut margins 5 points")
5. Noteworthy patterns or red flags
6. YoY and sequential comparisons where applicable

Format your response as valid JSON with the following structure:
{
  "summary": "2-3 punchy paragraphs. Lead with impact: 'Tesla hit $97B in revenue (up 19%), but the real story is margins: they finally cracked 9% operating margin.' Use active voice, specific numbers, and conversational tone.",
  "financialHighlights": [
    {
      "metric": "Revenue",
      "value": "$97B",
      "yearOverYearChange": "+19%",
      "significance": "One-liner with context: 'Best quarter since 2019' or 'Third straight quarter of deceleration'"
    }
  ],
  "businessHighlights": [
    {
      "category": "Segment Winner",
      "detail": "Energy storage was the breakout star—$6B revenue, up 54%",
      "impact": "Now 6% of total revenue, up from 4% last year"
    }
  ],
  "riskFactors": [
    {
      "category": "Competition",
      "description": "Azure gaining share in enterprise cloud—third straight quarter of market share loss",
      "severity": "High",
      "mitigation": "Cutting prices 15% on core compute"
    }
  ],
  "managementOutlook": {
    "guidance": "Raised FY revenue guide by $500M to $102B—confidence despite margin pressure",
    "strategy": "Doubling down on AI infrastructure: $10B capex planned",
    "concerns": "Flagged inventory risks—4.2 months vs 3.5 target"
  },
  "keyTakeaway": "The single most important insight that moves the stock. Be specific and direct.",
  "investorImpact": "Bull/bear case in one sentence: 'Revenue acceleration supports the growth thesis, but margin compression suggests pricing power erosion.'"
}

TONE EXAMPLES:
✅ "Tesla hit $97B in revenue (up 19%), but the real story is margins: they finally cracked 9% operating margin."
❌ "Tesla, Inc.'s fiscal year 2024 10-K filing reveals revenue of $96.77 billion, representing year-over-year growth."

✅ "Energy storage was the breakout star—$6B revenue, up 54%—while automotive chugged along."
❌ "The Energy Generation and Storage segment demonstrated strong performance with substantial revenue growth."

✅ "Taneja cashed out $2M worth of Tesla stock, cutting his direct holdings by 63%."
❌ "Vaibhav Taneja executed a series of stock option exercises resulting in the acquisition of shares."

IMPORTANT: Every number must be verifiable from the filing. If specific metrics are not available, indicate "Not disclosed" rather than estimating.

Here is the filing content:
${cleanedContent.substring(0, 500000)}`;

  return prompt;
}

/**
 * Generate AI summary using OpenRouter xAI models with comprehensive error handling
 * @param content Document content to summarize
 * @param filing SEC filing information  
 * @param company Company information
 * @returns Summary generation result with enhanced metadata
 */
export interface GenerationOptions {
  temperature?: number;
}

export async function generateAISummary(
  content: string,
  filing: SECFiling,
  company: Company,
  options?: GenerationOptions
): Promise<SummaryGenerationResult> {
  const correlationId = generateSecureCorrelationId('xai_summary');
  const startTime = Date.now();
  
  try {
    const formType = normalizeFormType(filing.formType || 'UNKNOWN');
    const prompt = generateSummaryPrompt(content, filing, company);
    
    // DEBUG: Check environment and client setup
    const apiKey = process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY;
    const model = process.env.DEFAULT_AI_MODEL || 'x-ai/grok-4.3';
    
    logger.info(`[DEBUG] Starting xAI summary generation via OpenRouter`, {
      correlationId,
      ticker: company.ticker,
      formType,
      rawContentLength: content.length,
      promptLength: prompt.length,
      model: model,
      hasApiKey: !!apiKey,
      hasApiKeyConfigured: !!apiKey,
      aiClientExists: !!aiClient
    });

    // Call OpenRouter with xAI model selection and fallback
    const response = await aiClient.sendMessage(
      [{ role: 'user', content: prompt }],
      {
        model: process.env.DEFAULT_AI_MODEL,
        maxTokens: 4000,
        temperature: options?.temperature ?? 0.1,
        system: 'You are a sharp financial journalist writing for sophisticated investors. Lead with the punchline, be hyper-specific with numbers, use active voice, and cut the corporate-speak. Provide accurate summaries in valid JSON format with punchy, actionable insights.',
        requestType: 'standard',
        timeout: parseInt(process.env.AI_SUMMARY_TIMEOUT_MS || '100000', 10), // 100s - must fit within 150s job timeout (leaves ~50s for SEC fetch + DB ops)
        requiredCapabilities: ['reasoning'],
        costLimit: costConfig.maxCostPerRequest, // Per-call cap from MAX_COST_PER_REQUEST env var (default $3.00 for grok-4.3)
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

    // 8-K structured field validation: strip invalid tranches/dealTerms, log warnings.
    // Runs once per summary (service-layer) rather than at render-time to avoid log spam.
    if (formType === '8-K') {
      const logPayload = {
        event: '8k_structured_validation',
        filingId: filing.id,
        summaryId: correlationId,
        ticker: company.ticker,
      };
      const itemNumbersRaw = summaryJSON.itemNumbers;
      const has203 = Array.isArray(itemNumbersRaw) && itemNumbersRaw.includes('2.03');
      const has101or201 = Array.isArray(itemNumbersRaw)
        && (itemNumbersRaw.includes('1.01') || itemNumbersRaw.includes('2.01'));

      if (summaryJSON.tranches !== undefined) {
        const trancheResult = z.array(TrancheSchema).max(25).safeParse(summaryJSON.tranches);
        if (!trancheResult.success) {
          logger.warn('8-K tranches failed Zod validation — stripping', {
            ...logPayload,
            issue: 'tranches_invalid',
            zodError: trancheResult.error.issues.slice(0, 3),
          });
          delete summaryJSON.tranches;
        } else {
          summaryJSON.tranches = trancheResult.data;
        }
      }
      if (has203 && (!summaryJSON.tranches || (summaryJSON.tranches as unknown[]).length === 0)) {
        logger.warn('8-K Item 2.03 filing has empty tranches[]', {
          ...logPayload,
          issue: 'tranches_empty_on_203',
        });
      }

      if (summaryJSON.dealTerms !== undefined) {
        const dealResult = DealTermsSchema.safeParse(summaryJSON.dealTerms);
        if (!dealResult.success) {
          logger.warn('8-K dealTerms failed Zod validation — stripping', {
            ...logPayload,
            issue: 'dealTerms_invalid',
            zodError: dealResult.error.issues.slice(0, 3),
          });
          delete summaryJSON.dealTerms;
        } else {
          summaryJSON.dealTerms = dealResult.data;
        }
      }
      if (has101or201 && !summaryJSON.dealTerms) {
        logger.warn('8-K Item 1.01/2.01 filing has no dealTerms', {
          ...logPayload,
          issue: 'dealTerms_missing_on_101_201',
        });
      }
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
      data: summaryJSON,  // Preserve raw structured JSON for email templates and database storage
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
  maxRetries: number = 1, // Reduced from 2 to 1 to prevent timeout cascading
  options?: GenerationOptions
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
      const result = await generateAISummary(content, filing, company, options);
      
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