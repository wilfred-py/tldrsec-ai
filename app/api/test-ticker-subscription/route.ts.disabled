import { NextRequest, NextResponse } from 'next/server';
import { 
  getTickerSubscriptionInfo, 
  getBatchTickerSubscriptionInfo,
  getFilingPriority,
  estimateTokenUsage
} from '../../../lib/subscription/tickerSubscriptionInfo';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const batch = searchParams.get('batch');

    if (batch) {
      // Test batch lookup
      const tickers = batch.split(',').map(t => t.trim().toUpperCase());
      
      console.log(`🧪 Testing batch ticker subscription lookup for: ${tickers.join(', ')}`);
      
      const startTime = Date.now();
      const results = await getBatchTickerSubscriptionInfo(tickers);
      const processingTime = Date.now() - startTime;
      
      return NextResponse.json({
        success: true,
        type: 'batch',
        processingTimeMs: processingTime,
        tickers: tickers,
        results: results.map(info => ({
          ...info,
          priority: getFilingPriority(info),
          tokenUsageExample: {
            baseTokens: 50000,
            estimatedTokens: estimateTokenUsage(50000, info),
            multiplier: info.estimatedTokenMultiplier
          }
        })),
        summary: {
          totalTickers: results.length,
          totalSubscribers: results.reduce((sum, r) => sum + r.totalSubscribers, 0),
          tickersWithProUsers: results.filter(r => r.hasProUsers).length,
          tickersWithPremiumUsers: results.filter(r => r.hasPremiumUsers).length,
          highPriorityTickers: results.filter(r => getFilingPriority(r) >= 7).length
        }
      });
    }
    
    if (ticker) {
      // Test single ticker lookup
      console.log(`🧪 Testing ticker subscription lookup for: ${ticker}`);
      
      const startTime = Date.now();
      const info = await getTickerSubscriptionInfo(ticker);
      const processingTime = Date.now() - startTime;
      
      const priority = getFilingPriority(info);
      const tokenUsage = estimateTokenUsage(50000, info); // Example with 50K base tokens
      
      return NextResponse.json({
        success: true,
        type: 'single',
        processingTimeMs: processingTime,
        ticker: ticker.toUpperCase(),
        subscriptionInfo: info,
        priority: priority,
        tokenUsageExample: {
          baseTokens: 50000,
          estimatedTokens: tokenUsage,
          multiplier: info.estimatedTokenMultiplier,
          explanation: `${info.estimatedTokenMultiplier}x multiplier based on ${info.totalSubscribers} subscribers (${info.tierMix.basic} basic, ${info.tierMix.professional} pro, ${info.tierMix.premium} premium)`
        },
        priorityExplanation: priority >= 8 ? 'HIGH - Premium users present' : 
                           priority >= 5 ? 'MEDIUM - Professional users present' : 'LOW - Mostly basic users'
      });
    }

    // Default test with common tickers
    const testTickers = ['TSLA', 'KO', 'VRT', 'NVDA', 'JPM'];
    console.log(`🧪 Running default ticker subscription test with: ${testTickers.join(', ')}`);
    
    const startTime = Date.now();
    const results = await getBatchTickerSubscriptionInfo(testTickers);
    const processingTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      type: 'default_test',
      processingTimeMs: processingTime,
      testDescription: 'Testing ticker subscription lookup service with common tickers from your database',
      results: results.map(info => ({
        ticker: info.ticker,
        totalSubscribers: info.totalSubscribers,
        hasProUsers: info.hasProUsers,
        hasPremiumUsers: info.hasPremiumUsers,
        tierMix: info.tierMix,
        estimatedTokenMultiplier: info.estimatedTokenMultiplier,
        priority: getFilingPriority(info),
        tokenUsageExample: {
          koFilingTokens: 80165, // Real KO 10-Q token count
          estimatedUsage: estimateTokenUsage(80165, info)
        }
      })),
      insights: {
        totalSubscribersAcrossAllTickers: results.reduce((sum, r) => sum + r.totalSubscribers, 0),
        averageTokenMultiplier: parseFloat((results.reduce((sum, r) => sum + r.estimatedTokenMultiplier, 0) / results.length).toFixed(2)),
        highPriorityTickers: results.filter(r => getFilingPriority(r) >= 7).map(r => r.ticker),
        burstCapacityRecommendation: results.some(r => r.hasProUsers || r.hasPremiumUsers) ? 
          'Enable burst mode when pro/premium user filings are in queue' : 'Standard rate limiting sufficient'
      },
      usage: {
        singleTicker: '/api/test-ticker-subscription?ticker=TSLA',
        batchLookup: '/api/test-ticker-subscription?batch=TSLA,KO,NVDA,JPM',
        allDefaults: '/api/test-ticker-subscription'
      }
    });

  } catch (error: unknown) {
    console.error('❌ Ticker subscription test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      note: 'This service uses both real database queries and mock data fallbacks for testing'
    }, { status: 500 });
  }
}