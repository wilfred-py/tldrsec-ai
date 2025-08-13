import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { logger } from '@/lib/logging';

const adminLogger = logger.child('admin-status-api');

/**
 * API endpoint to check if current user has admin privileges
 * 
 * GET /api/user/admin-status
 * 
 * Returns admin status for the authenticated user without exposing
 * admin email or other sensitive configuration to the client.
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user is admin (server-side only)
    const adminEmail = process.env.ADMIN_EMAIL;
    const userEmail = user.emailAddresses[0]?.emailAddress;
    
    if (!adminEmail) {
      adminLogger.warn('ADMIN_EMAIL environment variable not configured');
      return NextResponse.json({ isAdmin: false });
    }

    const isAdmin = userEmail === adminEmail;

    // Audit log admin status checks
    adminLogger.info('Admin status check', {
      userId: user.id,
      userEmail: userEmail,
      isAdmin,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ip: request.ip || request.headers.get('x-forwarded-for')
    });

    return NextResponse.json({ 
      isAdmin,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    adminLogger.error('Error checking admin status', { error });

    return NextResponse.json(
      { 
        error: 'Failed to check admin status',
        isAdmin: false
      },
      { status: 500 }
    );
  }
}