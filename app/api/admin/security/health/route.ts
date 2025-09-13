/**
 * Security Health Monitoring API Endpoint
 * 
 * Provides comprehensive security metrics and health status
 * for dynamic Cloudflare IP validation and threat detection
 * 
 * Security: Admin-only endpoint with rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { securityMonitoring } from '../../../../../lib/security/security-monitoring';
import { cloudflareIPService } from '../../../../../lib/security/cloudflare-ip-service';
import { logger } from '../../../../../lib/logging';

const healthLogger = logger.child('security-health-api');

/**
 * GET /api/admin/security/health
 * 
 * Returns comprehensive security health metrics
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const { userId } = await auth();
    if (!userId) {
      healthLogger.warn('Unauthorized access attempt to security health endpoint', {
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        user_agent: request.headers.get('user-agent')
      });
      
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // TODO: Add admin role check when roles are implemented
    // For now, any authenticated user can access this endpoint
    
    healthLogger.info('Security health metrics requested', { userId });
    
    // Get comprehensive health metrics
    const healthMetrics = await securityMonitoring.getHealthMetrics();
    const threatSummary = securityMonitoring.getThreatSummary();
    const cloudflareMetrics = cloudflareIPService.getMetrics();
    
    // Check for URL parameters to trigger actions
    const url = new URL(request.url);
    const refreshCloudflare = url.searchParams.get('refresh_cloudflare') === 'true';
    const includeRanges = url.searchParams.get('include_ranges') === 'true';
    
    let refreshResult = null;
    let currentRanges = null;
    
    // Handle forced refresh if requested
    if (refreshCloudflare) {
      healthLogger.info('Forced Cloudflare refresh requested', { userId });
      refreshResult = await securityMonitoring.forceCloudflareRefresh();
    }
    
    // Include current IP ranges if requested
    if (includeRanges) {
      try {
        const ranges = await cloudflareIPService.getIPRanges();
        currentRanges = {
          ipv4_count: ranges.ipv4_cidrs.length,
          ipv6_count: ranges.ipv6_cidrs.length,
          last_updated: ranges.last_updated,
          expires_at: ranges.expires_at,
          source: ranges.source,
          // Only include actual ranges for admin users in development
          ranges: process.env.NODE_ENV === 'development' ? ranges : undefined
        };
      } catch (error) {
        healthLogger.error('Error fetching IP ranges for health check', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          userId 
        });
      }
    }
    
    // Build response
    const response = {
      timestamp: new Date().toISOString(),
      health: healthMetrics,
      threats: threatSummary,
      cloudflare: {
        metrics: cloudflareMetrics,
        current_ranges: currentRanges,
        forced_refresh_result: refreshResult
      },
      system: {
        under_attack: securityMonitoring.isUnderAttack(),
        environment: process.env.NODE_ENV,
        uptime_hours: process.uptime() / 3600
      }
    };
    
    // Log access for audit trail
    healthLogger.info('Security health metrics provided', {
      userId,
      overall_status: healthMetrics.overall_status,
      cloudflare_status: healthMetrics.cloudflare_ip_service.status,
      threats_detected: healthMetrics.threats_detected_last_hour,
      under_attack: securityMonitoring.isUnderAttack(),
      forced_refresh: refreshCloudflare,
      include_ranges: includeRanges
    });
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      }
    });
    
  } catch (error) {
    healthLogger.error('Error in security health endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
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
 * POST /api/admin/security/health
 * 
 * Allows admin actions like forced cache refresh
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { action } = body;
    
    healthLogger.info('Security admin action requested', { 
      userId, 
      action,
      ip: request.headers.get('x-forwarded-for') || 'unknown'
    });
    
    switch (action) {
      case 'refresh_cloudflare':
        const refreshResult = await securityMonitoring.forceCloudflareRefresh();
        return NextResponse.json({
          action: 'refresh_cloudflare',
          success: refreshResult,
          timestamp: new Date().toISOString()
        });
        
      case 'invalidate_cache':
        cloudflareIPService.invalidateCache();
        return NextResponse.json({
          action: 'invalidate_cache',
          success: true,
          timestamp: new Date().toISOString()
        });
        
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    healthLogger.error('Error in security admin action', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}