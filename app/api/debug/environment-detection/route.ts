import { NextRequest, NextResponse } from 'next/server';
import { shouldUseRSSFeeds, isDevelopmentEnvironment } from '../../../../lib/sec-edgar/environment-aware-fetcher';

/**
 * Debug endpoint to test environment detection logic
 */
export async function GET(request: NextRequest) {
  const environmentInfo = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    isDevelopment: isDevelopmentEnvironment(),
    shouldUseRSS: shouldUseRSSFeeds(),
    detectedPlatform: getDetectedPlatform(),
    environmentVariables: {
      VERCEL_URL: !!process.env.VERCEL_URL,
      VERCEL: !!process.env.VERCEL,
      RAILWAY_ENVIRONMENT: !!process.env.RAILWAY_ENVIRONMENT,
      FORCE_SEC_RSS: process.env.FORCE_SEC_RSS,
      FORCE_SEC_REST_API: process.env.FORCE_SEC_REST_API
    },
    recommendation: shouldUseRSSFeeds() 
      ? 'Using RSS feeds (SEC Data API blocked or development environment)'
      : 'Using REST API (RSS feeds blocked or other production environment)'
  };

  return NextResponse.json(environmentInfo, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json'
    }
  });
}

function getDetectedPlatform(): string {
  if (process.env.VERCEL_URL || process.env.VERCEL) return 'VERCEL';
  if (process.env.RAILWAY_ENVIRONMENT) return 'RAILWAY';
  if (isDevelopmentEnvironment()) return 'DEVELOPMENT';
  return 'UNKNOWN';
}