import { NextRequest, NextResponse } from 'next/server';
import { getEnhancedFilingSummary } from '../../../services/filings/enhanced/enhancedFilingSummaryService';
import { getTickerSubscriptionInfo } from '../../../lib/subscription';
import { FilingType } from '../../../types/sec/filing';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker') || 'KO';
    const filingType = (searchParams.get('type') || '10-Q') as FilingType;
    const dryRun = searchParams.get('dryRun') === 'true';

    console.log(`🧪 Testing subscription-aware filing processing for: ${ticker} (${filingType})`);

    if (dryRun) {
      // Dry run - just show subscription intelligence without processing
      const startTime = Date.now();
      const subscriptionInfo = await getTickerSubscriptionInfo(ticker);
      const processingTime = Date.now() - startTime;

      return NextResponse.json({
        success: true,
        type: 'dry_run',
        processingTimeMs: processingTime,
        ticker: ticker.toUpperCase(),
        filingType,
        subscriptionIntelligence: {
          subscriptionInfo,
          processingDecisions: {
            rateLimiterType: subscriptionInfo.hasPremiumUsers ? 'default (fastest)' : 
                             subscriptionInfo.hasProUsers ? 'default (fast)' : 'conservative',
            priority: subscriptionInfo.priority,
            tokenThreshold: subscriptionInfo.hasPremiumUsers ? '100K tokens' :
                           subscriptionInfo.hasProUsers ? '85K tokens' : '75K tokens',
            optimizationLevel: subscriptionInfo.hasPremiumUsers ? 'minimal' :
                              subscriptionInfo.hasProUsers ? 'conservative' : 'balanced',
            expectedTokenMultiplier: `${subscriptionInfo.estimatedTokenMultiplier}x`
          },
          realWorldExample: {
            koFilingTokens: 80165,
            estimatedProcessingTokens: Math.ceil(80165 * subscriptionInfo.estimatedTokenMultiplier),
            processingStrategy: subscriptionInfo.hasPremiumUsers && 80165 <= 100000 ? 'single' :
                               subscriptionInfo.hasProUsers && 80165 <= 85000 ? 'single' : 
                               80165 <= 75000 ? 'single' : 'chunked',
            queuePriority: subscriptionInfo.priority >= 8 ? 'HIGH' : 
                          subscriptionInfo.priority >= 5 ? 'MEDIUM' : 'LOW'
          }
        }
      });
    }

    // Full integration test - process actual filing with subscription intelligence
    const startTime = Date.now();
    
    // Get subscription info first for comparison
    const subscriptionInfo = await getTickerSubscriptionInfo(ticker);
    
    console.log(`📊 Subscription analysis for ${ticker}:`, {
      totalSubscribers: subscriptionInfo.totalSubscribers,
      hasProUsers: subscriptionInfo.hasProUsers,
      hasPremiumUsers: subscriptionInfo.hasPremiumUsers,
      priority: subscriptionInfo.priority,
      tokenMultiplier: subscriptionInfo.estimatedTokenMultiplier
    });

    // Process filing with subscription-aware enhancements
    const result = await getEnhancedFilingSummary(ticker, filingType, {
      enableTokenOptimization: true,
      saveToDatabase: false, // Don't save test results
      enableFallbacks: true
    });

    const totalProcessingTime = Date.now() - startTime;

    if (!result.data) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Filing processing failed',
        ticker: ticker.toUpperCase(),
        filingType,
        processingTimeMs: totalProcessingTime,
        subscriptionInfo
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      type: 'full_processing',
      processingTimeMs: totalProcessingTime,
      ticker: ticker.toUpperCase(),
      filingType,
      subscriptionIntelligence: {
        subscriptionInfo,
        appliedConfiguration: {
          rateLimiterUsed: subscriptionInfo.hasPremiumUsers || subscriptionInfo.hasProUsers ? 'default' : 'conservative',
          priorityUsed: subscriptionInfo.priority,
          optimizationLevel: subscriptionInfo.hasPremiumUsers ? 'minimal' :
                            subscriptionInfo.hasProUsers ? 'conservative' : 'balanced',
          tokenThreshold: subscriptionInfo.hasPremiumUsers ? 100000 :
                         subscriptionInfo.hasProUsers ? 85000 : 75000
        }
      },
      processingResults: {
        processingStrategy: result.metadata?.processingStrategy,
        cacheHit: result.metadata?.cacheHit,
        tokensUsed: result.data.tokensUsed,
        cost: result.data.cost,
        processingTimeMs: result.data.processingTimeMs,
        model: result.data.model,
        chunksProcessed: result.metadata?.chunkingResult?.totalChunks
      },
      summaryPreview: {
        summaryLength: result.data.summaryText.length,
        keyPointsCount: result.data.keyPoints.length,
        firstKeyPoint: result.data.keyPoints[0] || 'No key points available',
        cost: result.data.cost,
        efficiency: `${((result.data.tokensUsed || 0) / 1000).toFixed(1)}K tokens processed`
      },
      intelligentProcessingBenefits: {
        subscriptionAwarePriority: `Priority ${subscriptionInfo.priority}/10 based on ${subscriptionInfo.totalSubscribers} subscribers`,
        tokenOptimization: `${subscriptionInfo.estimatedTokenMultiplier}x multiplier applied based on subscription tier mix`,
        rateLimitingStrategy: subscriptionInfo.hasPremiumUsers ? 'Premium: Fastest processing' :
                             subscriptionInfo.hasProUsers ? 'Professional: Fast processing' : 
                             'Basic: Conservative but reliable processing',
        processingThresholds: subscriptionInfo.hasPremiumUsers ? 'Premium: Up to 100K tokens single request' :
                             subscriptionInfo.hasProUsers ? 'Professional: Up to 85K tokens single request' :
                             'Basic: Up to 75K tokens single request'
      }
    });

  } catch (error: unknown) {
    console.error('❌ Subscription-aware filing test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      note: 'This endpoint tests the full Phase 3 integration of subscription-aware SEC filing processing'
    }, { status: 500 });
  }
}