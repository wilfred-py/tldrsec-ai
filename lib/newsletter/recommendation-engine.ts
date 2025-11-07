import { OpenRouterClient } from '@/lib/ai/openrouter-client';
import { createDefaultRateLimitManager, AIRateLimitManager, RateLimitExceededError } from '@/lib/ai/rate-limiter';
import { costTracker } from '@/lib/ai/cost-tracker';
import { rateLimitConfig, getUserTier } from '@/lib/ai/rate-limit-config';
import { logger } from '@/lib/logging';

export interface PersonalizedContent {
  headline: string;
  valueProposition: string;
  socialProof: string;
  ctaText: string;
  riskMitigation: string;
}

export interface UserContext {
  email?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  previousEmails?: string[];
  clickedTopics?: string[];
  userAgent?: string;
  country?: string;
  // Rate limiting context
  userId?: string;
  subscriptionTier?: string;
}

export interface EmailOptimization {
  subjectLineImprovement: string;
  contentStructureImprovement: string;
  ctaOptimization: string;
}

export interface UserEngagement {
  openRate: number;
  clickRate: number;
  topClickedSections: string[];
}

export class LLMRecommendationEngine {
  private openrouter: OpenRouterClient;
  private rateLimitManager: AIRateLimitManager;
  private readonly requestTimeout: number = 15000; // 15 seconds timeout
  private readonly maxContentLength: number = 1000; // Limit content length for faster processing

  constructor() {
    // Use the fallback model for cost-efficient personalization
    this.openrouter = new OpenRouterClient({
      defaultModel: process.env.OPENROUTER_FALLBACK_MODEL || 'x-ai/grok-beta' // Uses Grok for cost efficiency
    });
    
    // Initialize rate limiting
    this.rateLimitManager = createDefaultRateLimitManager();
  }

  private createTimeoutPromise<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(`Request timeout after ${timeoutMs}ms`);
        error.name = 'TimeoutError';
        reject(error);
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  async generatePersonalizedContent(userContext: UserContext): Promise<PersonalizedContent> {
    const operation = 'newsletter_personalization';
    const model = process.env.OPENROUTER_FALLBACK_MODEL || 'x-ai/grok-beta';
    const startTime = Date.now();
    
    try {
      // Check rate limiting and budget before processing
      await this.checkRateLimitsAndBudget(userContext, operation);

      const prompt = this.buildPersonalizationPrompt(userContext);
      
      // Estimate token usage and cost
      const inputTokens = this.estimateTokens(prompt);
      const outputTokens = 300; // maxTokens setting
      const estimatedCost = costTracker.estimateCost(model, inputTokens, outputTokens);
      
      // Final budget check with accurate cost estimate
      const budgetStatus = await costTracker.checkBudget(
        userContext.userId,
        estimatedCost,
        operation
      );
      
      if (!budgetStatus.isWithinBudget) {
        logger.warn('Budget exceeded for personalization request', {
          userId: userContext.userId,
          operation,
          estimatedCost,
          budgetStatus
        });
        
        // Use fallback content instead of making AI call
        return this.getFallbackContent(userContext);
      }

      // Add timeout to the AI request
      const aiRequest = this.openrouter.complete({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: outputTokens,
        temperature: 0.7 // Higher creativity for marketing content
      });

      const response = await this.createTimeoutPromise(aiRequest, this.requestTimeout);
      
      // Validate response before processing
      if (!response || !response.content) {
        throw new Error('Empty or invalid response from AI service');
      }

      // Track actual usage and cost
      const actualCost = response.cost?.totalCost || estimatedCost;
      const actualInputTokens = response.usage?.inputTokens || inputTokens;
      const actualOutputTokens = response.usage?.outputTokens || outputTokens;
      
      await this.recordUsageAndCost({
        userId: userContext.userId,
        operation,
        model,
        inputTokens: actualInputTokens,
        outputTokens: actualOutputTokens,
        estimatedCost,
        actualCost,
        processingTimeMs: Date.now() - startTime
      });

      const parsedContent = this.parseRecommendations(response.content);
      
      // Validate parsed content structure
      this.validatePersonalizedContent(parsedContent);
      
      return parsedContent;
    } catch (error) {
      // Check if it's a rate limit error
      if (error instanceof RateLimitExceededError) {
        logger.warn('Rate limit exceeded for personalization', {
          userId: userContext.userId,
          operation,
          violations: error.violations,
          retryAfter: error.retryAfter
        });
        
        // Use fallback content when rate limited
        return this.getFallbackContent(userContext);
      }
      
      // Enhance error information
      const enhancedError = this.enhanceError(error, 'generatePersonalizedContent');
      console.error('LLM personalization error:', enhancedError);
      
      // Return fallback content on any error
      return this.getFallbackContent(userContext);
    }
  }

