import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { dbRetry } from '@/lib/db/retry-wrapper';

/**
 * GET /api/health/database
 * Database health check endpoint with cold start handling
 */
export async function GET() {
  const startTime = Date.now();
  
  try {
    // Test database connection with retry logic
    const result = await dbRetry.healthCheck(async () => {
      const [dbTime, userCount] = await Promise.all([
        prisma.$queryRaw`SELECT NOW() as current_time`,
        prisma.user.count()
      ]);
      return { dbTime, userCount };
    });
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      responseTime: `${duration}ms`,
      userCount: result.userCount,
      serverTime: result.dbTime
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error('Database health check failed:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      responseTime: `${duration}ms`
    }, { status: 503 });
  }
}