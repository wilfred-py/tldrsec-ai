import { NextResponse } from 'next/server';
import { monitoring } from '@/lib/monitoring';
import { appRouterAsyncHandler, createForbiddenError } from '@/lib/error-handling';
import { logger } from '@/lib/logging';

// Component logger
const componentLogger = logger.child('metrics-api');

/**
 * Metrics endpoint
 * GET /api/metrics
 * 
 * Returns collected metrics in JSON format
 * Protected by API key to prevent public access to potentially sensitive data
 */
export const GET = appRouterAsyncHandler(async (request: Request) => {
  const startTime = Date.now();
  
  // Check API key for security
  const apiKey = request.headers.get('x-api-key');
  const configuredApiKey = process.env.METRICS_API_KEY;
  
  // If METRICS_API_KEY is set, require authentication
  if (configuredApiKey && apiKey !== configuredApiKey) {
    componentLogger.warn(`Unauthorized metrics access attempt`, {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    throw createForbiddenError('Invalid API key');
  }
  
  // Get all metrics
  const metrics = monitoring.getAllMetrics();
  
  // Process the URL parameters
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const format = searchParams.get('format') || 'json';
  const last = searchParams.get('last') ? parseInt(searchParams.get('last') || '10', 10) : undefined;
  
  // Filter metrics by name if provided
  let filteredMetrics = metrics;
  if (name) {
    filteredMetrics = metrics.filter(metric => metric.name === name);
  }
  
  // Filter the number of values to include
  filteredMetrics = filteredMetrics.map(metric => ({
    ...metric,
    values: last ? metric.values.slice(-last) : metric.values
  }));
  
  // Log metrics access
  componentLogger.info(`Metrics accessed`, {
    count: filteredMetrics.length,
    nameFilter: name || 'none',
    format,
    responseTime: Date.now() - startTime
  });
  
  // Track this API call
  monitoring.trackApiCall('/api/metrics', 'GET', 200, startTime);
  
  // Return metrics in the requested format
  if (format === 'prometheus') {
    // Simple Prometheus text format for compatibility with Prometheus scrapers
    const promText = filteredMetrics.map(metric => {
      const metricLines = [];
      
      // Add metric help and type
      metricLines.push(`# HELP ${metric.name} ${metric.description || 'No description'}`);
      metricLines.push(`# TYPE ${metric.name} ${metric.unit === 'ms' ? 'gauge' : 'counter'}`);
      
      // Add metric values
      for (const value of metric.values) {
        let metricName = metric.name;
        
        // Add labels if present
        let labels = '';
        if (value.tags && Object.keys(value.tags).length > 0) {
          labels = `{${Object.entries(value.tags)
            .map(([key, val]) => `${key}="${val}"`)
            .join(',')}}`;
        }
        
        // Add the metric line
        metricLines.push(`${metricName}${labels} ${value.value}`);
      }
      
      return metricLines.join('\n');
    }).join('\n\n');
    
    return new Response(promText, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  }
  
  // Default to JSON format
  return NextResponse.json({
    metrics: filteredMetrics,
    timestamp: new Date().toISOString(),
    count: filteredMetrics.length
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}); 