/**
 * Security Monitoring Dashboard API
 * 
 * Provides real-time security metrics and threat intelligence
 * with comprehensive rate limiting and access controls
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeMonitoringAccess } from '@/lib/security/secure-auth';
import { logSecureAudit, getAuditStatistics, verifyAuditIntegrity } from '@/lib/security/audit-protection';
import { rateLimiter } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logging';
import { pipelineErrorDetector } from '@/lib/monitoring/pipeline-error-detector';

const securityLogger = logger.child('security-dashboard');

/**
 * GET /api/security/dashboard
 * 
 * Returns comprehensive security dashboard data
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // SECURITY: Enhanced rate limiting for dashboard access
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    const rateLimitResult = await rateLimiter.checkLimit(
      'security-dashboard',
      clientIP,
      20, // 20 requests per minute
      60000 // 1 minute window
    );
    
    if (!rateLimitResult.allowed) {
      securityLogger.warn('Security dashboard rate limit exceeded', { 
        clientIP: 'redacted',
        remaining: rateLimitResult.remaining 
      });
      
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          retry_after: 60
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': '20',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            'Retry-After': '60'
          }
        }
      );
    }

    // SECURITY: Verify authorization with proper RBAC
    const authResult = await authorizeMonitoringAccess(request, 'admin');
    
    if (!authResult.authorized) {
      securityLogger.warn('Unauthorized access attempt to security dashboard', {
        reason: authResult.reason,
        hasContext: !!authResult.securityContext
      });
      
      // Log security incident
      if (authResult.securityContext) {
        await logSecureAudit(
          'UNAUTHORIZED_DASHBOARD_ACCESS',
          authResult.securityContext.userId || 'anonymous',
          authResult.securityContext.ipAddress || 'unknown',
          'security_dashboard',
          authResult.securityContext.userAgent
        );
      }
      
      return NextResponse.json(
        { error: authResult.reason || 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { securityContext } = authResult;
    if (!securityContext) {
      return NextResponse.json({ error: 'Invalid security context' }, { status: 500 });
    }

    // Log authorized access
    await logSecureAudit(
      'SECURITY_DASHBOARD_ACCESS',
      securityContext.userId,
      securityContext.ipAddress || 'unknown',
      'security_dashboard',
      securityContext.userAgent
    );

    // Gather comprehensive security metrics
    const [
      pipelineReport,
      auditStats,
      auditIntegrity
    ] = await Promise.allSettled([
      pipelineErrorDetector.generateDetectionReport(),
      getAuditStatistics(),
      verifyAuditIntegrity()
    ]);

    // Build security dashboard response
    const dashboard = {
      timestamp: new Date().toISOString(),
      user: {
        id: securityContext.userId,
        isAdmin: securityContext.isAdmin,
        hasMonitoringAccess: securityContext.hasMonitoringAccess
      },
      
      // Pipeline Security Metrics
      pipeline_security: pipelineReport.status === 'fulfilled' ? {
        health_score: pipelineReport.value.overallHealthScore,
        active_alerts: pipelineReport.value.activeAlerts.length,
        critical_alerts: pipelineReport.value.activeAlerts.filter(a => a.severity === 'critical').length,
        security_alerts: pipelineReport.value.activeAlerts.filter(a => a.type === 'security').length,
        last_security_incident: pipelineReport.value.activeAlerts
          .filter(a => a.type === 'security')
          .sort((a, b) => b.lastDetected.getTime() - a.lastDetected.getTime())[0]?.lastDetected,
        trends: pipelineReport.value.trends
      } : {
        error: 'Failed to fetch pipeline security metrics'
      },
      
      // Audit Log Security
      audit_security: auditStats.status === 'fulfilled' && auditIntegrity.status === 'fulfilled' ? {
        total_entries: auditStats.value.totalEntries,
        entries_last_24h: auditStats.value.entriesLast24h,
        failed_entries: auditStats.value.failedEntries,
        chain_valid: auditIntegrity.value.isValid,
        tampered_entries: auditIntegrity.value.tamperedEntries.length,
        last_integrity_check: auditStats.value.lastIntegrityCheck,
        integrity_score: auditIntegrity.value.isValid ? 100 : 
          Math.max(0, 100 - (auditIntegrity.value.tamperedEntries.length * 10))
      } : {
        error: 'Failed to fetch audit security metrics'
      },
      
      // System Security Status
      system_security: {
        under_attack: false, // Would integrate with threat detection
        security_level: calculateSecurityLevel(pipelineReport, auditIntegrity),
        last_security_scan: new Date().toISOString(),
        active_protections: [
          'rate_limiting',
          'timing_attack_protection',
          'sql_injection_prevention',
          'audit_log_integrity',
          'rbac_authorization',
          'secure_headers'
        ]
      },
      
      // Rate Limiting Status
      rate_limiting: {
        client_remaining: rateLimitResult.remaining,
        client_reset_time: rateLimitResult.resetTime,
        active_limits: [
          { endpoint: 'security-dashboard', limit: 20, window: '1m' },
          { endpoint: 'health-api', limit: 30, window: '1m' },
          { endpoint: 'monitoring-api', limit: 100, window: '1h' }
        ]
      },
      
      // Response metadata
      meta: {
        response_time_ms: Date.now() - startTime,
        generated_at: new Date().toISOString(),
        version: '1.0.0'
      }
    };

    // Log successful dashboard access
    securityLogger.info('Security dashboard data provided', {
      userId: securityContext.userId,
      responseTime: Date.now() - startTime,
      healthScore: typeof dashboard.pipeline_security === 'object' && 'health_score' in dashboard.pipeline_security 
        ? dashboard.pipeline_security.health_score : 'unknown',
      auditIntegrity: typeof dashboard.audit_security === 'object' && 'chain_valid' in dashboard.audit_security
        ? dashboard.audit_security.chain_valid : 'unknown'
    });

    return NextResponse.json(dashboard, {
      status: 200,
      headers: {
        // Security headers
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        
        // Rate limiting headers
        'X-RateLimit-Limit': '20',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString()
      }
    });

  } catch (error) {
    securityLogger.error('Security dashboard error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime
    });

    return NextResponse.json(
      { 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate overall security level based on various metrics
 */
function calculateSecurityLevel(
  pipelineReport: PromiseSettledResult<{
    overallHealthScore: number;
    activeAlerts: Array<{ severity: string; type: string; lastDetected: Date }>;
  }>,
  auditIntegrity: PromiseSettledResult<{
    isValid: boolean;
    tamperedEntries: unknown[];
  }>
): 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL' {
  let score = 100;

  // Deduct for pipeline issues
  if (pipelineReport.status === 'fulfilled') {
    const criticalAlerts = pipelineReport.value.activeAlerts?.filter((a) => a.severity === 'critical').length || 0;
    const securityAlerts = pipelineReport.value.activeAlerts?.filter((a) => a.type === 'security').length || 0;
    
    score -= criticalAlerts * 20;
    score -= securityAlerts * 15;
  } else {
    score -= 30; // Pipeline monitoring failure
  }

  // Deduct for audit integrity issues
  if (auditIntegrity.status === 'fulfilled') {
    if (!auditIntegrity.value.isValid) {
      score -= 40; // Audit tampering is critical
    }
    score -= auditIntegrity.value.tamperedEntries?.length * 10 || 0;
  } else {
    score -= 25; // Audit verification failure
  }

  // Determine security level
  if (score >= 90) return 'HIGH';
  if (score >= 70) return 'MEDIUM';
  if (score >= 40) return 'LOW';
  return 'CRITICAL';
}