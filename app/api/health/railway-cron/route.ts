import { NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { getPrismaClient } from '../../../../lib/db/prisma';

const healthLogger = logger.child('railway-cron-health');
const prisma = getPrismaClient();

/**
 * Railway Cron Pipeline Health Check Endpoint
 * Specifically validates all components needed for the cron email pipeline
 * GET /api/health/railway-cron
 */
export async function GET() {
  const startTime = Date.now();
  
  try {
    healthLogger.info('Starting Railway cron pipeline health check');

    const checks = await performRailwayCronHealthChecks();
    const overallStatus = determineOverallStatus(checks);
    
    const result = {
      success: overallStatus === 'healthy',
      status: overallStatus,
      timestamp: new Date().toISOString(),
      platform: process.env.RAILWAY_ENVIRONMENT ? 'RAILWAY' : 'LOCAL/VERCEL',
      checks,
      duration: Date.now() - startTime
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    
    healthLogger.info('Railway cron health check completed', { 
      status: overallStatus,
      duration: result.duration,
      platform: result.platform
    });

    return NextResponse.json(result, { status: statusCode });

  } catch (error) {
    healthLogger.error('Railway cron health check failed', { error });

    return NextResponse.json({
      success: false,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    }, { status: 500 });
  }
}

/**
 * Perform comprehensive health checks for Railway cron pipeline
 */
async function performRailwayCronHealthChecks() {
  const checks: { [key: string]: unknown } = {};

  // 1. Environment Variables Check
  try {
    const requiredEnvVars = [
      'CRON_SECRET',
      'ANTHROPIC_API_KEY', 
      'RESEND_API_KEY',
      'DATABASE_URL'
    ];

    const missingVars: string[] = [];
    const presentVars: string[] = [];

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        presentVars.push(envVar);
      } else {
        missingVars.push(envVar);
      }
    }

    checks.environment_variables = {
      status: missingVars.length === 0 ? 'healthy' : 'unhealthy',
      required_vars: requiredEnvVars.length,
      present_vars: presentVars.length,
      missing_vars: missingVars,
      railway_environment: !!process.env.RAILWAY_ENVIRONMENT,
      railway_public_domain: !!process.env.RAILWAY_PUBLIC_DOMAIN
    };
  } catch (error) {
    checks.environment_variables = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Environment check failed'
    };
  }

  // 2. Database Connection & User Data
  try {
    const dbStart = Date.now();
    
    // Test basic connection
    await prisma.$queryRaw`SELECT 1 as connection_test`;
    
    // Check for users with tickers (email targets)
    const usersWithTickers = await prisma.user.count({
      where: {
        tickers: {
          some: {}
        }
      }
    });

    // Check backlogged filings
    const backloggedFilings = await prisma.secFiling.count({
      where: {
        processed: false
      }
    });

    // Check recent summaries
    const recentSummaries = await prisma.summary.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    checks.database = {
      status: 'healthy',
      connection_time: Date.now() - dbStart,
      users_with_tickers: usersWithTickers,
      backlogged_filings: backloggedFilings,
      recent_summaries: recentSummaries,
      has_email_targets: usersWithTickers > 0
    };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Database check failed'
    };
  }

  // 3. External Service Connectivity
  try {
    const servicesStart = Date.now();
    
    // Test SEC API connectivity
    const secApiTest = await testSecApiConnectivity();
    
    // Test Anthropic API connectivity  
    const anthropicTest = await testAnthropicConnectivity();
    
    // Test Resend API connectivity
    const resendTest = await testResendConnectivity();

    checks.external_services = {
      status: (secApiTest.status === 'healthy' && anthropicTest.status === 'healthy' && resendTest.status === 'healthy') ? 'healthy' : 'degraded',
      sec_api: secApiTest,
      anthropic_api: anthropicTest,
      resend_api: resendTest,
      total_time: Date.now() - servicesStart
    };
  } catch (error) {
    checks.external_services = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'External services check failed'
    };
  }

  // 4. Cron Authentication Check
  try {
    const cronSecret = process.env.CRON_SECRET;
    const expectedLength = 20; // Minimum secure length
    
    checks.cron_authentication = {
      status: cronSecret && cronSecret.length >= expectedLength ? 'healthy' : 'unhealthy',
      secret_configured: !!cronSecret,
      secret_length: cronSecret ? cronSecret.length : 0,
      timing_safe_comparison_available: typeof TextEncoder !== 'undefined'
    };
  } catch (error) {
    checks.cron_authentication = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Cron auth check failed'
    };
  }

  // 5. SEC RSS Feed Connectivity Check
  try {
    const rssTest = await testSecRssFeedConnectivity();
    checks.sec_rss_feeds = rssTest;
  } catch (error) {
    checks.sec_rss_feeds = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'SEC RSS feed check failed'
    };
  }

  // 6. Email Queue Status Check
  try {
    const emailQueueTest = await testEmailQueueStatus();
    checks.email_queue = emailQueueTest;
  } catch (error) {
    checks.email_queue = {
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Email queue check failed'
    };
  }

  // 7. Railway-Specific Environment Check
  try {
    const railwayEnvTest = await testRailwaySpecificEnvironment();
    checks.railway_environment = railwayEnvTest;
  } catch (error) {
    checks.railway_environment = {
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Railway environment check failed'
    };
  }

  // 8. Cron Job History Analysis
  try {
    const cronHistoryTest = await analyzeCronJobHistory();
    checks.cron_history = cronHistoryTest;
  } catch (error) {
    checks.cron_history = {
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Cron history analysis failed'
    };
  }

  // 9. Memory and Resource Check (Enhanced)
  try {
    const memoryUsage = process.memoryUsage();
    const freeMemoryMB = (memoryUsage.heapTotal - memoryUsage.heapUsed) / 1024 / 1024;
    
    // Railway has memory limits - check for constraints
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    const memoryThreshold = isRailway ? 100 : 50; // Higher threshold for Railway
    
    checks.resources = {
      status: freeMemoryMB > memoryThreshold ? 'healthy' : 'degraded',
      memory_usage_mb: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heap_total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heap_used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heap_free: Math.round(freeMemoryMB)
      },
      uptime_seconds: Math.round(process.uptime()),
      platform_limits: {
        is_railway: isRailway,
        memory_threshold_mb: memoryThreshold,
        potential_memory_constraint: freeMemoryMB < memoryThreshold
      }
    };
  } catch (error) {
    checks.resources = {
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Resource check failed'
    };
  }

  return checks;
}

