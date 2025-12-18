/**
 * Slack User Authorization
 *
 * Handles user authorization checks for pipeline data access.
 * Implements role-based access control for sensitive pipeline information.
 */

import { logger } from '../logging';

const authLogger = logger.child('slack-auth');

// =============================================================================
// Authorization Configuration
// =============================================================================

interface UserRole {
  userId: string;
  email?: string;
  role: 'admin' | 'viewer' | 'developer';
  permissions: Permission[];
}

type Permission = 
  | 'view_pipeline_status'
  | 'view_failure_details'
  | 'view_cost_data'
  | 'view_daily_reports'
  | 'view_user_data';

// Authorized users configuration
// TODO: Move to database for production scalability
const AUTHORIZED_USERS: UserRole[] = [
  // Add authorized users here based on Slack user IDs
  // Example: { userId: 'U1234567890', email: 'admin@example.com', role: 'admin', permissions: ['view_pipeline_status', 'view_failure_details', 'view_cost_data', 'view_daily_reports', 'view_user_data'] }
];

// Default permissions by role
const ROLE_PERMISSIONS: Record<UserRole['role'], Permission[]> = {
  admin: ['view_pipeline_status', 'view_failure_details', 'view_cost_data', 'view_daily_reports', 'view_user_data'],
  developer: ['view_pipeline_status', 'view_failure_details', 'view_daily_reports'],
  viewer: ['view_pipeline_status'],
};

// =============================================================================
// Authorization Functions
// =============================================================================

/**
 * Get user role and permissions by Slack user ID
 */
function getUserRole(userId: string): UserRole | null {
  const user = AUTHORIZED_USERS.find(u => u.userId === userId);
  if (!user) {
    authLogger.warn('Unauthorized user attempted access', { userId });
    return null;
  }
  return user;
}

/**
 * Check if user has specific permission
 */
export function hasPermission(userId: string, permission: Permission): boolean {
  const user = getUserRole(userId);
  if (!user) {
    return false;
  }

  // Check explicit permissions or role-based permissions
  const hasExplicitPermission = user.permissions.includes(permission);
  const hasRolePermission = ROLE_PERMISSIONS[user.role].includes(permission);

  const authorized = hasExplicitPermission || hasRolePermission;
  
  authLogger.info('Permission check', {
    userId,
    permission,
    role: user.role,
    authorized,
  });

  return authorized;
}

/**
 * Check if user is authorized for any pipeline access
 */
export function isAuthorizedUser(userId: string): boolean {
  const user = getUserRole(userId);
  return user !== null;
}

/**
 * Get authorization error message for unauthorized users
 */
export function getAuthorizationErrorMessage(): string {
  return '🔒 You are not authorized to access pipeline data. Please contact your administrator for access.';
}

/**
 * Get permission-specific error message
 */
export function getPermissionErrorMessage(permission: Permission): string {
  const permissionDescriptions: Record<Permission, string> = {
    'view_pipeline_status': 'view pipeline status',
    'view_failure_details': 'view failure details',
    'view_cost_data': 'view cost data',
    'view_daily_reports': 'view daily reports',
    'view_user_data': 'view user data',
  };

  return `🚫 You don't have permission to ${permissionDescriptions[permission]}. Contact your administrator for access.`;
}

/**
 * Add a new authorized user (for dynamic authorization)
 * TODO: Implement database persistence
 */
export function addAuthorizedUser(userId: string, email: string, role: UserRole['role']): boolean {
  try {
    const permissions = ROLE_PERMISSIONS[role];
    const newUser: UserRole = {
      userId,
      email,
      role,
      permissions,
    };

    // Check if user already exists
    const existingIndex = AUTHORIZED_USERS.findIndex(u => u.userId === userId);
    if (existingIndex >= 0) {
      AUTHORIZED_USERS[existingIndex] = newUser;
      authLogger.info('Updated existing user authorization', { userId, role });
    } else {
      AUTHORIZED_USERS.push(newUser);
      authLogger.info('Added new authorized user', { userId, role });
    }

    return true;
  } catch (error) {
    authLogger.error('Failed to add authorized user', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      role,
    });
    return false;
  }
}

/**
 * Middleware function to check authorization before processing commands
 */
export function requireAuthorization(userId: string, permission: Permission): { authorized: boolean; errorMessage?: string } {
  if (!isAuthorizedUser(userId)) {
    return {
      authorized: false,
      errorMessage: getAuthorizationErrorMessage(),
    };
  }

  if (!hasPermission(userId, permission)) {
    return {
      authorized: false,
      errorMessage: getPermissionErrorMessage(permission),
    };
  }

  return { authorized: true };
}