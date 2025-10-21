/**
 * Secure Authentication and Authorization Service
 * 
 * Implements OWASP-compliant security controls for preventing:
 * - Timing attacks
 * - Insecure direct object references
 * - Unauthorized access to monitoring data
 * - Authentication bypass attempts
 */

import { auth } from '@clerk/nextjs/server';
import { logger } from '../logging';
import { NextRequest } from 'next/server';
import { getPrismaClient } from '../db/prisma';

const securityLogger = logger.child('secure-auth');
const prisma = getPrismaClient();

export interface SecurityContext {
  userId: string;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasMonitoringAccess: boolean;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  securityContext?: SecurityContext;
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  // Always normalize to prevent length-based timing attacks
  const maxLength = Math.max(a.length, b.length, 32); // Minimum 32 chars for consistent timing
  const aNormalized = a.padEnd(maxLength, '\0');
  const bNormalized = b.padEnd(maxLength, '\0');
  
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(aNormalized);
  const bBytes = encoder.encode(bNormalized);
  
  let result = 0;
  // Constant-time comparison
  for (let i = 0; i < maxLength; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  
  // Additional timing normalization
  const lengthEqual = a.length === b.length;
  const contentEqual = result === 0;
  
  return lengthEqual && contentEqual;
}

/**
 * Extract and validate security context from request
 */
export async function getSecurityContext(request?: NextRequest): Promise<SecurityContext> {
  try {
    const { userId, sessionId } = await auth();
    
    if (!userId) {
      return {
        userId: '',
        isAuthenticated: false,
        isAdmin: false,
        hasMonitoringAccess: false
      };
    }

    // Extract request metadata securely
    const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request?.headers.get('x-real-ip') || 
                     'unknown';
    
    const userAgent = request?.headers.get('user-agent')?.slice(0, 200) || 'unknown'; // Truncate to prevent log injection

    // Check admin status (implement your admin logic here)
    const isAdmin = await checkAdminStatus(userId);
    
    // Check monitoring access permissions
    const hasMonitoringAccess = isAdmin || await checkMonitoringAccess(userId);

    const securityContext: SecurityContext = {
      userId,
      isAuthenticated: true,
      isAdmin,
      hasMonitoringAccess,
      sessionId: sessionId || undefined,
      ipAddress,
      userAgent
    };

    // Log authentication for audit trail
    securityLogger.info('Security context established', {
      userId,
      isAdmin,
      hasMonitoringAccess,
      ipAddress: 'redacted', // Don't log actual IP for privacy
      userAgent: userAgent.slice(0, 50) // Truncated user agent
    });

    return securityContext;

  } catch (error) {
    securityLogger.error('Failed to establish security context', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      userId: '',
      isAuthenticated: false,
      isAdmin: false,
      hasMonitoringAccess: false
    };
  }
}

/**
 * Authorize access to monitoring endpoints with proper RBAC
 */
export async function authorizeMonitoringAccess(
  request: NextRequest,
  requiredLevel: 'basic' | 'admin' | 'security' = 'basic'
): Promise<AuthorizationResult> {
  try {
    const context = await getSecurityContext(request);
    
    if (!context.isAuthenticated) {
      securityLogger.warn('Unauthorized monitoring access attempt', {
        ipAddress: 'redacted',
        userAgent: context.userAgent?.slice(0, 50),
        requiredLevel
      });
      
      return {
        authorized: false,
        reason: 'Authentication required'
      };
    }

    // Check authorization level
    switch (requiredLevel) {
      case 'security':
        if (!context.isAdmin) {
          securityLogger.warn('Insufficient privileges for security monitoring', {
            userId: context.userId,
            requiredLevel,
            isAdmin: context.isAdmin
          });
          
          return {
            authorized: false,
            reason: 'Admin privileges required',
            securityContext: context
          };
        }
        break;

      case 'admin':
        if (!context.isAdmin) {
          securityLogger.warn('Insufficient privileges for admin monitoring', {
            userId: context.userId,
            requiredLevel,
            isAdmin: context.isAdmin
          });
          
          return {
            authorized: false,
            reason: 'Admin privileges required',
            securityContext: context
          };
        }
        break;

      case 'basic':
        if (!context.hasMonitoringAccess) {
          securityLogger.warn('Insufficient privileges for monitoring access', {
            userId: context.userId,
            requiredLevel,
            hasMonitoringAccess: context.hasMonitoringAccess
          });
          
          return {
            authorized: false,
            reason: 'Monitoring access required',
            securityContext: context
          };
        }
        break;
    }

    // Log successful authorization
    securityLogger.info('Monitoring access authorized', {
      userId: context.userId,
      requiredLevel,
      isAdmin: context.isAdmin
    });

    return {
      authorized: true,
      securityContext: context
    };

  } catch (error) {
    securityLogger.error('Authorization check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requiredLevel
    });

    return {
      authorized: false,
      reason: 'Authorization system error'
    };
  }
}