/**
 * Test SEC API connectivity
 */
async function testSecApiConnectivity() {
  try {
    const response = await fetch('https://www.sec.gov/include/ticker.txt', {
      method: 'HEAD',
      headers: {
        'User-Agent': process.env.SEC_USER_AGENT || 'tldrSEC Health Check'
      }
    });
    
    return {
      status: response.ok ? 'healthy' : 'degraded',
      response_code: response.status,
      available: response.ok
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      available: false,
      error: error instanceof Error ? error.message : 'SEC API test failed'
    };
  }
}

/**
 * Test Anthropic API connectivity
 */
async function testAnthropicConnectivity() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        status: 'unhealthy',
        available: false,
        error: 'ANTHROPIC_API_KEY not configured'
      };
    }

    // Simple API key format validation
    const isValidFormat = apiKey.startsWith('sk-ant-') && apiKey.length > 20;
    
    return {
      status: isValidFormat ? 'healthy' : 'degraded',
      key_configured: true,
      key_format_valid: isValidFormat,
      // Don't make actual API call to avoid costs in health check
      note: 'Format validation only - no API call made'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      available: false,
      error: error instanceof Error ? error.message : 'Anthropic API test failed'
    };
  }
}

/**
 * Test Resend API connectivity
 */
async function testResendConnectivity() {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return {
        status: 'unhealthy',
        available: false,
        error: 'RESEND_API_KEY not configured'
      };
    }

    // Test Resend API with a simple GET request to domains endpoint
    const response = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return {
      status: response.ok ? 'healthy' : 'degraded',
      response_code: response.status,
      available: response.ok,
      verified_domain: response.ok ? 'tldrsec.app' : 'unknown'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      available: false,
      error: error instanceof Error ? error.message : 'Resend API test failed'
    };
  }
}

/**
 * Test SEC RSS Feed connectivity
 */
async function testSecRssFeedConnectivity() {
  try {
    const rssFeeds = [
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=10-k&company=&dateb=&owner=include&start=0&count=40&output=atom',
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=10-q&company=&dateb=&owner=include&start=0&count=40&output=atom'
    ];

    const results = [];
    for (const feed of rssFeeds) {
      const startTime = Date.now();
      try {
        const response = await fetch(feed, {
          method: 'HEAD',
          headers: {
            'User-Agent': process.env.SEC_USER_AGENT || 'tldrSEC Railway Health Check'
          }
        });
        
        results.push({
          feed_type: feed.includes('10-k') ? '10-K' : '10-Q',
          status: response.ok ? 'healthy' : 'degraded',
          response_code: response.status,
          response_time: Date.now() - startTime,
          available: response.ok
        });
      } catch (error) {
        results.push({
          feed_type: feed.includes('10-k') ? '10-K' : '10-Q',
          status: 'unhealthy',
          available: false,
          response_time: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Feed test failed'
        });
      }
    }

    const allHealthy = results.every(r => r.status === 'healthy');
    const hasUnhealthy = results.some(r => r.status === 'unhealthy');
    
    return {
      status: hasUnhealthy ? 'unhealthy' : (allHealthy ? 'healthy' : 'degraded'),
      feeds: results,
      average_response_time: Math.round(results.reduce((sum, r) => sum + (r.response_time || 0), 0) / results.length)
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'RSS feed connectivity test failed'
    };
  }
}

/**
 * Test email queue status and check for stuck jobs
 */
