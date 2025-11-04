import { OpenRouterClient } from '@/lib/ai/openrouter-client';

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

  constructor() {
    // Use the fallback model for cost-efficient personalization
    this.openrouter = new OpenRouterClient({
      defaultModel: process.env.OPENROUTER_FALLBACK_MODEL || 'x-ai/grok-beta' // Uses Grok for cost efficiency
    });
  }

  async generatePersonalizedContent(userContext: UserContext): Promise<PersonalizedContent> {
    try {
      const prompt = this.buildPersonalizationPrompt(userContext);
      
      const response = await this.openrouter.complete({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        maxTokens: 500,
        temperature: 0.7 // Higher creativity for marketing content
      });

      return this.parseRecommendations(response.content);
    } catch (error) {
      console.error('LLM personalization error:', error);
      return this.getFallbackContent(userContext);
    }
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
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.warn('Failed to parse LLM recommendations, using fallback:', error);
      return this.getFallbackContent();
    }
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
    userEngagement: UserEngagement
  ): Promise<EmailOptimization> {
    try {
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

      const response = await this.openrouter.complete({
        messages: [
          {
            role: 'user',
            content: optimizationPrompt
          }
        ],
        maxTokens: 400,
        temperature: 0.3 // Lower temperature for more focused recommendations
      });

      return this.parseOptimizations(response.content);
    } catch (error) {
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
    }
  ): Promise<string[]> {
    try {
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

      const response = await this.openrouter.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.8
      });

      const variants = JSON.parse(response.content);
      return Array.isArray(variants) ? variants : [baseSubject];
    } catch (error) {
      console.error('Subject line generation error:', error);
      return [
        baseSubject,
        `${context.topCompanies[0]} files ${context.topFormTypes[0]} + 4 more`,
        `This week: ${context.topCompanies.slice(0, 2).join(', ')} updates`,
        `${context.topCompanies.length} companies filed this week`,
        `SEC Alert: ${context.topCompanies[0]} + major updates`
      ];
    }
  }
}