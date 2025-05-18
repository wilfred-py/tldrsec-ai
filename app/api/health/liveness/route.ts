import { NextResponse } from 'next/server';
import { monitoring } from '@/lib/monitoring';
import { appRouterAsyncHandler } from '@/lib/error-handling';

/**
 * Simple liveness probe for Kubernetes/container environments
 * GET /api/health/liveness
 */
export const GET = appRouterAsyncHandler(async (request: Request) => {
  const startTime = Date.now();
  
  // For liveness, we just check if the application is running
  // No need for detailed checks
  
  // Track this API call
  monitoring.trackApiCall('/api/health/liveness', 'GET', 200, startTime);
  
  return NextResponse.json({ 
    status: 'alive',
    timestamp: new Date().toISOString() 
  });
}); 