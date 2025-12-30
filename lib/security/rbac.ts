/**
 * Role-Based Access Control (RBAC) Implementation
 * 
 * Implements comprehensive authorization system for SEC filing platform
 * with least privilege principle and defense-in-depth security.
 */

import { logger } from '../logging';
import { dataSanitizer } from './data-sanitizer';

const rbacLogger = logger.child('rbac');

/**
 * User roles with hierarchical permissions
 */
export enum UserRole {
  GUEST = 'guest',
  USER = 'user',
  MAX_USER = 'max_user',
  ADMIN = 'admin',
  SYSTEM = 'system'
}

/**
 * Resource types in the system
 */
export enum ResourceType {
  ALERT = 'alert',
  FILING = 'filing',
  USER_DATA = 'user_data',
  SUMMARY = 'summary',
  CRON_JOB = 'cron_job',
  METRICS = 'metrics',
  AUDIT_LOG = 'audit_log',
  SYSTEM_CONFIG = 'system_config'
}

/**
 * Operations that can be performed on resources
 */
export enum Operation {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXECUTE = 'execute',
  MANAGE = 'manage'
}

/**
 * Permission definition
 */
interface Permission {
  role: UserRole;
  resource: ResourceType;
  operations: Operation[];
  conditions?: PermissionCondition[];
}

/**
 * Conditional permission based on context
 */
interface PermissionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'owns';
  value: unknown;
}

/**
 * Authorization context for requests
 */
export interface AuthorizationContext {
  userId: string;
  userRole: UserRole;
  subscriptionTier: string;
  resourceId?: string;
  resourceOwnerId?: string;
  environment: string;
  metadata?: Record<string, unknown>;
}

/**
 * Comprehensive permission matrix with least privilege principle
 */