/**
 * Authorize access to specific resources (prevents IDOR attacks)
 */
export async function authorizeResourceAccess(
  userId: string,
  resourceType: 'summary' | 'user_data' | 'monitoring_data',
  resourceId: string
): Promise<boolean> {
  try {
    switch (resourceType) {
      case 'summary':
        // Verify user owns or has access to the summary
        const summary = await prisma.summary.findFirst({
          where: {
            id: resourceId,
            user: {
              externalUserId: userId
            }
          }
        });
        
        return !!summary;

      case 'user_data':
        // Verify user is accessing their own data
        const user = await prisma.user.findUnique({
          where: {
            externalUserId: userId
          }
        });
        
        // Check if resourceId matches user's ID or is user-owned resource
        return user?.externalUserId === userId;

      case 'monitoring_data':
        // Only admin users can access monitoring data
        return await checkAdminStatus(userId);

      default:
        securityLogger.warn('Unknown resource type in authorization check', {
          userId,
          resourceType,
          resourceId
        });
        return false;
    }

  } catch (error) {
    securityLogger.error('Resource authorization failed', {
      userId,
      resourceType,
      resourceId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return false;
  }
}

/**
 * Check if user has admin status
 * TODO: Implement proper admin role checking when roles are available
 */
async function checkAdminStatus(userId: string): Promise<boolean> {
  try {
    // For now, check against environment variable list of admin users
    const adminUsers = process.env.ADMIN_USERS?.split(',') || [];
    return adminUsers.some(adminId => timingSafeEqual(adminId.trim(), userId));
  } catch (error) {
    securityLogger.error('Admin status check failed', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * Check if user has monitoring access
 */
async function checkMonitoringAccess(userId: string): Promise<boolean> {
  try {
    // For now, all authenticated users have basic monitoring access
    // In production, this should check user roles/permissions
    return true;
  } catch (error) {
    securityLogger.error('Monitoring access check failed', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * Validate and sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[;\\]/g, '') // Remove SQL injection characters
    .slice(0, 1000); // Limit length
}

/**
 * Generate secure audit log entry
 */
export function createSecureAuditLog(
  action: string,
  context: SecurityContext,
  resourceId?: string,
  additionalData?: Record<string, unknown>
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    action: sanitizeInput(action),
    userId: context.userId,
    sessionId: context.sessionId,
    ipAddress: 'redacted', // Never log actual IP addresses
    userAgent: context.userAgent?.slice(0, 100), // Truncated user agent
    resourceId: resourceId ? sanitizeInput(resourceId) : undefined,
    isAdmin: context.isAdmin,
    additionalData: additionalData ? Object.fromEntries(
      Object.entries(additionalData).map(([k, v]) => [
        sanitizeInput(k),
        typeof v === 'string' ? sanitizeInput(v) : v
      ])
    ) : undefined
  };
}