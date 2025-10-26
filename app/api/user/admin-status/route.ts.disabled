import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/auth/admin-security';
import { logger } from '@/lib/logging';

const adminLogger = logger.child('admin-status-api');

/**
 * Secure API endpoint to check admin privileges with comprehensive security validation
 * 
 * GET /api/user/admin-status
 * 
 * Returns admin status with security context, warnings, and audit logging.
 * Implements fail-secure access control with timing-safe comparisons.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Comprehensive admin access validation
    const adminContext = await validateAdminAccess(request, 'READ_ONLY', 'ADMIN_STATUS_CHECK');
    
    // Always return consistent response structure (prevent timing attacks)
    const response = {
      isAdmin: adminContext.isAdmin,
      adminLevel: adminContext.isAdmin ? adminContext.adminLevel : 'NONE',
      sessionValid: adminContext.sessionValid,
      timestamp: new Date().toISOString(),
      // Include security warnings for admin users only
      securityWarnings: adminContext.isAdmin ? adminContext.securityWarnings : undefined,
      // Session info for admin users
      lastActivity: adminContext.isAdmin ? adminContext.lastActivity : undefined,
      mfaRequired: adminContext.mfaRequired
    };
    
    // Add processing time for monitoring (but not exposed to client)
    const processingTime = Date.now() - startTime;
    adminLogger.info('Admin status check completed', {
      isAdmin: adminContext.isAdmin,
      adminLevel: adminContext.adminLevel,
      processingTime,
      securityWarnings: adminContext.securityWarnings?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(response);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    adminLogger.error('Admin status check failed', { 
      error: error instanceof Error ? error.message : 'unknown',
      processingTime,
      timestamp: new Date().toISOString()
    });

    // Always return consistent error response (prevent information leakage)
    return NextResponse.json(
      { 
        isAdmin: false,
        adminLevel: 'NONE',
        sessionValid: false,
        timestamp: new Date().toISOString(),
        error: 'Access validation failed'
      },
      { status: 403 } // Use 403 instead of 500 for security
    );
  }
}