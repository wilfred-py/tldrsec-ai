/**
 * AI-Powered Summary Validation Service
 *
 * Uses the AI model to validate that generated summaries
 * accurately reflect the source SEC filing content.
 *
 * CALIBRATED THRESHOLDS (2025-11-29):
 * - Lowered validation thresholds to reduce false negatives
 * - Added form-specific validation guidance
 * - Focus on material information accuracy rather than completeness
 */

import { openRouterClient } from '../ai/openrouter-client';
import { logger } from '../logging';

const validationLogger = logger.child('summary-content-validator');

/**
 * Form-specific validation guidance for the AI
 */
const FORM_VALIDATION_GUIDANCE: Record<string, string> = {
  '10-K': `For 10-K annual reports, validate:
- Key financial metrics (revenue, net income, assets)
- Business segment descriptions
- Risk factors (major ones mentioned)
- Management discussion highlights
- Do NOT penalize for omitting detailed tables or exhibits`,

  '10-Q': `For 10-Q quarterly reports, validate:
- Quarterly financial performance trends
- Comparison to prior periods
- Material changes noted
- Do NOT penalize for summarizing complex data`,

  '8-K': `For 8-K current reports, validate:
- The main event/announcement is correctly described
- Material facts are accurate
- Do NOT penalize for brevity - 8-Ks are event-focused`,

  '4': `For Form 4 ownership statements, validate:
- Transaction type (buy/sell/grant)
- Share amounts are in correct range
- Insider identity is correct
- Do NOT penalize for simplified descriptions`,

  'DEF 14A': `For Proxy Statements, validate:
- Meeting date/purpose mentioned
- Executive compensation highlights
- Shareholder proposals (if any)
- Do NOT penalize for summarizing lengthy governance details`,

  '13D': `For Schedule 13D filings, validate:
- Beneficial owner identification
- Ownership percentage mentioned
- Purpose of acquisition
- Do NOT penalize for omitting detailed history`,

  'default': `For SEC filings, validate:
- Core facts and figures are accurate
- Material information is captured
- Do NOT penalize for reasonable summarization`
};

export interface SummaryValidationResult {
  isValid: boolean;
  confidenceScore: number; // 0-100
  accuracyScore: number;   // 0-100
  completenessScore: number; // 0-100
  relevanceScore: number;  // 0-100
  issues: string[];
  strengths: string[];
  overallAssessment: string;
  validationDurationMs: number;
}

export interface SummaryValidationInput {
  summaryText: string;
  sourceContent: string;
  ticker: string;
  formType: string;
  companyName: string;
  filingDate: string;
}

/**
 * Validate a summary against its source content using AI
 */
export async function validateSummaryWithAI(
  input: SummaryValidationInput
): Promise<SummaryValidationResult> {
  const startTime = Date.now();

  validationLogger.info('Starting AI summary validation', {
    ticker: input.ticker,
    formType: input.formType,
    summaryLength: input.summaryText.length,
    sourceContentLength: input.sourceContent.length
  });

  // Truncate source content to fit in context window (50k chars ~ 12.5k tokens)
  const truncatedContent = input.sourceContent.substring(0, 50000);

  // Get form-specific guidance
  const normalizedFormType = input.formType.replace(/\/A$/, '').toUpperCase();
  const formGuidance = FORM_VALIDATION_GUIDANCE[normalizedFormType] ||
    FORM_VALIDATION_GUIDANCE[input.formType] ||
    FORM_VALIDATION_GUIDANCE['default'];

  const validationPrompt = `You are a financial analyst quality assurance expert. Your task is to validate that an AI-generated summary accurately represents the source SEC filing.

## Source Filing Information
- Company: ${input.companyName} (${input.ticker})
- Form Type: ${input.formType}
- Filing Date: ${input.filingDate}

## Form-Specific Validation Focus
${formGuidance}

## Source Content (excerpt):
${truncatedContent}

## Generated Summary to Validate:
${input.summaryText}

## Validation Task
Analyze the summary and provide a JSON response with the following structure:
{
  "isValid": true/false,
  "confidenceScore": 0-100,
  "accuracyScore": 0-100,
  "completenessScore": 0-100,
  "relevanceScore": 0-100,
  "issues": ["list of factual errors or misrepresentations"],
  "strengths": ["list of things the summary does well"],
  "overallAssessment": "1-2 sentence overall assessment"
}

## Calibrated Scoring Guidelines (be generous, not strict):

**accuracyScore** (0-100): Are facts in the summary correct?
- 90-100: All facts verified, no errors
- 70-89: Minor discrepancies but core facts correct
- 50-69: Some errors but main message accurate
- Below 50: Significant factual errors

**completenessScore** (0-100): Does it capture KEY material information?
- 90-100: Comprehensive coverage of all major points
- 70-89: Covers most important points, some omissions
- 50-69: Covers main topic but misses secondary details
- Below 50: Missing critical information

**relevanceScore** (0-100): Is it focused on investor-relevant information?
- 90-100: Highly relevant, focused on material information
- 70-89: Mostly relevant, minimal tangential content
- 50-69: Mix of relevant and less relevant content
- Below 50: Off-topic or irrelevant focus

**confidenceScore** (0-100): Overall quality assessment
- Should be weighted average of other scores

## IMPORTANT: Validation Threshold (CALIBRATED)
A summary is valid (isValid: true) if:
- accuracyScore >= 50 (core facts correct)
- completenessScore >= 40 (main topic covered)
- relevanceScore >= 50 (investor-relevant)
- OR confidenceScore >= 50 (overall acceptable)
- No CRITICAL factual errors (minor errors are acceptable)

BE GENEROUS in scoring. Summaries that capture the essence of the filing should pass validation.
Penalize only for clear factual errors or completely missing the point.

Respond ONLY with valid JSON.`;

  try {
    const response = await openRouterClient.sendMessage(
      [{ role: 'user', content: validationPrompt }],
      {
        maxTokens: 1000,
        temperature: 0.1,
        timeout: 60000, // 60s timeout for validation
      }
    );

    const content = response.content;

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const result: SummaryValidationResult = {
      isValid: parsed.isValid ?? false,
      confidenceScore: parsed.confidenceScore ?? 0,
      accuracyScore: parsed.accuracyScore ?? 0,
      completenessScore: parsed.completenessScore ?? 0,
      relevanceScore: parsed.relevanceScore ?? 0,
      issues: parsed.issues ?? [],
      strengths: parsed.strengths ?? [],
      overallAssessment: parsed.overallAssessment ?? 'Validation failed',
      validationDurationMs: Date.now() - startTime
    };

    validationLogger.info('AI summary validation completed', {
      ticker: input.ticker,
      formType: input.formType,
      isValid: result.isValid,
      confidenceScore: result.confidenceScore,
      accuracyScore: result.accuracyScore,
      completenessScore: result.completenessScore,
      relevanceScore: result.relevanceScore,
      validationDurationMs: result.validationDurationMs
    });

    return result;
  } catch (error) {
    validationLogger.error('Summary validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ticker: input.ticker,
      formType: input.formType
    });

    return {
      isValid: false,
      confidenceScore: 0,
      accuracyScore: 0,
      completenessScore: 0,
      relevanceScore: 0,
      issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown'}`],
      strengths: [],
      overallAssessment: 'Validation failed due to error',
      validationDurationMs: Date.now() - startTime
    };
  }
}