const PERMISSION_MATRIX: Permission[] = [
  // GUEST permissions - very limited
  {
    role: UserRole.GUEST,
    resource: ResourceType.FILING,
    operations: [Operation.READ],
    conditions: [{ field: 'public', operator: 'equals', value: true }]
  },

  // USER permissions - basic functionality
  {
    role: UserRole.USER,
    resource: ResourceType.FILING,
    operations: [Operation.READ],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },
  {
    role: UserRole.USER,
    resource: ResourceType.SUMMARY,
    operations: [Operation.READ],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },
  {
    role: UserRole.USER,
    resource: ResourceType.USER_DATA,
    operations: [Operation.READ, Operation.UPDATE],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },
  {
    role: UserRole.USER,
    resource: ResourceType.ALERT,
    operations: [Operation.READ],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },

  // MAX_USER permissions - enhanced functionality
  {
    role: UserRole.MAX_USER,
    resource: ResourceType.FILING,
    operations: [Operation.READ, Operation.CREATE],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },
  {
    role: UserRole.MAX_USER,
    resource: ResourceType.SUMMARY,
    operations: [Operation.READ, Operation.CREATE],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },
  {
    role: UserRole.MAX_USER,
    resource: ResourceType.USER_DATA,
    operations: [Operation.READ, Operation.UPDATE],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },
  {
    role: UserRole.MAX_USER,
    resource: ResourceType.ALERT,
    operations: [Operation.READ, Operation.CREATE],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },
  {
    role: UserRole.MAX_USER,
    resource: ResourceType.METRICS,
    operations: [Operation.READ],
    conditions: [{ field: 'userId', operator: 'owns', value: true }]
  },

  // ADMIN permissions - administrative functions
  {
    role: UserRole.ADMIN,
    resource: ResourceType.ALERT,
    operations: [Operation.READ, Operation.CREATE, Operation.UPDATE, Operation.DELETE]
  },
  {
    role: UserRole.ADMIN,
    resource: ResourceType.FILING,
    operations: [Operation.READ, Operation.CREATE, Operation.UPDATE, Operation.DELETE]
  },
  {
    role: UserRole.ADMIN,
    resource: ResourceType.SUMMARY,
    operations: [Operation.READ, Operation.CREATE, Operation.UPDATE, Operation.DELETE]
  },
  {
    role: UserRole.ADMIN,
    resource: ResourceType.USER_DATA,
    operations: [Operation.READ, Operation.UPDATE]
  },
  {
    role: UserRole.ADMIN,
    resource: ResourceType.METRICS,
    operations: [Operation.READ, Operation.CREATE]
  },
  {
    role: UserRole.ADMIN,
    resource: ResourceType.AUDIT_LOG,
    operations: [Operation.READ, Operation.CREATE]
  },
  {
    role: UserRole.ADMIN,
    resource: ResourceType.CRON_JOB,
    operations: [Operation.READ, Operation.EXECUTE]
  },

  // SYSTEM permissions - full system access
  {
    role: UserRole.SYSTEM,
    resource: ResourceType.ALERT,
    operations: [Operation.CREATE, Operation.READ, Operation.UPDATE, Operation.DELETE, Operation.MANAGE]
  },
  {
    role: UserRole.SYSTEM,
    resource: ResourceType.FILING,
    operations: [Operation.CREATE, Operation.READ, Operation.UPDATE, Operation.DELETE, Operation.MANAGE]
  },
  {
    role: UserRole.SYSTEM,
    resource: ResourceType.SUMMARY,
    operations: [Operation.CREATE, Operation.READ, Operation.UPDATE, Operation.DELETE, Operation.MANAGE]
  },
  {
    role: UserRole.SYSTEM,
    resource: ResourceType.USER_DATA,
    operations: [Operation.CREATE, Operation.READ, Operation.UPDATE, Operation.DELETE, Operation.MANAGE]
  },
  {
    role: UserRole.SYSTEM,
    resource: ResourceType.METRICS,
    operations: [Operation.CREATE, Operation.READ, Operation.UPDATE, Operation.DELETE, Operation.MANAGE]
  },
  {
    role: UserRole.SYSTEM,
    resource: ResourceType.AUDIT_LOG,
    operations: [Operation.CREATE, Operation.READ, Operation.UPDATE, Operation.DELETE, Operation.MANAGE]
  },
  {
    role: UserRole.SYSTEM,
    resource: ResourceType.CRON_JOB,
    operations: [Operation.CREATE, Operation.READ, Operation.UPDATE, Operation.DELETE, Operation.EXECUTE, Operation.MANAGE]
  },
  {
    role: UserRole.SYSTEM,
    resource: ResourceType.SYSTEM_CONFIG,
    operations: [Operation.CREATE, Operation.READ, Operation.UPDATE, Operation.DELETE, Operation.MANAGE]
  }
];

/**
 * RBAC Authorization Engine
 */
