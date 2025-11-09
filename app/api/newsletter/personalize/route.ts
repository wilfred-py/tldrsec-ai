import { NextRequest, NextResponse } from 'next/server';
import { LLMRecommendationEngine, UserContext } from '@/lib/newsletter/recommendation-engine';
import { logger } from '@/lib/logging';

export async function POST(request: NextRequest) {
  try {
    const userContext: UserContext = await request.json();
    
    // Initialize the recommendation engine (server-side only)
    const engine = new LLMRecommendationEngine();
    
    // Generate personalized content
    const personalizedContent = await engine.generatePersonalizedContent(userContext);
    
    return NextResponse.json({
      success: true,
      content: personalizedContent
    });
    
  } catch (error) {
    logger.error('Newsletter personalization API error:', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Return fallback content on error
    const fallbackContent = {
      headline: "SEC Filings Made Simple",
      valueProposition: "Get weekly AI summaries without the overwhelm",
      socialProof: "Join 2,847+ smart investors",
      ctaText: "Get Weekly Insights",
      riskMitigation: "Free forever • No spam"
    };
    
    return NextResponse.json({
      success: false,
      content: fallbackContent,
      error: 'Personalization service temporarily unavailable'
    });
  }
}