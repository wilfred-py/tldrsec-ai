import { currentUser } from '@clerk/nextjs/server';
import { logger } from '@/lib/logging';
import { prisma } from '@/lib/db';
// Web Crypto API for Edge Runtime compatibility

/**
 * Create SHA256 hash using Web Crypto API
 */
async function createHashSHA256(input: string, length: number = 8): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, length);
}

const adminSecurityLogger = logger.child('admin-security');

// Admin security configuration
// const ADMIN_SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes (reserved for future use)
// const MAX_ADMIN_FAILURES = 3; // (reserved for future use)
// const ADMIN_LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes (reserved for future use)
const ADMIN_ACTIONS_REQUIRING_MFA = [
  'USER_DELETE',
  'BUDGET_RESET',
  'TIER_OVERRIDE',
  'SYSTEM_CONFIG_CHANGE'
];

interface AdminContext {
  isAdmin: boolean;
  adminLevel: 'NONE' | 'READ_ONLY' | 'OPERATOR' | 'SUPER_ADMIN';
  sessionValid: boolean;
  mfaRequired: boolean;
  lastActivity: Date;
  securityWarnings: string[];
}

interface AdminSecurityCheck {
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  action?: string;
  timestamp: Date;
}

/**
 * Comprehensive admin access validation with multiple security layers
 */
export async function validateAdminAccess(
  request: Request,
  requiredLevel: 'READ_ONLY' | 'OPERATOR' | 'SUPER_ADMIN' = 'READ_ONLY',
  action?: string
): Promise<AdminContext> {
  const securityCheck: AdminSecurityCheck = {
    userId: '',
    userEmail: '',
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || 'unknown',
    action,
    timestamp: new Date()
  };

  try {
    // 1. Authenticate user
    const user = await currentUser();
    if (!user) {
      await logSecurityEvent('ADMIN_AUTH_FAILED', { ...securityCheck, reason: 'not_authenticated' });
      return createDeniedContext('Authentication required');
    }

    securityCheck.userId = user.id;
    securityCheck.userEmail = user.emailAddresses[0]?.emailAddress || '';

    // 2. Check user lockout status
    const lockoutStatus = await checkAdminLockout(user.id);
    if (lockoutStatus.isLocked) {
      await logSecurityEvent('ADMIN_ACCESS_BLOCKED', { 
        ...securityCheck, 
        reason: 'user_locked',
        unlockTime: lockoutStatus.unlockTime 
      });
      return createDeniedContext('Account temporarily locked due to security policy');
    }

    // 3. Validate admin email with timing-safe comparison
    const adminEmail = process.env.ADMIN_EMAIL;
    const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').filter(Boolean);
    const operatorAdminEmails = (process.env.OPERATOR_ADMIN_EMAILS || '').split(',').filter(Boolean);
    
    if (!adminEmail && superAdminEmails.length === 0) {
      adminSecurityLogger.error('No admin emails configured in environment');
      await logSecurityEvent('ADMIN_CONFIG_ERROR', { ...securityCheck, reason: 'no_admin_configured' });
      return createDeniedContext('Admin access not configured');
    }

    const adminLevel = determineAdminLevel(securityCheck.userEmail, {
      primaryAdmin: adminEmail,
      superAdmins: superAdminEmails,
      operators: operatorAdminEmails
    });

    if (adminLevel === 'NONE') {
      await incrementFailedAttempts(user.id);
      await logSecurityEvent('ADMIN_ACCESS_DENIED', { 
        ...securityCheck, 
        reason: 'not_admin_email',
        emailHash: await createHashSHA256(securityCheck.userEmail, 8)
      });
      return createDeniedContext('Insufficient privileges');
    }

    // 4. Check if user has required admin level
    if (!hasRequiredAdminLevel(adminLevel, requiredLevel)) {
      await logSecurityEvent('ADMIN_INSUFFICIENT_LEVEL', { 
        ...securityCheck, 
        currentLevel: adminLevel,
        requiredLevel
      });
      return createDeniedContext(`Requires ${requiredLevel} privileges`);
    }

    // 5. Check session validity and activity timeout
    const sessionStatus = await validateAdminSession(user.id);
    if (!sessionStatus.valid) {
      await logSecurityEvent('ADMIN_SESSION_INVALID', { 
        ...securityCheck, 
        reason: sessionStatus.reason,
        lastActivity: sessionStatus.lastActivity
      });
      return createDeniedContext('Session expired or invalid');
    }

    // 6. Check if MFA is required for this action
    const mfaRequired = action && ADMIN_ACTIONS_REQUIRING_MFA.includes(action);
    if (mfaRequired) {
      const mfaStatus = await validateAdminMFA(user.id, action);
      if (!mfaStatus.valid) {
        await logSecurityEvent('ADMIN_MFA_REQUIRED', { 
          ...securityCheck, 
          action,
          mfaStatus: mfaStatus.status
        });
        return {
          isAdmin: true,
          adminLevel,
          sessionValid: true,
          mfaRequired: true,
          lastActivity: sessionStatus.lastActivity!,
          securityWarnings: [`MFA required for action: ${action}`]
        };
      }
    }

    // 7. Update session activity
    await updateAdminActivity(user.id, securityCheck.ipAddress, securityCheck.userAgent);

    // 8. Log successful admin access
    await logSecurityEvent('ADMIN_ACCESS_GRANTED', {
      ...securityCheck,
      adminLevel,
      requiredLevel,
      sessionAge: Date.now() - (sessionStatus.lastActivity?.getTime() || Date.now())
    });

    // 9. Check for security warnings
    const securityWarnings = await getAdminSecurityWarnings(user.id, securityCheck);

    return {
      isAdmin: true,
      adminLevel,
      sessionValid: true,
      mfaRequired: false,
      lastActivity: sessionStatus.lastActivity!,
      securityWarnings
    };

  } catch (error) {
    adminSecurityLogger.error('Admin access validation failed', { error, securityCheck });
    await logSecurityEvent('ADMIN_VALIDATION_ERROR', { 
      ...securityCheck, 
      error: error instanceof Error ? error.message : 'unknown'
    });
    
    return createDeniedContext('Security validation failed');
  }
}

