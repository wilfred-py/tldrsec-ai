import { NextResponse } from 'next/server';
import { logger } from '@/lib/logging';

// Infrastructure health check endpoint
// This endpoint provides critical infrastructure status for monitoring systems

const healthLogger = logger.child('api-health-infrastructure');

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    cloudflare_worker: {
      status: 'up' | 'down';  
      lastExecution?: string;
      error?: string;
    };
    external_apis: {
      claude_api: {
        status: 'up' | 'down';
        responseTime?: number;
      };
      resend_api: {
        status: 'up' | 'down';
        responseTime?: number;
      };
      sec_edgar: {
        status: 'up' | 'down';
        responseTime?: number;
      };
    };
    vercel_deployment: {
      status: 'up' | 'down';
      region?: string;
      deployment_id?: string;
    };
  };
  timestamp: string;
  uptime_seconds: number;
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    healthLogger.info('Starting infrastructure health check');
    
    const healthResult: HealthCheckResult = {
      status: 'healthy',
      checks: {
        database: { status: 'up' },
        cloudflare_worker: { status: 'up' },
        external_apis: {
          claude_api: { status: 'up' },
          resend_api: { status: 'up' },
          sec_edgar: { status: 'up' }
        },
        vercel_deployment: { status: 'up' }
      },
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime())
    };

    // 1. Database Health Check
    try {
      const dbStart = Date.now();
      
      // Import dynamically to avoid build-time issues
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$disconnect();
      
      healthResult.checks.database = {
        status: 'up',
        responseTime: Date.now() - dbStart
      };
      
      healthLogger.debug('Database health check passed', {
        responseTime: healthResult.checks.database.responseTime
      });
      
    } catch (error) {
      healthLogger.error('Database health check failed', { error });
      healthResult.checks.database = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
      healthResult.status = 'unhealthy';
    }

    // 2. External API Health Checks
    try {
      // Claude API check
      const claudeStart = Date.now();
      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ANTHROPIC_API_KEY || 'test',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }]
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      healthResult.checks.external_apis.claude_api = {
        status: claudeResponse.ok ? 'up' : 'down',
        responseTime: Date.now() - claudeStart
      };
      
    } catch {
      healthResult.checks.external_apis.claude_api = {
        status: 'down',
        responseTime: 5000
      };
      healthResult.status = 'degraded';
    }

    // 3. SEC EDGAR Health Check  
    try {
      const secStart = Date.now();
      const secResponse = await fetch('https://www.sec.gov/files/company_tickers.json', {
        headers: {
          'User-Agent': process.env.SEC_USER_AGENT || 'TLDRSEC contact@tldrsec.app'
        },
        signal: AbortSignal.timeout(10000)
      });
      
      healthResult.checks.external_apis.sec_edgar = {
        status: secResponse.ok ? 'up' : 'down',
        responseTime: Date.now() - secStart
      };
      
    } catch {
      healthResult.checks.external_apis.sec_edgar = {
        status: 'down',
        responseTime: 10000
      };
      healthResult.status = 'degraded';
    }

    // 4. Resend API Health Check
    try {
      const resendStart = Date.now();
      const resendResponse = await fetch('https://api.resend.com/domains', {
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        signal: AbortSignal.timeout(5000)
      });
      
      healthResult.checks.external_apis.resend_api = {
        status: resendResponse.ok ? 'up' : 'down',
        responseTime: Date.now() - resendStart
      };
      
    } catch {
      healthResult.checks.external_apis.resend_api = {
        status: 'down',
        responseTime: 5000
      };
      healthResult.status = 'degraded';
    }

    // 5. Vercel Deployment Info
    healthResult.checks.vercel_deployment = {
      status: 'up',
      region: process.env.VERCEL_REGION || 'unknown',
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID || 'unknown'
    };

    const totalTime = Date.now() - startTime;
    
    healthLogger.info('Infrastructure health check completed', {
      status: healthResult.status,
      duration: totalTime,
      checks: Object.keys(healthResult.checks).length
    });

    // Return appropriate HTTP status based on health
    const httpStatus = healthResult.status === 'healthy' ? 200 :
                      healthResult.status === 'degraded' ? 200 : 503;

    return NextResponse.json(healthResult, { status: httpStatus });
    
  } catch (error) {
    const errorTime = Date.now() - startTime;
    
    healthLogger.error('Infrastructure health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: errorTime
    });

    return NextResponse.json({
      status: 'unhealthy',
      error: 'Health check system failure',
      timestamp: new Date().toISOString(),
      duration: errorTime
    }, { status: 503 });
  }
}

// HEAD request for simple health check (for load balancers)
export async function HEAD() {
  try {
    // Quick database ping
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}