  private validatePersonalizedContent(content: PersonalizedContent): void {
    const requiredFields = ['headline', 'valueProposition', 'socialProof', 'ctaText', 'riskMitigation'];
    const missingFields = requiredFields.filter(field => !content[field as keyof PersonalizedContent]);
    
    if (missingFields.length > 0) {
      throw new Error(`Invalid personalized content: missing fields ${missingFields.join(', ')}`);
    }

    // Validate content length limits
    if (content.headline.length > 80) {
      throw new Error('Headline exceeds maximum length');
    }
    
    if (content.valueProposition.length > 120) {
      throw new Error('Value proposition exceeds maximum length');
    }
  }

  private enhanceError(error: unknown, operation: string): Error {
    if (error instanceof Error) {
      // Add context to existing error
      const enhancedError = new Error(`${operation} failed: ${error.message}`);
      enhancedError.name = error.name === 'Error' ? 'AIPersonalizationError' : error.name;
      enhancedError.stack = error.stack;
      return enhancedError;
    }
    
    // Handle non-Error objects
    const errorMessage = typeof error === 'string' ? error : 'Unknown error occurred';
    const enhancedError = new Error(`${operation} failed: ${errorMessage}`);
    enhancedError.name = 'AIPersonalizationError';
    return enhancedError;
  }

  private buildPersonalizationPrompt(context: UserContext): string {
    return `
You are a financial content strategist. Based on the user context below, generate personalized content recommendations for a SEC filing newsletter signup page.

User Context:
- Referrer: ${context.referrer || 'direct'}
- UTM Source: ${context.utm_source || 'none'}
- UTM Medium: ${context.utm_medium || 'none'}
- UTM Campaign: ${context.utm_campaign || 'none'}
- Previous engagement: ${context.clickedTopics?.join(', ') || 'new visitor'}
- Country: ${context.country || 'unknown'}

Generate personalized messaging that addresses specific user intents:

For organic traffic: Focus on trust and credibility
For social media traffic: Emphasize community and social proof
For paid traffic: Highlight value and urgency
For email referrals: Focus on personal recommendations
For direct traffic: Emphasize brand authority

Generate:
1. A personalized headline (max 60 chars)
2. Value proposition text (max 100 chars)
3. Social proof message (max 80 chars)
4. Primary CTA text (max 25 chars)
5. Risk mitigation message (max 60 chars)

Focus on addressing investor pain points like information overload, time constraints, and staying informed about market-moving events.

Respond in JSON format only:
{
  "headline": "...",
  "valueProposition": "...",
  "socialProof": "...",
  "ctaText": "...",
  "riskMitigation": "..."
}
    `;
  }

  private parseRecommendations(content: string): PersonalizedContent {
    try {
      // Clean up the response to extract JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      // Parse JSON with additional validation
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure all required fields are present and are strings
      const requiredFields = ['headline', 'valueProposition', 'socialProof', 'ctaText', 'riskMitigation'];
      for (const field of requiredFields) {
        if (typeof parsed[field] !== 'string' || parsed[field].trim().length === 0) {
          throw new Error(`Invalid or missing field: ${field}`);
        }
      }

      // Sanitize the content
      const sanitized: PersonalizedContent = {
        headline: this.sanitizeContent(parsed.headline, 80),
        valueProposition: this.sanitizeContent(parsed.valueProposition, 120),
        socialProof: this.sanitizeContent(parsed.socialProof, 100),
        ctaText: this.sanitizeContent(parsed.ctaText, 30),
        riskMitigation: this.sanitizeContent(parsed.riskMitigation, 80),
      };

      return sanitized;
    } catch (error) {
      const enhancedError = this.enhanceError(error, 'parseRecommendations');
      console.warn('Failed to parse LLM recommendations:', enhancedError);
      throw enhancedError; // Re-throw to be handled by calling function
    }
  }

