/**
 * Security Health Check API Endpoint
 * 
 * Provides real-time security monitoring data for dashboards and external systems
 */

import { NextRequest, NextResponse } from 'next/server';
import { securityMonitoring } from '@/lib/security/security-monitoring';
import { cloudflareIPService } from '@/lib/security/cloudflare-ip-service';
import { logger } from '@/lib/logging';

const healthLogger = logger.child('api-security-health');

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get comprehensive health metrics
    const healthMetrics = await securityMonitoring.getHealthMetrics();
    const threatSummary = securityMonitoring.getThreatSummary();
    const workersMetrics = securityMonitoring.getWorkersMetrics();
    const isUnderAttack = securityMonitoring.isUnderAttack();

    // Get Cloudflare service raw metrics
    const cloudflareMetrics = cloudflareIPService.getMetrics();

    const responseTime = Date.now() - startTime;

    const response = {
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      health_metrics: healthMetrics,
      threat_summary: threatSummary,
      workers_metrics: workersMetrics,
      cloudflare_raw_metrics: cloudflareMetrics,
      under_attack: isUnderAttack,
      system_info: {
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        node_version: process.version,
        platform: process.platform
      }
    };

    healthLogger.info('Health check completed', {
      response_time_ms: responseTime,
      overall_status: healthMetrics.overall_status,
      alert_level: healthMetrics.alert_level,
      under_attack: isUnderAttack,
      workers_requests: workersMetrics.total_requests
    });

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const responseTime = Date.now() - startTime;

    healthLogger.error('Health check failed', {
      error: errorMessage,
      response_time_ms: responseTime
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      error: 'Health check failed',
      details: errorMessage,
      status: 'unhealthy'
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
}

/**
 * Lightweight health check for monitoring systems
 */
export async function HEAD(request: NextRequest) {
  try {
    const metrics = await securityMonitoring.getHealthMetrics();
    
    const status = metrics.overall_status === 'healthy' ? 200 :
                  metrics.overall_status === 'degraded' ? 200 : 503;

    return new NextResponse(null, {
      status,
      headers: {
        'X-Health-Status': metrics.overall_status,
        'X-Alert-Level': metrics.alert_level,
        'X-Cloudflare-Status': metrics.cloudflare_ip_service.status,
        'X-Performance-Score': metrics.performance_score.toString(),
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    healthLogger.error('HEAD health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return new NextResponse(null, {
      status: 503,
      headers: {
        'X-Health-Status': 'unhealthy',
        'Cache-Control': 'no-cache'
      }
    });
  }
}