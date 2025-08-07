import { NextRequest, NextResponse } from 'next/server';
import { defaultRateLimiter, conservativeRateLimiter } from '../../../services/filings/enhanced/rateLimiter';

export async function GET(request: NextRequest) {
  try {
    // Test configuration
    const defaultConfig = defaultRateLimiter.getConfiguration();
    const conservativeConfig = conservativeRateLimiter.getConfiguration();
    
    // Test KO 10-Q scenario (80,165 tokens)
    const koTokens = 80165;
    let koTestResult = 'UNKNOWN';
    
    try {
      // Mock request for testing
      const mockRequest = () => Promise.resolve({ 
        usage: { input_tokens: koTokens, output_tokens: 1000 }
      });
      
      // This should NOT throw a QUOTA_EXCEEDED error with new limits
      await defaultRateLimiter.executeRequest(mockRequest, koTokens, 1, 'KO-TEST');
      koTestResult = 'ACCEPTED - Will process successfully';
    } catch (error: any) {
      if (error.type === 'QUOTA_EXCEEDED') {
        koTestResult = `REJECTED - ${error.message}`;
      } else {
        koTestResult = `QUEUED - ${error.message}`;
      }
    }
    
    // Test oversized request (500K tokens)
    const oversizedTokens = 500000;
    let oversizedTestResult = 'UNKNOWN';
    
    try {
      const mockOversizedRequest = () => Promise.resolve({ 
        usage: { input_tokens: oversizedTokens, output_tokens: 1000 }
      });
      
      await defaultRateLimiter.executeRequest(mockOversizedRequest, oversizedTokens, 1, 'OVERSIZED-TEST');
      oversizedTestResult = 'ACCEPTED - Should have been rejected!';
    } catch (error: any) {
      if (error.type === 'QUOTA_EXCEEDED') {
        oversizedTestResult = `PROPERLY REJECTED - ${error.message}`;
      } else {
        oversizedTestResult = `UNEXPECTED - ${error.message}`;
      }
    }
    
    // Get current usage stats
    const defaultStats = defaultRateLimiter.getUsageStats();
    const conservativeStats = conservativeRateLimiter.getUsageStats();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        configuration: {
          default: {
            tokensPerMinute: defaultConfig.tokensPerMinute,
            requestsPerMinute: defaultConfig.requestsPerMinute,
            maxRetryAttempts: defaultConfig.maxRetryAttempts,
            maxTotalWaitTimeMs: defaultConfig.maxTotalWaitTimeMs
          },
          conservative: {
            tokensPerMinute: conservativeConfig.tokensPerMinute,
            requestsPerMinute: conservativeConfig.requestsPerMinute,
            maxRetryAttempts: conservativeConfig.maxRetryAttempts,
            maxTotalWaitTimeMs: conservativeConfig.maxTotalWaitTimeMs
          }
        },
        tests: {
          koFilingTest: {
            tokens: koTokens,
            result: koTestResult,
            status: koTestResult.includes('ACCEPTED') ? '✅ PASS' : '❌ FAIL'
          },
          oversizedTest: {
            tokens: oversizedTokens,
            result: oversizedTestResult,
            status: oversizedTestResult.includes('PROPERLY REJECTED') ? '✅ PASS' : '❌ FAIL'
          }
        },
        currentUsage: {
          default: {
            tokensUsed: defaultStats.currentWindow.tokens,
            tokensRemaining: defaultStats.currentWindow.tokensRemaining,
            requestsUsed: defaultStats.currentWindow.requests,
            requestsRemaining: defaultStats.currentWindow.requestsRemaining,
            queueLength: defaultStats.queue.length,
            isProcessing: defaultStats.queue.isProcessing
          },
          conservative: {
            tokensUsed: conservativeStats.currentWindow.tokens,
            tokensRemaining: conservativeStats.currentWindow.tokensRemaining,
            queueLength: conservativeStats.queue.length
          }
        }
      }
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}