  /**
   * Check rate limits and budget before making AI calls
   */
  private async checkRateLimitsAndBudget(
    userContext: UserContext, 
    operation: string
  ): Promise<void> {
    if (!rateLimitConfig.isRateLimitingEnabled()) {
      return; // Rate limiting disabled
    }

    // Estimate token usage for rate limiting check
    const estimatedTokens = 1000; // Conservative estimate for recommendation requests
    const estimatedCost = 0.01; // Conservative cost estimate

    const rateLimitResult = await this.rateLimitManager.checkAllLimits(
      userContext.userId,
      operation,
      estimatedTokens,
      estimatedCost
    );

    if (!rateLimitResult.allowed) {
      throw new RateLimitExceededError(rateLimitResult.violations);
    }
  }

  /**
   * Estimate token count for text (simple approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token per 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Record usage and cost after AI operation
   */
  private async recordUsageAndCost(data: {
    userId?: string;
    operation: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    actualCost: number;
    processingTimeMs: number;
  }): Promise<void> {
    try {
      // Record usage for rate limiting
      await this.rateLimitManager.recordUsage(
        data.userId,
        data.operation,
        data.inputTokens + data.outputTokens,
        data.actualCost
      );

      // Track cost for budget management
      await costTracker.trackCost({
        userId: data.userId,
        operation: data.operation,
        model: data.model,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        estimatedCost: data.estimatedCost,
        actualCost: data.actualCost,
        timestamp: new Date(),
        metadata: {
          processingTimeMs: data.processingTimeMs,
          source: 'newsletter_recommendation_engine'
        }
      });

    } catch (error) {
      logger.error('Failed to record usage and cost', {
        error: error instanceof Error ? error.message : String(error),
        data
      });
    }
  }

  private sanitizeContent(content: string, maxLength: number): string {
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }
    