/**
 * Determine admin level based on email configuration
 */
function determineAdminLevel(
  userEmail: string, 
  config: {
    primaryAdmin?: string;
    superAdmins: string[];
    operators: string[];
  }
): 'NONE' | 'READ_ONLY' | 'OPERATOR' | 'SUPER_ADMIN' {
  if (!userEmail) return 'NONE';
  
  // Timing-safe email comparison
  const safeCompare = (email1: string, email2: string): boolean => {
    if (!email1 || !email2 || email1.length !== email2.length) return false;
    
    const buffer1 = Buffer.from(email1.toLowerCase(), 'utf8');
    const buffer2 = Buffer.from(email2.toLowerCase(), 'utf8');
    
    // Timing-safe comparison using manual implementation
    if (buffer1.length !== buffer2.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < buffer1.length; i++) {
      result |= buffer1[i] ^ buffer2[i];
    }
    return result === 0;
  };

  // Check super admin (highest level)
  if (config.primaryAdmin && safeCompare(userEmail, config.primaryAdmin)) {
    return 'SUPER_ADMIN';
  }
  
  for (const email of config.superAdmins) {
    if (safeCompare(userEmail, email)) {
      return 'SUPER_ADMIN';
    }
  }
  
  // Check operator admin
  for (const email of config.operators) {
    if (safeCompare(userEmail, email)) {
      return 'OPERATOR';
    }
  }
  
  return 'NONE';
}

/**
 * Check if user has required admin level
 */
function hasRequiredAdminLevel(
  currentLevel: string, 
  requiredLevel: string
): boolean {
  const levels = {
    'READ_ONLY': 1,
    'OPERATOR': 2,
    'SUPER_ADMIN': 3
  };
  
  return (levels[currentLevel as keyof typeof levels] || 0) >= 
         (levels[requiredLevel as keyof typeof levels] || 999);
}

/**
 * Additional utility functions would be implemented here:
 * - checkAdminLockout()
 * - validateAdminSession() 
 * - validateAdminMFA()
 * - updateAdminActivity()
 * - getAdminSecurityWarnings()
 * - logSecurityEvent()
 * - incrementFailedAttempts()
 * - getClientIP()
 * - createDeniedContext()
 */

function createDeniedContext(reason: string): AdminContext {
  return {
    isAdmin: false,
    adminLevel: 'NONE',
    sessionValid: false,
    mfaRequired: false,
    lastActivity: new Date(),
    securityWarnings: [reason]
  };
}

function getClientIP(request: Request): string {
  // Extract IP from various headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const remoteAddr = request.headers.get('remote-addr');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  return realIP || remoteAddr || 'unknown';
}

// Stub implementations - would need to be fully implemented
async function checkAdminLockout(_userId: string) {
  return { isLocked: false, unlockTime: null };
}

async function validateAdminSession(_userId: string) {
  return { valid: true, reason: null, lastActivity: new Date() };
}

async function validateAdminMFA(_userId: string, _action?: string) {
  return { valid: true, status: 'not_required' };
}

async function updateAdminActivity(_userId: string, _ip: string, _userAgent: string) {
  // Implementation would update admin session tracking
}

async function getAdminSecurityWarnings(userId: string, securityCheck: AdminSecurityCheck) {
  const warnings: string[] = [];
  
  // Check for suspicious patterns
  if (securityCheck.userAgent.includes('bot') || securityCheck.userAgent.includes('crawler')) {
    warnings.push('Unusual user agent detected');
  }
  
  return warnings;
}

async function logSecurityEvent(event: string, data: Record<string, unknown>) {
  try {
    // Only log audit events if we have a valid userId
    // Security events without authenticated users will be logged via the logger only
    if (!data.userId) {
      adminSecurityLogger.info('Security event (unauthenticated)', { event, ...data });
      return;
    }

    // Verify user exists in database before creating audit log
    // This prevents foreign key constraint violations when Clerk users
    // exist in authentication but haven't been synced to database yet
    const userExists = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true }
    });

    if (!userExists) {
      adminSecurityLogger.warn('Cannot create audit log - user not found in database', { 
        event, 
        userId: data.userId,
        userIdHash: await createHashSHA256(data.userId, 8)
      });
      // Still log the security event via logger for monitoring
      adminSecurityLogger.info('Security event (user not in database)', { event, ...data });
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: event,
        details: data,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        success: !event.includes('FAILED') && !event.includes('DENIED') && !event.includes('ERROR'),
        errorMessage: data.error || data.reason || null
      }
    });
  } catch (error) {
    adminSecurityLogger.error('Failed to log security event', { error, event, data });
  }
}

async function incrementFailedAttempts(_userId: string) {
  // Implementation would track failed admin access attempts
}