async function testEmailQueueStatus() {
  try {
    // Check for recent job queue entries
    const recentJobs = await prisma.jobQueue.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    });

    // Check for stuck/failed email jobs
    const stuckJobs = await prisma.jobQueue.findMany({
      where: {
        status: 'processing',
        createdAt: {
          lt: new Date(Date.now() - 30 * 60 * 1000) // Older than 30 minutes
        }
      }
    });

    const failedJobs = await prisma.jobQueue.count({
      where: {
        status: 'failed',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });

    const hasStuckJobs = stuckJobs.length > 0;
    const highFailureRate = failedJobs > 10;

    return {
      status: hasStuckJobs || highFailureRate ? 'degraded' : 'healthy',
      recent_jobs: recentJobs.length,
      stuck_jobs: stuckJobs.length,
      failed_jobs_24h: failedJobs,
      job_types_recent: [...new Set(recentJobs.map(j => j.jobType))],
      oldest_stuck_job_age_minutes: stuckJobs.length > 0 ? 
        Math.round((Date.now() - new Date(stuckJobs[0].createdAt).getTime()) / (60 * 1000)) : 0
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Email queue status check failed'
    };
  }
}

/**
 * Test Railway-specific environment configuration
 */
async function testRailwaySpecificEnvironment() {
  try {
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
    const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    const railwayProjectId = process.env.RAILWAY_PROJECT_ID;
    const railwayServiceId = process.env.RAILWAY_SERVICE_ID;

    // Check if running in Railway but missing Railway-specific vars
    const missingRailwayVars = [];
    if (isRailway) {
      if (!railwayPublicDomain) missingRailwayVars.push('RAILWAY_PUBLIC_DOMAIN');
      if (!railwayProjectId) missingRailwayVars.push('RAILWAY_PROJECT_ID');
      if (!railwayServiceId) missingRailwayVars.push('RAILWAY_SERVICE_ID');
    }

    // Check cron URL construction
    const cronUrl = railwayPublicDomain ? 
      `https://${railwayPublicDomain}/api/cron/unified` : 
      'Unable to construct - RAILWAY_PUBLIC_DOMAIN missing';

    return {
      status: isRailway && missingRailwayVars.length > 0 ? 'degraded' : 'healthy',
      is_railway_environment: isRailway,
      railway_public_domain: railwayPublicDomain || 'Not set',
      railway_project_id: railwayProjectId ? 'Set' : 'Not set',
      railway_service_id: railwayServiceId ? 'Set' : 'Not set',
      missing_railway_vars: missingRailwayVars,
      constructed_cron_url: cronUrl,
      deployment_environment: process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'unknown'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Railway environment check failed'
    };
  }
}

/**
 * Analyze cron job execution history
 */
async function analyzeCronJobHistory() {
  try {
    // Check for recent summaries (indication of successful cron runs)
    const recentSummaries = await prisma.summary.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10,
      include: {
        ticker: {
          include: {
            user: {
              select: {
                email: true
              }
            }
          }
        }
      }
    });

    // Check for recent SEC filings (indication of SEC monitoring working)
    const recentFilings = await prisma.secFiling.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      take: 5,
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate summary generation rate
    const summariesLast24h = recentSummaries.filter(
      s => s.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length;

    const summariesLast7d = recentSummaries.length;

    // Detect potential issues
    const noRecentSummaries = summariesLast24h === 0;
    const noRecentFilings = recentFilings.length === 0;
    const lowSummaryRate = summariesLast7d < 5; // Arbitrary threshold

    let status = 'healthy';
    if (noRecentSummaries && noRecentFilings) {
      status = 'unhealthy';
    } else if (noRecentSummaries || lowSummaryRate) {
      status = 'degraded';
    }

    return {
      status,
      summaries_last_24h: summariesLast24h,
      summaries_last_7d: summariesLast7d,
      recent_filings_24h: recentFilings.length,
      last_summary_created: recentSummaries.length > 0 ? recentSummaries[0].createdAt : null,
      last_filing_fetched: recentFilings.length > 0 ? recentFilings[0].createdAt : null,
      unique_users_with_summaries: [...new Set(recentSummaries.map(s => s.ticker?.user?.email))].length,
      indicators: {
        no_recent_summaries: noRecentSummaries,
        no_recent_filings: noRecentFilings,
        low_summary_rate: lowSummaryRate
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Cron history analysis failed'
    };
  }
}

/**
 * Determine overall health status from individual checks
 */
function determineOverallStatus(checks: { [key: string]: unknown }): 'healthy' | 'degraded' | 'unhealthy' {
  let hasUnhealthy = false;
  let hasDegraded = false;

  for (const [checkName, check] of Object.entries(checks)) {
    if (check.status === 'unhealthy') {
      // Critical checks that must be healthy
      if (['environment_variables', 'database', 'cron_authentication', 'sec_rss_feeds'].includes(checkName)) {
        return 'unhealthy';
      }
      hasUnhealthy = true;
    } else if (check.status === 'degraded') {
      hasDegraded = true;
    }
  }

  if (hasUnhealthy) {
    return 'unhealthy';
  } else if (hasDegraded) {
    return 'degraded';
  } else {
    return 'healthy';
  }
}