    // Remove any potential HTML/script tags and trim whitespace
    const sanitized = content
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[<>]/g, '') // Remove remaining angle brackets
      .trim();
    
    if (sanitized.length === 0) {
      throw new Error('Content is empty after sanitization');
    }
    
    // Truncate if too long
    return sanitized.length > maxLength 
      ? sanitized.substring(0, maxLength - 3) + '...' 
      : sanitized;
  }

  private getFallbackContent(context?: UserContext): PersonalizedContent {
    // Provide different fallbacks based on traffic source
    const utmSource = context?.utm_source?.toLowerCase();
    
    if (utmSource?.includes('twitter') || utmSource?.includes('social')) {
      return {
        headline: "Join the SEC Filing Community",
        valueProposition: "Smart investors are already subscribed. Get AI summaries weekly.",
        socialProof: "2,847+ investors trust our insights",
        ctaText: "Join the Community",
        riskMitigation: "Free • Unsubscribe anytime"
      };
    }
    
    if (utmSource?.includes('google') || utmSource?.includes('search')) {
      return {
        headline: "SEC Filings Made Simple",
        valueProposition: "No more reading 100-page documents. Get AI summaries instead.",
        socialProof: "Trusted by 2,847+ investors",
        ctaText: "Get Summaries",
        riskMitigation: "Always free • No spam"
      };
    }
    
    if (utmSource?.includes('email') || context?.referrer?.includes('email')) {
      return {
        headline: "Recommended for You",
        valueProposition: "Your colleague was right - these summaries save hours weekly.",
        socialProof: "Recommended by top investors",
        ctaText: "Start Saving Time",
        riskMitigation: "Free trial • Cancel anytime"
      };
    }
    
    // Default fallback
    return {
      headline: "SEC Filings Made Simple",
      valueProposition: "Get weekly AI summaries without the overwhelm",
      socialProof: "Join 2,847+ smart investors",
      ctaText: "Get Weekly Insights",
      riskMitigation: "Free forever • No spam"
    };
  }

  async optimizeEmailContent(
    baseContent: string,
    userEngagement: UserEngagement,
    userContext?: UserContext
  ): Promise<EmailOptimization> {
    const operation = 'email_optimization';
    const model = process.env.OPENROUTER_FALLBACK_MODEL || 'x-ai/grok-beta';
    const startTime = Date.now();
    
    try {
      // Check rate limiting first
      if (userContext) {
        await this.checkRateLimitsAndBudget(userContext, operation);
      }

      const optimizationPrompt = `
Based on the email engagement data below, suggest improvements to this newsletter content:

Current Content:
${baseContent.substring(0, 1000)}... [truncated]

Engagement Data:
- Open Rate: ${userEngagement.openRate}%
- Click Rate: ${userEngagement.clickRate}%
- Most Clicked: ${userEngagement.topClickedSections.join(', ')}

Analyze the performance:
- Open rate benchmark: 20-25% (finance industry)
- Click rate benchmark: 3-5% (finance industry)

Provide 3 specific improvements:
1. Subject line optimization (if open rate is low)
2. Content structure improvement (if click rate is low)
3. CTA placement optimization (to increase clicks)

Consider:
- Subject lines under 50 characters perform better
- Personalization increases open rates by 26%
- Clear value propositions in first 20 words
- Single focused CTA per email section
- Mobile-first design (80% read on mobile)

Respond in JSON format:
{
  "subjectLineImprovement": "specific suggestion with example",
  "contentStructureImprovement": "specific structural change",
  "ctaOptimization": "specific CTA placement/text improvement"
}
      `;

      // Estimate and check budget
      const inputTokens = this.estimateTokens(optimizationPrompt);
      const outputTokens = 400;
      const estimatedCost = costTracker.estimateCost(model, inputTokens, outputTokens);
      
      if (userContext?.userId) {
        const budgetStatus = await costTracker.checkBudget(
          userContext.userId,
          estimatedCost,
          operation
        );
        
        if (!budgetStatus.isWithinBudget) {
          logger.warn('Budget exceeded for email optimization', {
            userId: userContext.userId,
            estimatedCost,
            budgetStatus
          });
          return this.getFallbackOptimizations(userEngagement);
        }
      }

      const response = await this.openrouter.complete({
        messages: [
          {
            role: 'user',
            content: optimizationPrompt
          }
        ],
        maxTokens: outputTokens,
        temperature: 0.3 // Lower temperature for more focused recommendations
      });

      // Record usage if we have user context
      if (userContext?.userId) {
        const actualCost = response.cost?.totalCost || estimatedCost;
        const actualInputTokens = response.usage?.inputTokens || inputTokens;
        const actualOutputTokens = response.usage?.outputTokens || outputTokens;
        
        await this.recordUsageAndCost({
          userId: userContext.userId,
          operation,
          model,
          inputTokens: actualInputTokens,
          outputTokens: actualOutputTokens,
          estimatedCost,
          actualCost,
          processingTimeMs: Date.now() - startTime
        });
      }

      return this.parseOptimizations(response.content);
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        logger.warn('Rate limit exceeded for email optimization', {
          userId: userContext?.userId,
          operation,
          violations: error.violations
        });
        return this.getFallbackOptimizations(userEngagement);
      }
      
      console.error('Email optimization error:', error);
      return this.getFallbackOptimizations(userEngagement);
    }
  }

  private parseOptimizations(content: string): EmailOptimization {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.warn('Failed to parse optimization recommendations:', error);
      return {
        subjectLineImprovement: "Make subject lines more specific and add urgency",
        contentStructureImprovement: "Lead with most important insights in first paragraph",
        ctaOptimization: "Use action-oriented CTAs and place them above the fold"
      };
    }
  }

  private getFallbackOptimizations(engagement: UserEngagement): EmailOptimization {
    const optimizations: EmailOptimization = {
      subjectLineImprovement: "Add specific company names or numbers to subject line",
      contentStructureImprovement: "Use bullet points and shorter paragraphs for better readability",
      ctaOptimization: "Make CTAs more prominent with contrasting colors"
    };

    // Customize based on performance
    if (engagement.openRate < 15) {
      optimizations.subjectLineImprovement = "Test personal subject lines like 'Your weekly SEC update is ready'";
    }
    
    if (engagement.clickRate < 2) {
      optimizations.ctaOptimization = "Reduce number of CTAs and make primary action more prominent";
    }

    return optimizations;
  }

  // Method to generate newsletter subject line variants for A/B testing
  async generateSubjectLineVariants(
    baseSubject: string,
    context: {
      topCompanies: string[];
      topFormTypes: string[];
      weekDate: string;
    },
    userContext?: UserContext
  ): Promise<string[]> {
    const operation = 'subject_line_generation';
    const model = process.env.OPENROUTER_FALLBACK_MODEL || 'x-ai/grok-beta';
    const startTime = Date.now();
    
    try {
      // Check rate limiting first
      if (userContext) {
        await this.checkRateLimitsAndBudget(userContext, operation);
      }

      const prompt = `
Generate 5 email subject line variants for a SEC filing newsletter. 

Base subject: "${baseSubject}"

This week's content includes:
- Companies: ${context.topCompanies.join(', ')}
- Form types: ${context.topFormTypes.join(', ')}
- Week: ${context.weekDate}

Create variants that:
1. Include specific company names
2. Add urgency or curiosity
3. Use numbers/stats
4. Keep under 50 characters
5. Appeal to investors

Return as JSON array:
["variant1", "variant2", "variant3", "variant4", "variant5"]
      `;

      // Estimate and check budget
      const inputTokens = this.estimateTokens(prompt);
      const outputTokens = 300;
      const estimatedCost = costTracker.estimateCost(model, inputTokens, outputTokens);
      
      if (userContext?.userId) {
        const budgetStatus = await costTracker.checkBudget(
          userContext.userId,
          estimatedCost,
          operation
        );
        
        if (!budgetStatus.isWithinBudget) {
          logger.warn('Budget exceeded for subject line generation', {
            userId: userContext.userId,
            estimatedCost,
            budgetStatus
          });
          return this.getFallbackSubjectLines(baseSubject, context);
        }
      }

      const response = await this.openrouter.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: outputTokens,
        temperature: 0.8
      });

      // Record usage if we have user context
      if (userContext?.userId) {
        const actualCost = response.cost?.totalCost || estimatedCost;
        const actualInputTokens = response.usage?.inputTokens || inputTokens;
        const actualOutputTokens = response.usage?.outputTokens || outputTokens;
        
        await this.recordUsageAndCost({
          userId: userContext.userId,
          operation,
          model,
          inputTokens: actualInputTokens,
          outputTokens: actualOutputTokens,
          estimatedCost,
          actualCost,
          processingTimeMs: Date.now() - startTime
        });
      }

      const variants = JSON.parse(response.content);
      return Array.isArray(variants) ? variants : this.getFallbackSubjectLines(baseSubject, context);
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        logger.warn('Rate limit exceeded for subject line generation', {
          userId: userContext?.userId,
          operation,
          violations: error.violations
        });
        return this.getFallbackSubjectLines(baseSubject, context);
      }
      
      console.error('Subject line generation error:', error);
      return this.getFallbackSubjectLines(baseSubject, context);
    }
  }

  /**
   * Generate fallback subject lines when AI is unavailable
   */
  private getFallbackSubjectLines(
    baseSubject: string,
    context: {
      topCompanies: string[];
      topFormTypes: string[];
      weekDate: string;
    }
  ): string[] {
    return [
      baseSubject,
      `${context.topCompanies[0]} files ${context.topFormTypes[0]} + 4 more`,
      `This week: ${context.topCompanies.slice(0, 2).join(', ')} updates`,
      `${context.topCompanies.length} companies filed this week`,
      `SEC Alert: ${context.topCompanies[0]} + major updates`
    ];
  }

  /**
   * Get rate limiting status for a user
   */
  async getRateLimitStatus(userId: string): Promise<{
    requests: { current: number; limit: number; resetTime: number };
    tokens: { current: number; limit: number; resetTime: number };
    cost: { current: number; limit: number; resetTime: number };
  }> {
    return await this.rateLimitManager.getRateLimitStatus(userId);
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    await this.rateLimitManager.shutdown();
  }
}