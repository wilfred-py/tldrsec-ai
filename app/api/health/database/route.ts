import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getPrismaClient } from '@/lib/db/prisma';
import { dbRetry } from '@/lib/db/retry-wrapper';
import { databaseMonitoring } from '@/lib/db/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rate limiting storage (in-memory for simplicity - in production use Redis)
const requestCounts = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute per IP

// Allowed IP ranges for internal monitoring (expand as needed)
const ALLOWED_IP_RANGES = [
  '127.0.0.1',     // localhost
  '::1',           // localhost IPv6
  '10.0.0.0/8',    // private networks
  '172.16.0.0/12', // private networks
  '192.168.0.0/16' // private networks
];

/**
 * Check if IP is in allowed ranges
 */
function isAllowedIP(ip: string): boolean {
  // For development, allow localhost
  if (process.env.NODE_ENV === 'development') {
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
  }
  
  // Check if IP matches allowed ranges
  return ALLOWED_IP_RANGES.some(range => {
    if (range.includes('/')) {
      // CIDR notation - simplified check (in production use proper CIDR library)
      const [network, prefixLength] = range.split('/');
      return ip.startsWith(network.split('.').slice(0, parseInt(prefixLength) / 8).join('.'));
    }
    return ip === range;
  });
}

/**
 * Apply rate limiting
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const clientData = requestCounts.get(ip);
  
  if (!clientData) {
    requestCounts.set(ip, { count: 1, lastReset: now });
    return true;
  }
  
  // Reset counter if window has passed
  if (now - clientData.lastReset > RATE_LIMIT_WINDOW) {
    clientData.count = 1;
    clientData.lastReset = now;
    return true;
  }
  
  // Check if under limit
  if (clientData.count < RATE_LIMIT_MAX_REQUESTS) {
    clientData.count++;
    return true;
  }
  
  return false;
}

/**
 * GET /api/health/database
 * Secured database health check endpoint with access controls
 */
export async function GET() {
  const prisma = getPrismaClient();
  const startTime = Date.now();
  
  // Get client IP address
  const headersList = await headers();
  const clientIP = headersList.get('x-forwarded-for')?.split(',')[0] || 
                   headersList.get('x-real-ip') || 
                   '127.0.0.1';
  
  // Security checks
  if (!isAllowedIP(clientIP)) {
    console.warn(`Health check access denied from IP: ${clientIP}`);
    return NextResponse.json({
      error: 'Access denied'
    }, { status: 403 });
  }
  
  if (!checkRateLimit(clientIP)) {
    console.warn(`Rate limit exceeded for IP: ${clientIP}`);
    return NextResponse.json({
      error: 'Rate limit exceeded'
    }, { status: 429 });
  }
  
  // Log access for security monitoring
  console.info(`Database health check accessed from IP: ${clientIP}`);
  
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
    
    // Track successful health check
    databaseMonitoring.trackHealthCheck(true, duration, result.userCount);
    
    // Sanitized response - remove sensitive information
    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      responseTime: `${duration}ms`,
      // Only include user count ranges for privacy
      userActivity: result.userCount > 0 ? 'active' : 'inactive',
      // Remove exact server time to prevent timing attacks
      serverStatus: 'online'
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Track failed health check
    databaseMonitoring.trackHealthCheck(false, duration);
    
    // Log detailed error for internal monitoring
    console.error('Database health check failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      clientIP,
      duration
    });
    
    // Return sanitized error response
    return NextResponse.json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      responseTime: `${duration}ms`,
      // Don't expose internal error details
      message: 'Database connectivity issue detected'
    }, { status: 503 });
  }
}