/**
 * OpenRouter Health Check Endpoint
 * 
 * This endpoint tests OpenRouter connectivity and configuration
 * to help diagnose why OpenRouter API calls might not be happening.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { openRouterClient } from '../../../../lib/ai/openrouter-client';
import { getDefaultModel } from '../../../../lib/ai/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const healthLogger = logger.child('openrouter-health');

/**
 * Test OpenRouter configuration and connectivity
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  healthLogger.info('🏥 OpenRouter Health Check Started');

  try {
    // Phase 1: Environment Variable Check
    const envCheck = {
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
      TLDRSEC_AI_SUMMARIZER: !!process.env.TLDRSEC_AI_SUMMARIZER,
      DEFAULT_AI_MODEL: !!process.env.DEFAULT_AI_MODEL,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      apiKeySource: process.env.TLDRSEC_AI_SUMMARIZER ? 'TLDRSEC_AI_SUMMARIZER' : 
                   process.env.OPENROUTER_API_KEY ? 'OPENROUTER_API_KEY' : 'none',
      defaultModel: getDefaultModel()
    };

    healthLogger.info('🔧 Environment Variables Check', envCheck);

    // Phase 2: Configuration Validation
    const hasValidApiKey = !!(process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY);
    const apiKey = process.env.TLDRSEC_AI_SUMMARIZER || process.env.OPENROUTER_API_KEY;
    const apiKeyFormat = hasValidApiKey ? `${apiKey?.substring(0, 8)}...${apiKey?.substring(-4)}` : 'none';
    const isValidApiKeyFormat = hasValidApiKey && apiKey?.startsWith('sk-or-v1-');

    const configCheck = {
      hasValidApiKey,
      apiKeyFormat,
      isValidApiKeyFormat,
      defaultModel: getDefaultModel(),
      baseURL: 'https://openrouter.ai/api/v1'
    };

    healthLogger.info('⚙️  Configuration Validation', configCheck);

    // Phase 3: OpenRouter Client Test
    let clientTest = {
      clientInitialized: false,
      circuitBreakerStats: {},
      availableModels: {},
      usage: {}
    };

    try {
      // Test basic client functionality
      clientTest.clientInitialized = true;
      clientTest.circuitBreakerStats = openRouterClient.getCircuitBreakerStats();
      clientTest.availableModels = openRouterClient.getAvailableModels();
      clientTest.usage = openRouterClient.getUsage();

      healthLogger.info('🤖 OpenRouter Client Status', clientTest);
    } catch (clientError) {
      healthLogger.error('❌ OpenRouter Client Test Failed', {
        error: clientError instanceof Error ? clientError.message : String(clientError)
      });
    }

    // Phase 4: Simple API Test (if valid configuration)
    let apiTest = {
      attempted: false,
      successful: false,
      error: null as any,
      response: null as any,
      duration: 0
    };

    if (hasValidApiKey && isValidApiKeyFormat) {
      try {
        apiTest.attempted = true;
        const testStartTime = Date.now();

        healthLogger.info('🚀 Testing OpenRouter API with simple request');

        const testResponse = await openRouterClient.sendMessage([
          { role: 'user', content: 'Respond with exactly: "OpenRouter health check successful"' }
        ], {
          model: getDefaultModel(),
          maxTokens: 50,
          temperature: 0,
          timeout: 30000 // 30 seconds
        });

        apiTest.duration = Date.now() - testStartTime;
        apiTest.successful = true;
        apiTest.response = {
          model: testResponse.model,
          content: testResponse.content,
          usage: testResponse.usage,
          cost: testResponse.cost
        };

        healthLogger.info('✅ OpenRouter API Test Successful', {
          duration: apiTest.duration,
          model: testResponse.model,
          cost: testResponse.cost.totalCost
        });

      } catch (apiError) {
        apiTest.duration = Date.now() - (apiTest as any).testStartTime || 0;
        apiTest.error = {
          message: apiError instanceof Error ? apiError.message : String(apiError),
          name: apiError instanceof Error ? apiError.name : 'Unknown'
        };

        healthLogger.error('❌ OpenRouter API Test Failed', {
          error: apiTest.error,
          duration: apiTest.duration
        });
      }
    } else {
      healthLogger.warn('⚠️  Skipping API test due to invalid configuration', {
        hasValidApiKey,
        isValidApiKeyFormat
      });
    }

    // Phase 5: Generate Health Report
    const healthStatus = {
      overall: apiTest.successful ? 'HEALTHY' : 
               hasValidApiKey && isValidApiKeyFormat ? 'DEGRADED' : 'UNHEALTHY',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      checks: {
        environment: envCheck,
        configuration: configCheck,
        client: clientTest,
        api: apiTest
      },
      recommendations: []
    };

    // Generate recommendations
    if (!hasValidApiKey) {
      healthStatus.recommendations.push('Set OPENROUTER_API_KEY or TLDRSEC_AI_SUMMARIZER environment variable');
    }
    if (hasValidApiKey && !isValidApiKeyFormat) {
      healthStatus.recommendations.push('Ensure API key starts with "sk-or-v1-"');
    }
    if (!process.env.DEFAULT_AI_MODEL) {
      healthStatus.recommendations.push('Set DEFAULT_AI_MODEL environment variable to xAI model (e.g., x-ai/grok-4-fast-reasoning)');
    }
    if (apiTest.attempted && !apiTest.successful) {
      healthStatus.recommendations.push('Check API key validity and OpenRouter service status');
    }

    healthLogger.info(`🏥 Health Check Complete: ${healthStatus.overall}`, {
      duration: healthStatus.duration,
      recommendations: healthStatus.recommendations
    });

    return NextResponse.json(healthStatus, { 
      status: healthStatus.overall === 'HEALTHY' ? 200 : 
              healthStatus.overall === 'DEGRADED' ? 207 : 503 
    });

  } catch (error) {
    const errorDetails = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };

    healthLogger.error('💥 Health Check Failed', {
      error: errorDetails,
      duration: Date.now() - startTime
    });

    return NextResponse.json({
      overall: 'CRITICAL',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: errorDetails,
      recommendations: [
        'Check server logs for detailed error information',
        'Verify all required environment variables are set',
        'Ensure OpenRouter service is accessible'
      ]
    }, { status: 500 });
  }
}

/**
 * Allow POST requests for authenticated health checks
 */
export async function POST(request: NextRequest) {
  // For authenticated health checks, you could add additional tests here
  return GET(request);
}