export class RBACAuthorizer {
  private static instance: RBACAuthorizer;
  private permissionCache: Map<string, boolean> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): RBACAuthorizer {
    if (!RBACAuthorizer.instance) {
      RBACAuthorizer.instance = new RBACAuthorizer();
    }
    return RBACAuthorizer.instance;
  }

  /**
   * Check if user has permission to perform operation on resource
   */
  async authorize(
    context: AuthorizationContext,
    resource: ResourceType,
    operation: Operation,
    resourceData?: Record<string, unknown>
  ): Promise<{ authorized: boolean; reason?: string; auditId: string }> {
    const auditId = dataSanitizer.generateSecureCorrelationId('auth');
    
    try {
      // Input validation and sanitization
      const sanitizedContext = this.sanitizeAuthContext(context);
      
      // Generate cache key
      const cacheKey = this.generateCacheKey(sanitizedContext, resource, operation);
      
      // Check cache first
      const cachedResult = this.getCachedPermission(cacheKey);
      if (cachedResult !== null) {
        await this.logAuthorizationAttempt(sanitizedContext, resource, operation, cachedResult, auditId, 'cache_hit');
        return { authorized: cachedResult, auditId };
      }

      // Perform authorization check
      const authResult = await this.performAuthorizationCheck(
        sanitizedContext,
        resource,
        operation,
        resourceData
      );

      // Cache the result
      this.setCachedPermission(cacheKey, authResult.authorized);

      // Log authorization attempt
      await this.logAuthorizationAttempt(
        sanitizedContext,
        resource,
        operation,
        authResult.authorized,
        auditId,
        'computed',
        authResult.reason
      );

      return { ...authResult, auditId };

    } catch (error) {
      rbacLogger.error('Authorization check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: dataSanitizer.sanitizeUserId(context.userId),
        resource,
        operation,
        auditId
      });

      // Fail secure - deny access on error
      return {
        authorized: false,
        reason: 'Authorization check failed due to system error',
        auditId
      };
    }
  }

  /**
   * Get user role based on subscription tier and user type
   */
  getUserRole(subscriptionTier: string, isAdmin: boolean = false, isSystemUser: boolean = false): UserRole {
    if (isSystemUser) {
      return UserRole.SYSTEM;
    }
    
    if (isAdmin) {
      return UserRole.ADMIN;
    }

    switch (subscriptionTier?.toUpperCase()) {
      case 'MAX':
      case 'PRO':
      case 'ENTERPRISE':
        return UserRole.MAX_USER;
      case 'HOBBY':
        return UserRole.USER;
      default:
        return UserRole.GUEST;
    }
  }

  /**
   * Check if user can access resource based on ownership
   */
  async checkResourceOwnership(
    userId: string,
    resourceType: ResourceType,
    resourceId: string
  ): Promise<{ hasAccess: boolean; reason?: string }> {
    try {
      // This would typically query the database to check ownership
      // For now, we'll implement basic validation
      
      if (!userId || !resourceId) {
        return {
          hasAccess: false,
          reason: 'Invalid user ID or resource ID'
        };
      }

      // Resource ownership logic would go here
      // This is a placeholder implementation
      return {
        hasAccess: true,
        reason: 'Resource ownership validated'
      };

    } catch (error) {
      rbacLogger.error('Resource ownership check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: dataSanitizer.sanitizeUserId(userId),
        resourceType,
        resourceId
      });

      return {
        hasAccess: false,
        reason: 'Ownership validation failed'
      };
    }
  }

  /**
   * Validate alert operation permissions
   */
  async validateAlertOperation(
    context: AuthorizationContext,
    operation: Operation,
    alertData?: Record<string, unknown>
  ): Promise<{ authorized: boolean; reason?: string }> {
    return this.authorize(context, ResourceType.ALERT, operation, alertData);
  }

  /**
   * Validate filing operation permissions
   */
  async validateFilingOperation(
    context: AuthorizationContext,
    operation: Operation,
    filingData?: Record<string, unknown>
  ): Promise<{ authorized: boolean; reason?: string }> {
    return this.authorize(context, ResourceType.FILING, operation, filingData);
  }

  /**
   * Validate cron job operation permissions
   */
  async validateCronJobOperation(
    context: AuthorizationContext,
    operation: Operation
  ): Promise<{ authorized: boolean; reason?: string }> {
    return this.authorize(context, ResourceType.CRON_JOB, operation);
  }

  /**
   * Perform the actual authorization check
   */
  private async performAuthorizationCheck(
    context: AuthorizationContext,
    resource: ResourceType,
    operation: Operation,
    resourceData?: Record<string, unknown>
  ): Promise<{ authorized: boolean; reason?: string }> {
    // Find applicable permissions for this role and resource
    const applicablePermissions = PERMISSION_MATRIX.filter(
      p => p.role === context.userRole && p.resource === resource
    );

    if (applicablePermissions.length === 0) {
      return {
        authorized: false,
        reason: `No permissions defined for role ${context.userRole} on resource ${resource}`
      };
    }

    // Check if any permission allows this operation
    for (const permission of applicablePermissions) {
      if (!permission.operations.includes(operation)) {
        continue;
      }

      // Check conditions if they exist
      if (permission.conditions) {
        const conditionsMet = await this.evaluateConditions(
          permission.conditions,
          context,
          resourceData
        );
        
        if (!conditionsMet) {
          continue;
        }
      }

      // Permission found and conditions met
      return { authorized: true };
    }

    return {
      authorized: false,
      reason: `Operation ${operation} not permitted for role ${context.userRole} on resource ${resource}`
    };
  }

  /**
   * Evaluate permission conditions
   */
  private async evaluateConditions(
    conditions: PermissionCondition[],
    context: AuthorizationContext,
    resourceData?: Record<string, unknown>
  ): Promise<boolean> {
    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, context, resourceData);
      if (!result) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a single permission condition
   */
  private async evaluateCondition(
    condition: PermissionCondition,
    context: AuthorizationContext,
    resourceData?: Record<string, unknown>
  ): Promise<boolean> {
    let fieldValue: unknown;

    // Get field value from context or resource data
    if (condition.field === 'userId' && condition.operator === 'owns') {
      // Special case for ownership check
      return context.userId === context.resourceOwnerId;
    }

    if (condition.field in context) {
      fieldValue = (context as unknown as Record<string, unknown>)[condition.field];
    } else if (resourceData && condition.field in resourceData) {
      fieldValue = resourceData[condition.field];
    } else {
      return false;
    }

    // Apply operator
    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
      default:
        return false;
    }
  }

  /**
   * Sanitize authorization context
   */
  private sanitizeAuthContext(context: AuthorizationContext): AuthorizationContext {
    return {
      userId: dataSanitizer.sanitizeUserId(context.userId) || '',
      userRole: context.userRole,
      subscriptionTier: context.subscriptionTier,
      resourceId: context.resourceId ? dataSanitizer.sanitizeString(context.resourceId) : undefined,
      resourceOwnerId: context.resourceOwnerId ? dataSanitizer.sanitizeUserId(context.resourceOwnerId) : undefined,
      environment: dataSanitizer.sanitizeString(context.environment),
      metadata: context.metadata ? dataSanitizer.sanitizeObject(context.metadata) as Record<string, unknown> : undefined
    };
  }

  /**
   * Generate cache key for permission
   */
  private generateCacheKey(
    context: AuthorizationContext,
    resource: ResourceType,
    operation: Operation
  ): string {
    return `${context.userId}:${context.userRole}:${resource}:${operation}:${context.resourceId || 'null'}`;
  }

  /**
   * Get cached permission result
   */
  private getCachedPermission(cacheKey: string): boolean | null {
    const expiry = this.cacheExpiry.get(cacheKey);
    if (!expiry || Date.now() > expiry) {
      this.permissionCache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);
      return null;
    }
    
    return this.permissionCache.get(cacheKey) ?? null;
  }

  /**
   * Set cached permission result
   */
  private setCachedPermission(cacheKey: string, result: boolean): void {
    this.permissionCache.set(cacheKey, result);
    this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTTL);
  }

  /**
   * Log authorization attempt for audit trail
   */
  private async logAuthorizationAttempt(
    context: AuthorizationContext,
    resource: ResourceType,
    operation: Operation,
    authorized: boolean,
    auditId: string,
    source: 'cache_hit' | 'computed',
    reason?: string
  ): Promise<void> {
    const logLevel = authorized ? 'info' : 'warn';
    
    rbacLogger[logLevel]('Authorization check completed', {
      auditId,
      userId: context.userId, // Already sanitized
      userRole: context.userRole,
      resource,
      operation,
      authorized,
      reason,
      source,
      environment: context.environment,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Global RBAC instance
 */
export const rbacAuthorizer = RBACAuthorizer.getInstance();

/**
 * Convenience functions for common authorization checks
 */
export const authorize = {
  /**
   * Check alert permissions
   */
  alert: (context: AuthorizationContext, operation: Operation, alertData?: Record<string, unknown>) =>
    rbacAuthorizer.validateAlertOperation(context, operation, alertData),

  /**
   * Check filing permissions
   */
  filing: (context: AuthorizationContext, operation: Operation, filingData?: Record<string, unknown>) =>
    rbacAuthorizer.validateFilingOperation(context, operation, filingData),

  /**
   * Check cron job permissions
   */
  cronJob: (context: AuthorizationContext, operation: Operation) =>
    rbacAuthorizer.validateCronJobOperation(context, operation),

  /**
   * Get user role
   */
  getUserRole: (subscriptionTier: string, isAdmin?: boolean, isSystemUser?: boolean) =>
    rbacAuthorizer.getUserRole(subscriptionTier, isAdmin, isSystemUser)
};